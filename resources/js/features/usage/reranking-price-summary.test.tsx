import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Price } from '@/api/types'
import { RerankingPriceSummary } from '@/features/usage/reranking-price-summary'
import { mystery } from '@/test/prices-api'

function model(
    rate: number | null,
    basis: 'input_tokens' | 'search_units',
): Price {
    const rates = {
        basis,
        input: basis === 'input_tokens' ? rate : null,
        search_unit: basis === 'search_units' ? rate : null,
    }
    return {
        ...mystery,
        reranking: {
            rates,
            source: 'config',
            via: null,
            default: { rates, source: 'config', via: null },
            saved_at: null,
        },
    }
}

describe('reranking price evidence in the model list', () => {
    it.each([
        ['search_units', 0.0025, 'Reranking: USD 0.0025 per search unit'],
        ['input_tokens', 0.05, 'Reranking: USD 0.05 per million input tokens'],
        ['search_units', 0, 'Reranking: USD 0 per search unit'],
        ['search_units', null, 'per search unit'],
    ] as const)(
        'labels %s rates without changing their unit or inventing zero',
        (basis, rate, text) => {
            const { container } = render(
                <RerankingPriceSummary price={model(rate, basis)} />,
            )
            expect(container).toHaveTextContent(text)
            if (rate === null) {
                expect(screen.getByText('No rate')).toBeInTheDocument()
                expect(container).not.toHaveTextContent('USD 0')
            }
            expect(
                screen.getByText('Config reranking price'),
            ).toBeInTheDocument()
        },
    )

    it('uses the reranking source independently of the ordinary token source', () => {
        const price = model(0.0025, 'search_units')
        price.source = 'saved'
        const { rerender } = render(<RerankingPriceSummary price={price} />)
        expect(screen.getByText('Config reranking price')).toBeInTheDocument()
        price.reranking!.source = 'saved'
        rerender(<RerankingPriceSummary price={{ ...price }} />)
        expect(screen.getByText('Saved reranking price')).toBeInTheDocument()
        expect(
            screen.queryByText('Config reranking price'),
        ).not.toBeInTheDocument()
    })

    it('adds no reranking claim when no billing basis is selected', () => {
        const { container } = render(<RerankingPriceSummary price={mystery} />)
        expect(container).toBeEmptyDOMElement()
    })
})
