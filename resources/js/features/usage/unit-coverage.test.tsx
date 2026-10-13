import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { CoverageCell } from '@/features/usage/coverage-cell'
import type { UnitUsage } from '@/api/types'

it('does not call missing usage priced and retains the historical assessment label', () => {
    const units: UnitUsage = {
        assessment: 'partial',
        search_units: '0.100001',
        search_unit_calls: 2,
        reported_search_unit_calls: 1,
        unpriced_search_unit_calls: 1,
        unpriced_search_units: null,
        unknown_cost_calls: 1,
        incomplete_calls: 1,
        ambiguous_reranking_calls: 0,
    }
    render(
        <CoverageCell
            coverage={{
                reported_steps: 3,
                unpriced_steps: 0,
                unpriced_tokens: 0,
            }}
            units={units}
        />,
    )
    expect(screen.getByText('Some history not assessed')).toBeInTheDocument()
    expect(
        screen.getByText('1 call without reported usage'),
    ).toBeInTheDocument()
    expect(screen.getByText('1 incomplete call')).toBeInTheDocument()
    expect(screen.queryByText('Priced')).not.toBeInTheDocument()
})
