import { describe, expect, it } from 'vitest'
import { issueKinds } from '@/api/traces'
import {
    issueKindFilters,
    readTraceListView,
    traceListApiParams,
    type TraceListView,
} from '@/api/trace-list-view'
import { contractFixture } from '@/test/contract-fixture'

const read = (query: string) => readTraceListView(new URLSearchParams(query))

const defaults: TraceListView = {
    range: '24h',
    sort: '-started_at',
    page: 1,
    status: 'all',
    search: '',
    agent: '',
    provider: '',
    model: '',
    tool: '',
    conversation: '',
    issue_kind: 'all',
    child_failed: false,
    unpriced: false,
    recovered: false,
    bookmarked: false,
    slow: false,
}

describe('readTraceListView', () => {
    it('is the default view for an empty query', () => {
        expect(read('')).toEqual(defaults)
    })

    it('reads the range, sort, page and each filter', () => {
        expect(
            read(
                'range=7d&sort=-cost&page=3&status=failed&search=hello&agent=Support&provider=openai&conversation=support%2Fada+1042&bookmarked=1&slow=1',
            ),
        ).toEqual({
            range: '7d',
            sort: '-cost',
            page: 3,
            status: 'failed',
            search: 'hello',
            agent: 'Support',
            provider: 'openai',
            model: '',
            tool: '',
            conversation: 'support/ada 1042',
            issue_kind: 'all',
            child_failed: false,
            unpriced: false,
            recovered: false,
            bookmarked: true,
            slow: true,
        })
    })

    it('reads the model and the tool a breakdown links with, whatever characters they hold', () => {
        expect(
            read(
                `provider=anthropic&model=${encodeURIComponent('claude/3 5+x%')}&tool=${encodeURIComponent(' lookup/order ')}`,
            ),
        ).toMatchObject({
            provider: 'anthropic',
            model: 'claude/3 5+x%',
            tool: ' lookup/order ',
        })
    })

    it('reads the issue kind and the three flags the needs-attention list links with', () => {
        expect(
            read(
                'status=completed&issue_kind=rate_limited&child_failed=1&unpriced=1&recovered=1',
            ),
        ).toMatchObject({
            status: 'completed',
            issue_kind: 'rate_limited',
            child_failed: true,
            unpriced: true,
            recovered: true,
        })
    })

    it('ignores parameters the list does not own', () => {
        expect(read('tab=spans&x=1')).toEqual(defaults)
    })

    it.each([
        ['range=1y', 'range'],
        ['sort=name', 'sort'],
        ['status=done', 'status'],
        ['page=0', 'page'],
        ['page=abc', 'page'],
        ['bookmarked=yes', 'bookmarked'],
        ['slow=yes', 'slow'],
        ['issue_kind=bogus', 'issue_kind'],
        ['child_failed=yes', 'child_failed'],
        ['unpriced=yes', 'unpriced'],
        ['recovered=yes', 'recovered'],
    ] as const)('falls back to the default for an invalid %s', (query, key) => {
        expect(read(query)[key]).toBe(defaults[key])
    })

    it('normalises the search like the box does', () => {
        expect(read('search=%20%20hi%20there%20%20').search).toBe('hi there')
        expect(read(`search=${'a'.repeat(300)}`).search).toBe('a'.repeat(200))
    })
})

describe('traceListApiParams', () => {
    it('does not send an unset filter or a status of all', () => {
        const params = traceListApiParams(defaults)

        expect(params.status).toBeUndefined()
        expect(params).toMatchObject({
            range: '24h',
            sort: '-started_at',
            page: 1,
        })
    })

    it('sends a status other than all', () => {
        expect(
            traceListApiParams({ ...defaults, status: 'running' }).status,
        ).toBe('running')
    })

    it('leaves the unset filters empty, which the client does not send', () => {
        expect(traceListApiParams(defaults)).toEqual({
            range: '24h',
            sort: '-started_at',
            page: 1,
            status: undefined,
            search: '',
            agent: '',
            provider: '',
            model: '',
            tool: '',
            conversation: '',
            issue_kind: undefined,
            child_failed: false,
            unpriced: false,
            recovered: false,
            bookmarked: false,
            slow: false,
        })
    })

    it('passes the filters that are set', () => {
        expect(
            traceListApiParams({
                ...defaults,
                search: 'x',
                agent: 'Support',
                provider: 'openai',
                model: 'gpt-x',
                tool: 'lookup_order',
                conversation: 'c-1',
                issue_kind: 'tool_error',
                child_failed: true,
                unpriced: true,
                recovered: true,
                bookmarked: true,
                slow: true,
            }),
        ).toMatchObject({
            issue_kind: 'tool_error',
            child_failed: true,
            unpriced: true,
            recovered: true,
            search: 'x',
            agent: 'Support',
            provider: 'openai',
            model: 'gpt-x',
            tool: 'lookup_order',
            conversation: 'c-1',
            bookmarked: true,
            slow: true,
        })
    })
})

describe('the issue kinds', () => {
    it('are the ones the API documents, in its order', () => {
        expect([...issueKinds]).toEqual(
            (contractFixture('enums') as { issue_kind: string[] }).issue_kind,
        )
        expect(issueKindFilters).toEqual(['all', ...issueKinds])
    })
})
