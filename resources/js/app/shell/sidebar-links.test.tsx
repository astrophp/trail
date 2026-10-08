import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'

const nav = () => screen.getByRole('navigation', { name: 'Main' })
const hrefs = (links: HTMLElement[]) =>
    links.map((link) => link.getAttribute('href'))

const bare = [
    '/trail/traces',
    '/trail/conversations',
    '/trail/agents',
    '/trail/usage',
]

describe('the links between pages', () => {
    it.each([
        ['a list', '/traces?range=7d&sort=duration&page=2'],
        ['a run', '/traces/abc?range=7d&sort=duration&page=2'],
        ['conversations', '/conversations?range=1h&failed=1'],
    ])(
        'do not carry the time range or the view of the page they are on (%s)',
        (_page, route) => {
            renderApp(route)

            expect(hrefs(within(nav()).getAllByRole('link'))).toEqual([
                '/trail',
                ...bare,
            ])
            expect(
                screen.getByRole('link', { name: 'Trail overview' }),
            ).toHaveAttribute('href', '/trail')
        },
    )

    it('lead the breadcrumb of a run to the bare list, like its back link', () => {
        renderApp('/traces/abc?range=7d')

        expect(
            within(
                screen.getByRole('navigation', { name: 'breadcrumb' }),
            ).getByRole('link', { name: 'Traces' }),
        ).toHaveAttribute('href', '/trail/traces')
    })
})
