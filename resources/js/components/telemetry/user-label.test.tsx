import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { User } from '@/api/types'
import { UserLabel } from '@/components/telemetry/user-label'

const user: User = {
    id: '7',
    type: 'App\\User',
    name: 'Ada',
    email: 'ada@example.test',
}

describe('UserLabel', () => {
    it('shows the name, with the email on hover', () => {
        render(<UserLabel user={user} />)

        expect(screen.getByText('Ada')).toHaveAttribute(
            'title',
            'ada@example.test',
        )
    })

    it('falls back to the id when there is no name, and to the id on hover when there is no email', () => {
        render(<UserLabel user={{ ...user, name: null, email: null }} />)

        expect(screen.getByText('7')).toHaveAttribute('title', '7')
    })

    it('accepts a className', () => {
        render(<UserLabel user={user} className="extra" />)

        expect(screen.getByText('Ada')).toHaveClass('extra')
    })
})
