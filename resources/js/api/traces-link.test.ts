import { describe, expect, it } from 'vitest'
import { readTraceListView } from '@/api/trace-list-view'
import {
    linkRows,
    tracesLink,
    tracesLinkFor,
    tracesLinkers,
    unlinkable,
} from '@/api/traces-link'
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

    it('writes the model and the tool of a breakdown row, none dropped', () => {
        const to = tracesLinkFor('7d', {
            agent: 'Support/1 +',
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            tool: 'lookup_order',
        })
        const view = readTraceListView(search(to))

        expect(view).toMatchObject({
            range: '7d',
            agent: 'Support/1 +',
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            tool: 'lookup_order',
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

    it('fails for a filter the address would leave out, which would show more runs than were counted', () => {
        expect(() => tracesLinkFor('24h', { tool: '' })).toThrow(
            'would leave the "tool" filter out',
        )
        expect(() =>
            tracesLinkFor('24h', { agent: '', status: 'failed' }),
        ).toThrow('would leave the "agent" filter out')
        expect(() => tracesLinkFor('24h', { status: 'all' })).toThrow(
            'would leave the "status" filter out',
        )
        // Paired: a tool with a name is written.
        expect(search(tracesLinkFor('24h', { tool: 'x' })).get('tool')).toBe(
            'x',
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

describe('a base every link carries', () => {
    it('is written beside the filters of the link', () => {
        expect(tracesLink('7d', { slow: true }, { agent: 'Support' })).toEqual({
            pathname: '/traces',
            search: '?range=7d&agent=Support&slow=1',
        })
        expect(
            tracesLinkFor('7d', { status: 'failed' }, { agent: 'Support' }),
        ).toEqual({
            pathname: '/traces',
            search: '?range=7d&status=failed&agent=Support',
        })
    })

    it('encodes a name with a slash, spaces, a percent sign and a plus', () => {
        const name = ' a/b %c+d '
        const to = tracesLink('24h', {}, { agent: name })
        const query = new URLSearchParams(
            typeof to === 'string' ? '' : to.search,
        )

        expect(query.get('agent')).toBe(name)
        expect(readTraceListView(query).agent).toBe(name)
    })

    it('is replaced by a filter of the same name', () => {
        expect(
            search(
                tracesLink('24h', { agent: 'Other' }, { agent: 'Support' }),
            ).get('agent'),
        ).toBe('Other')
    })

    it('builds links of a page from one base', () => {
        const { link, linkFor } = tracesLinkers({ agent: 'Support' })

        expect(search(link('1h', { slow: true })).toString()).toBe(
            'range=1h&agent=Support&slow=1',
        )
        expect(search(linkFor('1h', { unpriced: '1' })).toString()).toBe(
            'range=1h&agent=Support&unpriced=1',
        )
    })

    it('still refuses what the list cannot keep', () => {
        const { linkFor } = tracesLinkers({ agent: 'Support' })

        expect(() => linkFor('24h', { streamed: '1' })).toThrow(
            'no "streamed" filter',
        )
    })
})

describe('linkRows', () => {
    it('links each row to the runs its filters name, over the range', () => {
        const rows: { filters: Record<string, string> }[] = [
            { filters: { provider: 'openai', model: 'gpt-4.1' } },
            { filters: { agent: 'Support' } },
        ]

        expect(linkRows(rows, '7d').map(({ to }) => to)).toEqual([
            {
                pathname: '/traces',
                search: '?range=7d&provider=openai&model=gpt-4.1',
            },
            { pathname: '/traces', search: '?range=7d&agent=Support' },
        ])
        expect(unlinkable(linkRows(rows, '7d'))).toEqual([])
    })

    it('gives a row no link, and the reason, when the list cannot keep a filter', () => {
        const rows: { filters: Record<string, string> }[] = [
            { filters: { tenant: 'acme' } },
            { filters: { agent: 'A' } },
        ]
        const linked = linkRows(rows, '24h')

        expect(linked[0].to).toBeNull()
        expect(linked[0].reason).toContain('no "tenant" filter')
        expect(linked[1].to).not.toBeNull()
        expect(unlinkable(linked)).toEqual([linked[0].reason])
    })

    it('gives a row that names no filter no link: it would lead to every run', () => {
        const linked = linkRows([{ filters: {} }, {}], '24h')

        expect(linked.map(({ to }) => to)).toEqual([null, null])
        expect(linked.map(({ reason }) => reason)).toEqual([
            'The row names no filter to link by.',
            'The row names no filter to link by.',
        ])
    })

    it('gives a row whose value the address would drop no link', () => {
        const [row] = linkRows([{ filters: { agent: '' } }], '24h')

        expect(row.to).toBeNull()
        expect(row.reason).toContain('"agent"')
    })
})
