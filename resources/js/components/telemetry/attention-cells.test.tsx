import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { tracesLinkers } from '@/api/traces-link'
import { AttentionCells } from '@/components/telemetry/attention-cells'
import { attentionFixture } from '@/components/telemetry/summary-fixtures'

const hrefs = (scope: HTMLElement) =>
    within(scope)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))

describe('AttentionCells', () => {
    it('links each cell and each issue kind with the range of the data and the link builder', () => {
        render(
            <MemoryRouter>
                <AttentionCells
                    items={attentionFixture}
                    range="7d"
                    linkFor={tracesLinkers({ agent: 'Support' }).linkFor}
                />
            </MemoryRouter>,
        )

        expect(hrefs(document.body)).toEqual([
            '/traces?range=7d&status=failed&agent=Support',
            '/traces?range=7d&status=failed&agent=Support&issue_kind=rate_limited',
            '/traces?range=7d&status=failed&agent=Support&issue_kind=tool_error',
            '/traces?range=7d&agent=Support&unpriced=1',
        ])
    })

    it('draws an item whose filter the list cannot keep as one that could not be shown, without a link', () => {
        const report = vi.spyOn(console, 'error').mockImplementation(() => {})

        render(
            <MemoryRouter>
                <AttentionCells
                    items={[
                        {
                            kind: 'unpriced',
                            count: 4,
                            latest_at: null,
                            filters: { unknown_filter: '1' },
                            breakdown: [],
                        },
                    ]}
                    range="24h"
                    linkFor={tracesLinkers().linkFor}
                />
            </MemoryRouter>,
        )

        expect(screen.queryAllByRole('link')).toHaveLength(0)
        expect(
            screen.getByText(/4 · This item could not be shown/),
        ).toBeVisible()
        report.mockRestore()
    })
})
