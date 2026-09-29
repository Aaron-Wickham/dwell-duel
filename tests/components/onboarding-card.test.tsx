// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const dismissOnboardingAction = vi.fn(async () => {})
vi.mock('@/lib/home/dismiss-onboarding', () => ({ dismissOnboardingAction: () => dismissOnboardingAction() }))

import { OnboardingCard } from '@/components/home/onboarding-card'

function step(name: string) {
  return screen.getByText(name).closest('li') as HTMLElement
}

beforeEach(() => dismissOnboardingAction.mockClear())

describe('OnboardingCard', () => {
  it('links each unfinished step to where you do it', () => {
    render(
      <>
        <h1>Welcome</h1>
        <OnboardingCard steps={{ photo: false, bet: false, task: false }} />
      </>,
    )
    expect(screen.getByRole('region', { name: 'Getting started' })).toBeInTheDocument()
    expect(screen.getByText('0 of 3 done')).toBeInTheDocument()
    expect(within(step('Add your photo')).getByRole('link', { name: 'Add photo' })).toHaveAttribute('href', '/profile')
    expect(within(step('Place your first bet')).getByRole('link', { name: 'Find a market' })).toHaveAttribute('href', '/markets')
    expect(within(step('Try a task')).getByRole('link', { name: 'See tasks' })).toHaveAttribute('href', '/tasks')
  })

  it.each([
    ['photo', 'Add your photo'],
    ['bet', 'Place your first bet'],
    ['task', 'Try a task'],
  ] as const)('marks the %s step done, with no link', (key, title) => {
    render(<OnboardingCard steps={{ photo: false, bet: false, task: false, [key]: true }} />)
    expect(screen.getByText('1 of 3 done')).toBeInTheDocument()
    expect(within(step(title)).getByText('Done')).toBeInTheDocument()
    expect(within(step(title)).queryByRole('link')).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('hides itself once every step is done', () => {
    const { container } = render(<OnboardingCard steps={{ photo: true, bet: true, task: true }} />)
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
        <OnboardingCard steps={{ photo: true, bet: false, task: false }} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(dismissOnboardingAction).toHaveBeenCalledOnce()
    expect(screen.queryByRole('region', { name: 'Getting started' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })
})
