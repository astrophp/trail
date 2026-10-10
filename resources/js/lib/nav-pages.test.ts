import { describe, expect, it } from 'vitest'
import { navPage, navPages } from '@/lib/nav-pages'

describe('navPages', () => {
    it('lists the five sections once each, in the sidebar order', () => {
        expect(navPages.map((page) => page.title)).toEqual([
            'Overview',
            'Traces',
            'Conversations',
            'Agents',
            'Usage & cost',
        ])
        expect(new Set(navPages.map((page) => page.path)).size).toBe(5)
    })

    it('finds a page by its section', () => {
        expect(navPage('agents').path).toBe('/agents')
    })
})
