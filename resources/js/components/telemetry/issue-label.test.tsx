import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { IssueKind } from '@/api/types'
import { IssueLabel } from '@/components/telemetry/issue-label'

const cases: [IssueKind, string][] = [
    ['rate_limited', 'Rate limited'],
    ['provider_overloaded', 'Provider overloaded'],
    ['provider_connection', 'Provider connection'],
    ['insufficient_credits', 'Insufficient credits'],
    ['tool_error', 'Tool error'],
    ['exception', 'Exception'],
    ['abandoned', 'Abandoned'],
]

describe('IssueLabel', () => {
    it.each(cases)('names %s as %s', (kind, label) => {
        render(<IssueLabel kind={kind} />)

        expect(screen.getByText(label)).toBeInTheDocument()
    })

    it('accepts a className', () => {
        const { container } = render(
            <IssueLabel kind="exception" className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
