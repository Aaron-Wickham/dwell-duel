// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DevicePush } from '@/lib/push/use-device-push'

const dismissOnboardingAction = vi.fn(async () => {})
vi.mock('@/lib/home/dismiss-onboarding', () => ({ dismissOnboardingAction: () => dismissOnboardingAction() }))
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
    expect(within(step('Learn how DwellDuel works')).getByRole('link', { name: 'Read' })).toHaveAttribute('href', '/how-it-works')
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
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(dismissOnboardingAction).toHaveBeenCalledOnce()
    expect(screen.queryByRole('region', { name: 'Getting started' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })
})
