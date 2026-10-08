import { describe, expect, it } from 'vitest'
import {
    readTraceListView,
    traceListApiParams,
    type TraceListView,
} from '@/api/trace-list-view'

const read = (query: string) => readTraceListView(new URLSearchParams(query))

const defaults: TraceListView = {
    range: '24h',
    sort: '-started_at',
    page: 1,
    status: 'all',
    search: '',
    agent: '',
    provider: '',
    bookmarked: false,
}

describe('readTraceListView', () => {
    it('is the default view for an empty query', () => {
        expect(read('')).toEqual(defaults)
    })

    it('reads the range, sort, page and each filter', () => {
        expect(
            read(
                'range=7d&sort=-cost&page=3&status=failed&search=hello&agent=Support&provider=openai&bookmarked=1',
            ),
        ).toEqual({
            range: '7d',
            sort: '-cost',
            page: 3,
            status: 'failed',
            search: 'hello',
            agent: 'Support',
            provider: 'openai',
            bookmarked: true,
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
            bookmarked: false,
        })
    })

    it('passes the filters that are set', () => {
        expect(
            traceListApiParams({
                ...defaults,
                search: 'x',
                agent: 'Support',
                provider: 'openai',
                bookmarked: true,
            }),
        ).toMatchObject({
            search: 'x',
            agent: 'Support',
            provider: 'openai',
            bookmarked: true,
        })
    })
})
