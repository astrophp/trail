import { describe, expect, it } from 'vitest'
import {
    agentListApiParams,
    agentListParams,
    type AgentListView,
} from '@/api/agent-list-view'
import { readState } from '@/lib/url-state'

/** What the list keeps in the URL besides the range, as a query string reads. */
const read = (query: string) =>
    readState(agentListParams, new URLSearchParams(query))

const defaults = { sort: '-runs', page: 1, search: '' } as const

const view: AgentListView = { range: '24h', ...defaults }

describe('the params the list keeps in the URL', () => {
    it('is the busiest-first view for an empty query', () => {
        expect(read('')).toEqual(defaults)
    })

    it('reads the sort, page and search', () => {
        expect(read('sort=-error_rate&page=3&search=support')).toEqual({
            sort: '-error_rate',
            page: 3,
            search: 'support',
        })
    })

    it.each([
        'name',
        '-name',
        'runs',
        '-runs',
        'error_rate',
        '-error_rate',
        'duration',
        '-duration',
        'cost',
        '-cost',
        'last_activity',
        '-last_activity',
    ])('reads the sort the API takes: %s', (sort) => {
        expect(read(`sort=${sort}`).sort).toBe(sort)
    })

    it.each([
        ['sort=bogus', 'sort'],
        ['sort=started_at', 'sort'],
        ['sort=latency', 'sort'],
        ['page=0', 'page'],
        ['page=-2', 'page'],
        ['page=abc', 'page'],
    ] as const)('falls back to the default for %s', (query, key) => {
        expect(read(query)[key]).toBe(defaults[key])
    })

    it('trims a search and keeps no more than the API reads', () => {
        expect(read('search=%20%20support%20').search).toBe('support')
        expect(read(`search=${'a'.repeat(300)}`).search).toHaveLength(200)
    })
})

describe('agentListApiParams', () => {
    it('is what the endpoint takes, in the order of the view', () => {
        expect(
            agentListApiParams({
                range: '7d',
                sort: '-cost',
                page: 2,
                search: 'x',
            }),
        ).toEqual({
            range: '7d',
            sort: '-cost',
            page: 2,
            per_page: undefined,
            search: 'x',
        })
    })

    it('asks for a page size when it is given one', () => {
        expect(agentListApiParams(view, 5).per_page).toBe(5)
    })
})
