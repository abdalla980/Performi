import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './avatar'

describe('Avatar', () => {
  it('renders an image when src is provided', () => {
    render(<Avatar src="http://localhost:8000/uploads/client-1/logo.png" name="Acme Bakery" />)

    const img = screen.getByAltText('Acme Bakery')
    expect(img).toHaveAttribute('src', 'http://localhost:8000/uploads/client-1/logo.png')
  })

  it('falls back to initials from the first two words when there is no logo', () => {
    render(<Avatar src={null} name="Acme Bakery" />)

    expect(screen.getByText('AB')).toBeInTheDocument()
  })

  it('falls back to the first two letters for a single-word name', () => {
    render(<Avatar src={null} name="Musik" />)

    expect(screen.getByText('MU')).toBeInTheDocument()
  })
})
