import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Status } from '@/api/types'
import { StatusBadge, statusLabel } from '@/components/telemetry/status-badge'

const cases: [Status, string][] = [
    ['completed', 'Completed'],
    ['failed', 'Failed'],
    ['running', 'Running'],
    ['incomplete', 'Incomplete'],
    ['awaiting_approval', 'Awaiting approval'],
]

describe('StatusBadge', () => {
    it.each(cases)('shows %s as an icon and the word %s', (status, label) => {
        const { container } = render(<StatusBadge status={status} />)

        expect(screen.getByText(label)).toBeInTheDocument()
        expect(container.querySelector('svg')).toBeInTheDocument()
    })

    it.each(cases)('names %s as %s outside a badge', (status, label) => {
        expect(statusLabel(status)).toBe(label)
    })

    it('gives every status its own label and icon, so colour is never the only difference', () => {
        const markup = cases.map(([status]) => {
            const { container, unmount } = render(
                <StatusBadge status={status} />,
            )
            const html = container.querySelector('svg')!.innerHTML

            unmount()

            return html
        })

        expect(new Set(markup).size).toBe(cases.length)
        expect(new Set(cases.map(([, label]) => label)).size).toBe(cases.length)
    })

    it('animates the icon of a running run only when motion is welcome', () => {
        const { container } = render(<StatusBadge status="running" />)

        expect(container.querySelector('svg')).toHaveClass(
            'motion-safe:animate-spin',
        )
        expect(container.querySelector('svg')).not.toHaveClass('animate-spin')
    })

    it('does not animate any other status', () => {
        const { container } = render(<StatusBadge status="completed" />)

        expect(container.querySelector('svg')).not.toHaveClass(
            'motion-safe:animate-spin',
        )
    })

    it('accepts a className', () => {
        const { container } = render(
            <StatusBadge status="failed" className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
