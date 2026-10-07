import { describe, expect, it } from 'vitest'
import {
    breadcrumbTrail,
    documentTitle,
    navItems,
    notFoundRoute,
    resolveRoute,
} from '@/app/routes'

describe('resolveRoute', () => {
    it.each([
        ['/', 'overview', 'Overview'],
        ['/traces', 'traces', 'Traces'],
        ['/traces/abc', 'traces', 'Trace'],
        ['/conversations', 'conversations', 'Conversations'],
        ['/conversations/c1', 'conversations', 'Conversation'],
        ['/agents', 'agents', 'Agents'],
        ['/agents/SupportAgent', 'agents', 'Agent'],
        ['/usage', 'usage', 'Usage & cost'],
        ['/traces/', 'traces', 'Traces'],
    ])('%s belongs to %s as "%s"', (pathname, section, title) => {
        expect(resolveRoute(pathname)).toMatchObject({ section, title })
    })

    it('has no section for an unknown path, however close', () => {
        for (const pathname of ['/nope', '/traces/a/b', '/trace']) {
            expect(resolveRoute(pathname)).toBe(notFoundRoute)
        }

        expect(notFoundRoute.section).toBeNull()
    })
})

describe('breadcrumbTrail', () => {
    it('is the page alone for a top-level route', () => {
        expect(breadcrumbTrail(resolveRoute('/usage'))).toEqual([
            { title: 'Usage & cost' },
        ])
    })

    it('links the section above a detail page', () => {
        expect(breadcrumbTrail(resolveRoute('/traces/abc'))).toEqual([
            { title: 'Traces', to: '/traces' },
            { title: 'Trace' },
        ])
        expect(breadcrumbTrail(resolveRoute('/agents/x'))).toEqual([
            { title: 'Agents', to: '/agents' },
            { title: 'Agent' },
        ])
    })

    it('is the page alone for not found', () => {
        expect(breadcrumbTrail(notFoundRoute)).toEqual([
            { title: 'Page not found' },
        ])
    })
})

describe('documentTitle', () => {
    it('names the page, then Trail', () => {
        expect(documentTitle(resolveRoute('/'))).toBe('Overview · Trail')
        expect(documentTitle(resolveRoute('/traces/abc'))).toBe('Trace · Trail')
        expect(documentTitle(notFoundRoute)).toBe('Page not found · Trail')
    })
})

describe('navItems', () => {
    it('lists the five sections in order, each with an icon', () => {
        expect(navItems.map((item) => [item.title, item.path])).toEqual([
            ['Overview', '/'],
            ['Traces', '/traces'],
            ['Conversations', '/conversations'],
            ['Agents', '/agents'],
            ['Usage & cost', '/usage'],
        ])
        expect(navItems.every((item) => item.icon)).toBe(true)
    })
})
