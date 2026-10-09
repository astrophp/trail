import { describe, expect, it } from 'vitest'
import { readTraceListView } from '@/api/trace-list-view'
import { tracesLinkFor } from '@/features/overview/traces-link'
import { attentionFixture } from '@/test/overview-api'

const search = (to: ReturnType<typeof tracesLinkFor>) =>
    new URLSearchParams(typeof to === 'string' ? '' : to.search)

describe('tracesLinkFor', () => {
    it('writes the filters an item names with the list parameters of the same names', () => {
        const to = tracesLinkFor('7d', {
            status: 'completed',
            child_failed: '1',
        })

        expect(to).toEqual({
            pathname: '/traces',
            search: '?range=7d&status=completed&child_failed=1',
        })
    })

    it('leaves the default range out, as the list does', () => {
        expect(tracesLinkFor('24h', { unpriced: '1' })).toEqual({
            pathname: '/traces',
            search: '?unpriced=1',
        })
    })

    it('carries the range of the answer, not a default', () => {
        expect(
            search(tracesLinkFor('1h', { recovered: '1' })).get('range'),
        ).toBe('1h')
    })

    it.each(
        attentionFixture.data.flatMap((item) => [
            { name: item.kind, filters: item.filters },
            ...item.breakdown.map((row) => ({
                name: `${item.kind} / ${row.issue_kind}`,
                filters: row.filters,
            })),
        ]),
    )(
        'opens the list over exactly the filters of $name, none dropped',
        ({ filters }) => {
            const query = search(tracesLinkFor('7d', filters))
            const view = readTraceListView(query)

            // Every filter is in the address, and nothing else is but the range.
            expect(new Set(query.keys())).toEqual(
                new Set(['range', ...Object.keys(filters)]),
            )

            // And the list reads each one as the API meant it.
            for (const [name, text] of Object.entries(filters)) {
                const value = view[name as keyof typeof view]

                expect(value === true ? '1' : String(value)).toBe(text)
            }
        },
    )

    it('fails when the API names a filter the list does not keep in its address', () => {
        expect(() =>
            tracesLinkFor('24h', { status: 'failed', streamed: '1' }),
        ).toThrow('no "streamed" filter')
    })

    it('fails for a name that is a view setting of the list rather than a filter', () => {
        expect(() => tracesLinkFor('24h', { sort: '-cost' })).toThrow(
            'no "sort" filter',
        )
        expect(() => tracesLinkFor('24h', { page: '2' })).toThrow(
            'no "page" filter',
        )
    })

    it('fails for a value the list would not read, which would show other runs', () => {
        expect(() => tracesLinkFor('24h', { status: 'done' })).toThrow(
            'does not read "done"',
        )
        expect(() => tracesLinkFor('24h', { issue_kind: 'bogus' })).toThrow(
            'does not read "bogus"',
        )
        expect(() => tracesLinkFor('24h', { unpriced: 'yes' })).toThrow(
            'does not read "yes"',
        )
    })
})
