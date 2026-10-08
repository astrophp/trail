import { describe, expect, it } from 'vitest'
import {
    conversationListApiParams,
    readConversationListView,
    type ConversationListView,
} from '@/api/conversation-list-view'

const read = (query: string) =>
    readConversationListView(new URLSearchParams(query))

const defaults: ConversationListView = {
    range: '24h',
    sort: '-last_activity',
    page: 1,
    search: '',
    agent: '',
    failed: false,
}

describe('readConversationListView', () => {
    it('is the default view for an empty query: newest first, no filter', () => {
        expect(read('')).toEqual(defaults)
    })

    it('reads the range, sort, page and each filter', () => {
        expect(
            read(
                'range=7d&sort=-turns&page=3&search=refund&agent=Support&failed=1',
            ),
        ).toEqual({
            range: '7d',
            sort: '-turns',
            page: 3,
            search: 'refund',
            agent: 'Support',
            failed: true,
        })
    })

    it.each([
        ['last_activity'],
        ['-last_activity'],
        ['turns'],
        ['-turns'],
        ['cost'],
        ['-cost'],
    ])('reads the sort %s as it is', (sort) => {
        expect(read(`sort=${sort}`).sort).toBe(sort)
    })

    it.each([
        ['range=1y', 'range'],
        ['sort=name', 'sort'],
        ['sort=started_at', 'sort'],
        ['page=0', 'page'],
        ['page=abc', 'page'],
        ['failed=yes', 'failed'],
        ['failed=0', 'failed'],
    ] as const)('falls back to the default for an invalid %s', (query, key) => {
        expect(read(query)[key]).toBe(defaults[key])
    })

    it('ignores parameters the list does not own', () => {
        expect(read('status=failed&provider=x&tab=spans')).toEqual(defaults)
    })

    it('normalises the search like the box does', () => {
        expect(read('search=%20%20hi%20there%20%20').search).toBe('hi there')
        expect(read(`search=${'a'.repeat(300)}`).search).toBe('a'.repeat(200))
    })
})

describe('conversationListApiParams', () => {
    it('asks for the whole view, by the API’s own names', () => {
        expect(
            conversationListApiParams({
                range: '7d',
                sort: 'cost',
                page: 2,
                search: 'refund',
                agent: 'Support',
                failed: true,
            }),
        ).toEqual({
            range: '7d',
            sort: 'cost',
            page: 2,
            search: 'refund',
            agent: 'Support',
            failed: true,
        })
    })
})
