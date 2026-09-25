// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Card } from '@/components/ui/card'
import { StatusChip } from '@/components/ui/status-chip'
import { Message } from '@/components/ui/message'

describe('Button', () => {
  it('is a plain button by default, so it never submits a form by accident', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
  })

  it('submits when asked to', () => {
    render(<Button type="submit">Place bet</Button>)
    expect(screen.getByRole('button', { name: 'Place bet' })).toHaveAttribute('type', 'submit')
  })

  it('applies the variant and size', () => {
    render(
      <Button variant="danger" size="sm">
        Void
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Void' })
    expect(button).toHaveClass('text-loss', 'border-loss', 'min-h-11')
  })

  it('gives the quiet variant its own tighter padding', () => {
    const classes = buttonVariants({ variant: 'quiet' }).split(' ')
    expect(classes).toContain('px-2.5')
    expect(classes).not.toContain('px-5')
  })

  it('keeps every size at least 44px tall', () => {
    expect(buttonVariants({ size: 'md' })).toContain('min-h-12')
    expect(buttonVariants({ size: 'sm' })).toContain('min-h-11')
  })
})

describe('Field', () => {
  it('ties its label to the control', () => {
    render(
      <Field label="Title" htmlFor="title">
        <Input id="title" name="title" />
      </Field>,
    )
    expect(screen.getByLabelText('Title')).toHaveAttribute('name', 'title')
  })

  it('shows a hint and an error with predictable ids', () => {
    render(
      <Field label="Amount (DC)" htmlFor="amount" hint="Whole numbers only" error="Enter a positive amount">
        <Input id="amount" aria-invalid aria-describedby="amount-hint amount-error" />
      </Field>,
    )
    expect(screen.getByText('Whole numbers only')).toHaveAttribute('id', 'amount-hint')
    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Enter a positive amount')
    expect(error).toHaveAttribute('id', 'amount-error')
    expect(screen.getByLabelText('Amount (DC)')).toHaveAccessibleDescription('Whole numbers only Enter a positive amount')
  })

  it('keeps Select a native select', () => {
    render(
      <Field label="Outcome" htmlFor="outcome">
        <Select id="outcome" name="outcome_id" defaultValue="b">
          <option value="a">Yes</option>
          <option value="b">No</option>
        </Select>
      </Field>,
    )
    const select = screen.getByRole('combobox', { name: 'Outcome' })
    expect(select.tagName).toBe('SELECT')
    expect(select).toHaveValue('b')
  })

  it('renders a textarea control', () => {
    render(
      <Field label="Description" htmlFor="desc">
        <Textarea id="desc" />
      </Field>,
    )
    expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA')
  })
})

describe('Card', () => {
  it('is padded by default and can opt out', () => {
    const { rerender, container } = render(<Card>Body</Card>)
    expect(container.firstChild).toHaveClass('rounded-card', 'p-[18px]')
    rerender(<Card padded={false}>Body</Card>)
    expect(container.firstChild).not.toHaveClass('p-[18px]')
  })
})

describe('StatusChip', () => {
  it('colours itself by tone', () => {
    render(<StatusChip tone="lost">Lost</StatusChip>)
    expect(screen.getByText('Lost')).toHaveClass('bg-loss-soft', 'text-loss')
  })
})

describe('Message', () => {
  it('announces errors as alerts', () => {
    render(<Message tone="error">Insufficient balance</Message>)
    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient balance')
  })

  it('announces ok and gold messages politely', () => {
    render(
      <>
        <Message tone="ok">2 approved.</Message>
        <Message tone="gold">Awaiting resolution</Message>
      </>,
    )
    expect(screen.getAllByRole('status').map((el) => el.textContent)).toEqual(['2 approved.', 'Awaiting resolution'])
  })
})
