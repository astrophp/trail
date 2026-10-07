import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Status } from '@/api/types'
import { DurationValue } from '@/components/telemetry/duration-value'

describe('DurationValue', () => {
    it('shows a duration', () => {
        render(
            <DurationValue of={{ duration_ms: 9_200, status: 'completed' }} />,
        )

        expect(screen.getByText('9.20s')).toBeInTheDocument()
    })

    it('shows In progress for a running run even when a number is held', () => {
        render(<DurationValue of={{ duration_ms: 840, status: 'running' }} />)

        expect(screen.getByText('In progress')).toBeInTheDocument()
        expect(screen.queryByText('840 ms')).not.toBeInTheDocument()
    })

    it('shows In progress for a running run without one', () => {
        render(<DurationValue of={{ duration_ms: null, status: 'running' }} />)

        expect(screen.getByText('In progress')).toBeInTheDocument()
    })

    it.each<Status>(['completed', 'failed', 'incomplete', 'awaiting_approval'])(
        'shows Not captured for a %s run without one',
        (status) => {
            render(<DurationValue of={{ duration_ms: null, status }} />)

            expect(screen.getByText('Not captured')).toBeInTheDocument()
        },
    )

    it.each<[string, number | null, Status]>([
        ['running without a duration', null, 'running'],
        ['running holding a number', 840, 'running'],
        ['completed without a duration', null, 'completed'],
    ])('renders no digit at all for %s', (_name, duration_ms, status) => {
        const { container } = render(
            <DurationValue of={{ duration_ms, status }} />,
        )

        expect(container.textContent).not.toMatch(/\d/)
    })

    it('shows a real zero as a duration, not as missing', () => {
        render(<DurationValue of={{ duration_ms: 0, status: 'completed' }} />)

        expect(screen.getByText('<1 ms')).toBeInTheDocument()
    })

    it('accepts a className', () => {
        const { container, rerender } = render(
            <DurationValue
                of={{ duration_ms: 5, status: 'completed' }}
                className="extra"
            />,
        )

        expect(container.firstElementChild).toHaveClass('extra')

        rerender(
            <DurationValue
                of={{ duration_ms: null, status: 'completed' }}
                className="extra"
            />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
