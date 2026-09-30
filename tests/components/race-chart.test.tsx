// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RaceChart } from '@/components/leaderboard/race-chart'
import type { RaceSeries } from '@/lib/social/leaderboard-extras'

// Recharts renders nothing until ResponsiveContainer measures a positive size, and jsdom has no layout.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

// Midday Eastern on Sep 3, then an hour apart.
const series = (name: string, profits: number[]): RaceSeries => ({
  id: name,
  name,
  points: profits.map((profit, i) => ({ at: new Date(Date.UTC(2026, 8, 3, 16 + i)).toISOString(), profit })),
  final: profits.at(-1) ?? 0,
})

const labelTop = (name: string) => Number.parseFloat(screen.getByText(name).closest('li')!.style.getPropertyValue('--label-top'))

describe('RaceChart', () => {
  it('describes the standings to assistive tech and labels each line’s end with the name and total', () => {
    render(<RaceChart series={[series('Aaron', [0, 30, 64]), series('Maci', [0, 10, 41]), series('Py', [0, -3, -3])]} />)
    expect(screen.getByRole('slider', { name: 'Net betting profit this month: Aaron +64 DC, Maci +41 DC, Py −3 DC' })).toBeInTheDocument()
    expect(screen.getByText('Aaron')).toBeInTheDocument()
    expect(screen.getByText('−3 DC')).toBeInTheDocument()
  })

  it('starts the axis at the first settled bet, not the 1st of the month', () => {
    render(<RaceChart series={[series('Ada', [0, 10]), series('Ben', [0, 5])]} />)
    expect(screen.getByText('Sep 3')).toBeInTheDocument()
    expect(screen.getByText('Now')).toBeInTheDocument()
    expect(screen.queryByText('Sep 1')).toBeNull()
  })

  it('pushes labels for lines that end together apart', () => {
    render(<RaceChart series={['Ada', 'Ben', 'Cy', 'Di', 'Eve'].map((n) => series(n, [0, 10]))} />)
    const tops = ['Ada', 'Ben', 'Cy', 'Di', 'Eve'].map(labelTop).sort((a, b) => a - b)
    expect(new Set(tops).size).toBe(5)
    expect(Math.min(...tops.slice(1).map((t, i) => t - tops[i]))).toBeGreaterThanOrEqual(39.9)
  })

  it('runs a runaway leader off the top, still labelled with the true total, and says so', () => {
    render(
      <RaceChart
        series={[series('Aaron', [0, 20, 868]), series('Maci', [0, 40, 40]), series('Py', [0, 10, 30]), series('Jo', [0, -10, -20])]}
      />,
    )
    expect(screen.getByText('+868 DC')).toBeInTheDocument()
    expect(screen.getByTestId('race-off-top')).toBeInTheDocument()
    expect(screen.getByTestId('race-exit')).toBeInTheDocument()
    expect(screen.getByText('Aaron is off the top at +868 DC, so everyone else stays readable.')).toBeInTheDocument()
    expect(labelTop('Aaron')).toBeLessThan(labelTop('Maci'))
  })

  it('runs a runaway last place off the bottom, still labelled with the true total, and says so', () => {
    render(
      <RaceChart
        series={[series('Maci', [0, 40, 40]), series('Py', [0, 10, 30]), series('Aaron', [0, -20, -20]), series('Jo', [0, -30, -868])]}
      />,
    )
    expect(screen.getByText('−868 DC')).toBeInTheDocument()
    expect(screen.getByTestId('race-off-bottom')).toBeInTheDocument()
    expect(screen.getByTestId('race-exit-bottom')).toBeInTheDocument()
    expect(screen.queryByTestId('race-exit')).toBeNull()
    expect(screen.getByText('Jo is off the bottom at −868 DC, so everyone else stays readable.')).toBeInTheDocument()
    expect(labelTop('Jo')).toBeGreaterThan(labelTop('Aaron'))
  })

  it('names both runaways in one note when each end is clipped', () => {
    render(<RaceChart series={[series('Ada', [0, 900]), series('Ben', [0, 10]), series('Cy', [0, 5]), series('Di', [0, -800])]} />)
    expect(
      screen.getByText('Ada is off the top at +900 DC and Di is off the bottom at −800 DC, so everyone else stays readable.'),
    ).toBeInTheDocument()
  })

  it('draws no clipping cue when nobody runs away', () => {
    render(<RaceChart series={[series('Ada', [0, 30]), series('Ben', [0, 20])]} />)
    expect(screen.queryByTestId('race-exit')).toBeNull()
    expect(screen.queryByTestId('race-exit-bottom')).toBeNull()
    expect(screen.queryByText(/off the (top|bottom)/)).toBeNull()
  })

  describe('from the keyboard', () => {
    // Four moments plus now: step 0 before the first settlement, step 4 now.
    const race = [series('Aaron', [-5, 10, 10, 64]), series('Maci', [0, 30, 35, 41]), series('Py', [0, 0, -3, -3])]
    const announcer = () => screen.getByTestId('race-announcer')

    it('is a slider over the moments that starts at now and says nothing until stepped', async () => {
      const user = userEvent.setup()
      render(<RaceChart series={race} />)
      await user.tab()
      const slider = screen.getByRole('slider')
      expect(slider).toHaveFocus()
      expect(slider).toHaveAttribute('aria-valuemin', '0')
      expect(slider).toHaveAttribute('aria-valuemax', '4')
      expect(slider).toHaveAttribute('aria-valuenow', '4')
      expect(slider).toHaveAttribute('aria-valuetext', 'Now')
      expect(announcer()).toHaveAttribute('aria-live', 'polite')
      expect(announcer()).toHaveTextContent(/^$/)
      expect(screen.queryByTestId('race-key-readout')).toBeNull()
    })

    it('steps with the arrow keys and announces everyone’s total at each moment, best first', async () => {
      const user = userEvent.setup()
      render(<RaceChart series={race} />)
      await user.tab()
      const slider = screen.getByRole('slider')

      await user.keyboard('{ArrowLeft}')
      expect(slider).toHaveAttribute('aria-valuenow', '3')
      expect(announcer()).toHaveTextContent('Aaron +64 DC, Maci +41 DC, Py −3 DC')

      await user.keyboard('{ArrowLeft}{ArrowLeft}')
      expect(slider).toHaveAttribute('aria-valuenow', '1')
      expect(announcer()).toHaveTextContent('Maci +30 DC, Aaron +10 DC, Py 0 DC')
      // The same readout hover shows, for sighted keyboard users.
      expect(within(screen.getByTestId('race-key-readout')).getByText('+30 DC')).toBeInTheDocument()

      await user.keyboard('{ArrowUp}')
      expect(slider).toHaveAttribute('aria-valuenow', '2')
      expect(announcer()).toHaveTextContent('Maci +35 DC, Aaron +10 DC, Py −3 DC')
    })

    it('goes to either end with Home and End and stops there', async () => {
      const user = userEvent.setup()
      render(<RaceChart series={race} />)
      await user.tab()
      const slider = screen.getByRole('slider')

      await user.keyboard('{Home}{ArrowLeft}{PageDown}')
      expect(slider).toHaveAttribute('aria-valuenow', '0')
      expect(slider).toHaveAttribute('aria-valuetext', 'Before the first settlement')
      expect(announcer()).toHaveTextContent('Maci 0 DC, Py 0 DC, Aaron −5 DC')

      await user.keyboard('{End}{ArrowRight}{PageUp}')
      expect(slider).toHaveAttribute('aria-valuenow', '4')
      expect(slider).toHaveAttribute('aria-valuetext', 'Now')
      expect(announcer()).toHaveTextContent('Aaron +64 DC, Maci +41 DC, Py −3 DC')
    })

    it('keeps the readout beside the cursor on the left, and pins it to the plot’s right edge past 40%', async () => {
      const user = userEvent.setup()
      render(<RaceChart series={race} />)
      await user.tab()
      const readout = () => screen.getByTestId('race-key-readout').lastElementChild as HTMLElement

      // Step 1 of 4 is 25% along: the readout sits just right of the cursor.
      await user.keyboard('{Home}{ArrowRight}')
      expect(readout()).toHaveClass('ml-3.5')
      expect(readout()).not.toHaveClass('right-0')
      expect(readout().style.left).toBe('25%')

      // Step 2 is 50% along: on a 320px phone there isn't room to its right without running under
      // the labels, so it pins to the plot's right edge instead of hanging off the cursor.
      await user.keyboard('{ArrowRight}')
      expect(readout()).toHaveClass('right-0')
      expect(readout()).not.toHaveClass('ml-3.5', '-translate-x-full')
      expect(readout().style.left).toBe('')
    })

    it('leaves modified keys to the browser', () => {
      render(<RaceChart series={race} />)
      const slider = screen.getByRole('slider')
      fireEvent.keyDown(slider, { key: 'ArrowLeft', altKey: true })
      expect(slider).toHaveAttribute('aria-valuenow', '4')
      expect(announcer()).toHaveTextContent(/^$/)
    })

    it('doesn’t trap focus, and hands the readout back when focus or the pointer moves on', async () => {
      const user = userEvent.setup()
      render(
        <>
          <RaceChart series={race} />
          <button type="button">Next</button>
        </>,
      )
      await user.tab()
      await user.keyboard('{ArrowLeft}')
      expect(screen.getByTestId('race-key-readout')).toBeInTheDocument()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus()
      expect(screen.queryByTestId('race-key-readout')).toBeNull()
      expect(announcer()).toHaveTextContent(/^$/)

      await user.tab({ shift: true })
      await user.keyboard('{ArrowLeft}')
      expect(screen.getByTestId('race-key-readout')).toBeInTheDocument()
      fireEvent.pointerMove(screen.getByRole('slider'))
      expect(screen.queryByTestId('race-key-readout')).toBeNull()
    })
  })

  it('draws a lone point as a flat line', () => {
    render(<RaceChart series={[series('Ada', [12])]} />)
    expect(screen.getByRole('slider', { name: 'Net betting profit this month: Ada +12 DC' })).toBeInTheDocument()
  })

  it('says the race hasn’t started until a bet settles', () => {
    render(<RaceChart series={[]} />)
    expect(screen.getByRole('heading', { name: 'The race' })).toBeInTheDocument()
    expect(screen.getByText('The race starts once bets settle.')).toBeInTheDocument()
    expect(screen.queryByRole('slider')).toBeNull()
  })
})
