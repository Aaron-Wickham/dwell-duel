// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DevicePush } from '@/lib/push/use-device-push'

const dismissOnboardingAction = vi.fn(async () => {})
const restoreOnboardingAction = vi.fn(async () => {})
vi.mock('@/lib/home/dismiss-onboarding', () => ({
  dismissOnboardingAction: () => dismissOnboardingAction(),
  restoreOnboardingAction: () => restoreOnboardingAction(),
}))
type ToastOptions = { action: { label: string; onClick: () => void } }
const { toastCalls } = vi.hoisted(() => ({ toastCalls: [] as [string, ToastOptions][] }))
vi.mock('sonner', () => ({ toast: (message: string, options: ToastOptions) => toastCalls.push([message, options]) }))
let push: DevicePush = 'off'
vi.mock('@/lib/push/use-device-push', () => ({ useDevicePush: () => push }))

import { OnboardingCard } from '@/components/home/onboarding-card'

const NONE = { learn: false, photo: false, bet: false, task: false }
const ALL = { learn: true, photo: true, bet: true, task: true }

function step(name: string) {
  return screen.getByText(name).closest('li') as HTMLElement
}

beforeEach(() => {
  dismissOnboardingAction.mockClear()
  restoreOnboardingAction.mockClear()
  toastCalls.length = 0
  push = 'off'
})

describe('OnboardingCard', () => {
  it('lists five steps, How it works first, each linked to where you do it (#260)', () => {
    render(
      <>
        <h1>Welcome</h1>
        <OnboardingCard steps={NONE} />
      </>,
    )
    expect(screen.getByRole('region', { name: 'Getting started' })).toBeInTheDocument()
    expect(screen.getByText('0 of 5 done')).toBeInTheDocument()
    expect([...document.querySelectorAll('li[data-step]')].map((li) => li.getAttribute('data-step'))).toEqual([
      'learn',
      'notify',
      'photo',
      'bet',
      'task',
    ])
    expect(within(step('Learn how DwellDuel works')).getByRole('link', { name: 'Read the basics' })).toHaveAttribute('href', '/how-it-works')
    expect(within(step('Turn on notifications')).getByRole('link', { name: 'Turn on' })).toHaveAttribute(
      'href',
      '/settings#settings-notifications',
    )
    expect(within(step('Add your photo')).getByRole('link', { name: 'Add photo' })).toHaveAttribute('href', '/profile')
    expect(within(step('Place your first bet')).getByRole('link', { name: 'Find a market' })).toHaveAttribute('href', '/markets')
    expect(within(step('Try a task')).getByRole('link', { name: 'See tasks' })).toHaveAttribute('href', '/tasks')
  })

  it.each([
    ['learn', 'Learn how DwellDuel works'],
    ['photo', 'Add your photo'],
    ['bet', 'Place your first bet'],
    ['task', 'Try a task'],
  ] as const)('marks the %s step done, struck through, with no link', (key, title) => {
    render(<OnboardingCard steps={{ ...NONE, [key]: true }} />)
    expect(screen.getByText('1 of 5 done')).toBeInTheDocument()
    expect(within(step(title)).getByText('Done')).toHaveClass('sr-only')
    expect(screen.getByText(title)).toHaveClass('line-through')
    expect(within(step(title)).queryByRole('link')).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(4)
  })

  it('counts notifications done once this device has a push subscription', () => {
    push = 'on'
    render(<OnboardingCard steps={NONE} />)
    expect(screen.getByText('1 of 5 done')).toBeInTheDocument()
    expect(within(step('Turn on notifications')).queryByRole('link')).toBeNull()
  })

  it('drops the notifications step where this browser can never get push, counting four', () => {
    push = 'unsupported'
    render(<OnboardingCard steps={{ ...NONE, photo: true }} />)
    expect(screen.getByText('1 of 4 done')).toBeInTheDocument()
    expect(screen.queryByText('Turn on notifications')).toBeNull()
    expect([...document.querySelectorAll('li[data-step]')].map((li) => li.getAttribute('data-step'))).toEqual(['learn', 'photo', 'bet', 'task'])
  })

  it('hides itself there once the other four are done', () => {
    push = 'unsupported'
    const { container } = render(<OnboardingCard steps={ALL} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stays up while notifications are off on this device, even with every other step done', () => {
    render(<OnboardingCard steps={ALL} />)
    expect(screen.getByText('4 of 5 done')).toBeInTheDocument()
  })

  it('hides itself once every step is done', () => {
    push = 'on'
    const { container } = render(<OnboardingCard steps={ALL} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing once dismissed', () => {
    const { container } = render(<OnboardingCard steps={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dismisses with a real button, saving the cookie and moving focus to the heading', async () => {
    render(
      <>
        <h1>Welcome</h1>
        <OnboardingCard steps={{ ...NONE, photo: true }} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss getting started' }))
    expect(dismissOnboardingAction).toHaveBeenCalledOnce()
    expect(screen.queryByRole('region', { name: 'Getting started' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  // HOME-7: a stray tap mustn't lose the checklist for good.
  it('offers Undo in a toast, which brings the card back with focus and clears the cookie', async () => {
    render(
      <>
        <h1>Welcome</h1>
        <OnboardingCard steps={NONE} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss getting started' }))
    expect(toastCalls).toHaveLength(1)
    const [message, options] = toastCalls[0]
    expect(message).toBe('Getting started hidden')
    expect(options.action.label).toBe('Undo')

    act(() => options.action.onClick())
    expect(restoreOnboardingAction).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { name: 'Getting started' })).toHaveFocus()
  })

  // HOME-4: the count and the notifications row wait for the subscription lookup, so nothing jumps.
  it('holds the count and the notifications row while push is still being checked', () => {
    push = 'checking'
    render(<OnboardingCard steps={{ ...NONE, photo: true }} />)
    expect(screen.getByText('1 of 5 done')).toHaveClass('invisible')
    const row = document.querySelector('li[data-step="notify"]')!
    expect(row).toHaveAttribute('aria-busy', 'true')
    expect(row).toHaveClass('[&>*]:invisible')
    expect(document.querySelector('li[data-step="photo"]')).not.toHaveAttribute('aria-busy')
  })

  it('stays up while checking even when every other step is done', () => {
    push = 'checking'
    render(<OnboardingCard steps={ALL} />)
    expect(screen.getByRole('region', { name: 'Getting started' })).toBeInTheDocument()
  })

  it('names a pick, not an outcome, in the first-bet step (C-11)', () => {
    render(<OnboardingCard steps={NONE} />)
    expect(screen.getByText('Add a pick to your slip, then place it.')).toBeInTheDocument()
    expect(screen.getByText('Hear when a market you created closes and when your bets pay.')).toBeInTheDocument()
  })
})
