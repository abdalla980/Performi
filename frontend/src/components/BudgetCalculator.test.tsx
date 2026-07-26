import { screen } from '@testing-library/react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BudgetCalculator } from './BudgetCalculator'

describe('BudgetCalculator', () => {
  it('is closed by default and opens on click', async () => {
    render(<BudgetCalculator onApply={vi.fn()} />)

    expect(screen.queryByLabelText(/average customer value/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /not sure how much to spend/i }))

    expect(screen.getByLabelText(/average customer value/i)).toBeInTheDocument()
  })

  it('suggests a higher budget for a higher-value service, and applies it', async () => {
    const onApply = vi.fn()
    render(<BudgetCalculator onApply={onApply} />)
    await userEvent.click(screen.getByRole('button', { name: /not sure how much to spend/i }))

    await userEvent.type(screen.getByLabelText(/average customer value/i), '1000')
    await userEvent.type(screen.getByLabelText(/new customers per month/i), '5')

    // 1000 * 0.15 * 5 = $750/month (~$25.00/day)
    expect(await screen.findByText(/\$750(\.00)?\/mo/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /use this budget/i }))
    expect(onApply).toHaveBeenCalledWith(750)
  })

  it('shows nothing computed until both inputs are filled', async () => {
    render(<BudgetCalculator onApply={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /not sure how much to spend/i }))

    await userEvent.type(screen.getByLabelText(/average customer value/i), '1000')

    expect(screen.queryByRole('button', { name: /use this budget/i })).not.toBeInTheDocument()
  })
})
