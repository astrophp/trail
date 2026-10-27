import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
    json,
    listOf,
    mystery,
    mockPrices,
    rowOf,
    priceWrites,
    renderPrices,
    tableLoaded,
} from '@/test/prices-api'

describe('reranking price group', () => {
    it('saves only reranking fields and resets only the reranking group', async () => {
        const model = {
            ...mystery,
            reranking: {
                rates: {
                    basis: 'search_units' as const,
                    input: null,
                    search_unit: 0.1,
                },
                source: 'config' as const,
                via: null,
                default: {
                    rates: {
                        basis: 'search_units' as const,
                        input: null,
                        search_unit: 0.1,
                    },
                    source: 'config' as const,
                    via: null,
                },
                saved_at: null,
            },
        }
        const fetch = mockPrices(
            () => listOf([model]),
            () => json({ data: model }),
        )
        const user = userEvent.setup()
        renderPrices()
        await tableLoaded()
        expect(rowOf(model)).toHaveTextContent(
            'Reranking: USD 0.1 per search unit',
        )
        expect(rowOf(model)).toHaveTextContent('Config reranking price')
        // The source is drawn in the cell and in the narrow summary; each carries the hint.
        expect(
            within(rowOf(model)).getAllByRole('button', {
                name: 'Why token calls show as Unpriced',
            }),
        ).not.toHaveLength(0)
        expect(rowOf(model)).not.toHaveTextContent(
            'Seen in usage; without an input rate it shows as Unpriced',
        )
        const open = () =>
            user.click(
                screen.getByRole('button', {
                    name: `Edit reranking prices of ${model.provider} ${model.model}`,
                }),
            )
        await open()
        const field = screen.getByLabelText('USD per search unit')
        await user.clear(field)
        await user.type(field, '0.000001')
        await user.click(screen.getByRole('button', { name: 'Save reranking' }))
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        )
        expect(priceWrites(fetch)[0].body).toEqual({
            reranking: {
                basis: 'search_units',
                input: null,
                search_unit: '0.000001',
            },
        })
        await open()
        await user.click(
            screen.getByRole('button', { name: 'Reset reranking' }),
        )
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        )
        expect(priceWrites(fetch)[1].url).toContain('&group=reranking')
    })
})
