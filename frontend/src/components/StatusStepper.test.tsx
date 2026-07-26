import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusStepper } from './StatusStepper'

function stateOf(label: string) {
  return screen.getByText(label).closest('li')?.getAttribute('data-state')
}

describe('StatusStepper', () => {
  it('shows the first step as current and the rest upcoming for a brand-new draft', () => {
    render(<StatusStepper status="pending_generation" />)

    expect(stateOf('Brief')).toBe('current')
    expect(stateOf('Generated')).toBe('upcoming')
    expect(stateOf('Launched')).toBe('upcoming')
  })

  it('marks everything before the current step complete', () => {
    render(<StatusStepper status="client_approved" />)

    expect(stateOf('Brief')).toBe('complete')
    expect(stateOf('Generated')).toBe('complete')
    expect(stateOf('Guardrails')).toBe('complete')
    expect(stateOf('Your approval')).toBe('complete')
    expect(stateOf('Client approval')).toBe('complete')
    expect(stateOf('Launched')).toBe('current')
  })

  it('marks every step complete once launched', () => {
    render(<StatusStepper status="launched" />)

    expect(stateOf('Launched')).toBe('complete')
  })

  it('shows an error at the step where the agency rejected it, not the whole pipeline', () => {
    render(<StatusStepper status="rejected" />)

    expect(stateOf('Guardrails')).toBe('complete')
    expect(stateOf('Your approval')).toBe('error')
    expect(stateOf('Client approval')).toBe('upcoming')
  })

  it('shows an error at the client-rejected step', () => {
    render(<StatusStepper status="client_rejected" />)

    expect(stateOf('Your approval')).toBe('complete')
    expect(stateOf('Client approval')).toBe('error')
    expect(stateOf('Launched')).toBe('upcoming')
  })

  it('shows an error at the launch step for a failed launch, with everything before it complete', () => {
    render(<StatusStepper status="failed" />)

    expect(stateOf('Client approval')).toBe('complete')
    expect(stateOf('Launched')).toBe('error')
  })
})
