import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { tracesLink } from '@/api/traces-link'
import type { Summary } from '@/api/types'
import { MetricStrip } from '@/components/patterns/metric-strip'
import { CostMetric } from '@/components/telemetry/cost-metric'
import { summaryFixture } from '@/components/telemetry/summary-fixtures'

const unpriced = (runs: number): Summary => ({
    ...summaryFixture,
    cost_coverage: { unpriced_runs: runs, runs_without_amount: 0 },
})

function draw(summary: Summary, unpricedRuns?: 'show' | 'hide') {
    render(
        <MemoryRouter>
            <MetricStrip>
                <CostMetric
                    summary={summary}
                    previous={null}
                    range="24h"
                    link={tracesLink}
                    unpricedRuns={unpricedRuns}
                />
            </MetricStrip>
        </MemoryRouter>,
    )
}

describe('CostMetric', () => {
    it('says how many runs are unpriced by default', () => {
        draw(unpriced(3))

        expect(screen.getByText('3 unpriced runs')).toBeInTheDocument()
    })

    it('leaves the unpriced runs line out when asked, and still shows the cost', () => {
        draw(unpriced(3), 'hide')

        expect(screen.getByText('Estimated cost')).toBeInTheDocument()
        expect(screen.getByText('$11.48', { exact: false })).toBeInTheDocument()
        expect(screen.queryByText(/unpriced/)).not.toBeInTheDocument()
    })
})
