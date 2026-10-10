import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SpanType } from '@/api/types'
import {
    SpanTypeIcon,
    spanTypeLabel,
} from '@/components/telemetry/span-type-icon'

const cases: [SpanType, string][] = [
    ['agent', 'Agent'],
    ['step', 'Model step'],
    ['tool', 'Tool'],
    ['embedding', 'Embedding'],
]

describe('SpanTypeIcon', () => {
    it.each(cases)('shows %s as an icon labelled %s', (type, label) => {
        render(<SpanTypeIcon type={type} />)

        expect(screen.getByRole('img', { name: label })).toBeInTheDocument()
    })

    it.each(cases)('names %s as %s outside an icon', (type, label) => {
        expect(spanTypeLabel(type)).toBe(label)
    })

    it('gives every type its own shape, so colour is never the only difference', () => {
        const markup = cases.map(([type]) => {
            const { container, unmount } = render(<SpanTypeIcon type={type} />)
            const html = container.querySelector('svg')!.innerHTML

            unmount()

            return html
        })

        expect(new Set(markup).size).toBe(cases.length)
    })

    it('drops the role and label when it is decorative', () => {
        const { container } = render(<SpanTypeIcon type="tool" decorative />)
        const icon = container.querySelector('svg')!

        expect(icon).toHaveAttribute('aria-hidden', 'true')
        expect(icon).not.toHaveAttribute('role')
        expect(icon).not.toHaveAttribute('aria-label')
        expect(screen.queryByRole('img')).toBeNull()
    })

    it('accepts a className', () => {
        const { container } = render(
            <SpanTypeIcon type="tool" className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
