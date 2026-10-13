import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
    json,
    listOf,
    mystery,
    mockPrices,
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
