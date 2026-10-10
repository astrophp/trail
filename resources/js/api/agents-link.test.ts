import { describe, expect, it } from 'vitest'
import { agentsLink } from '@/api/agents-link'

describe('agentsLink', () => {
    it('leaves out the default range and the default sort', () => {
        expect(agentsLink('24h', { search: 'order' })).toEqual({
            pathname: '/agents',
            search: '?search=order',
        })
    })

    it('keeps another range, before the search', () => {
        expect(agentsLink('7d', { search: 'a b&c' })).toEqual({
            pathname: '/agents',
            search: '?range=7d&search=a+b%26c',
        })
    })

    it('is the bare list without a filter', () => {
        expect(agentsLink('24h')).toEqual({ pathname: '/agents', search: '' })
    })
})
