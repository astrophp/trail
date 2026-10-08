import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'

const nav = () => screen.getByRole('navigation', { name: 'Main' })
const hrefs = (links: HTMLElement[]) =>
    links.map((link) => link.getAttribute('href'))

describe('the time range across pages', () => {
    it('is carried by the sidebar, and nothing else is (the breadcrumb of a run leads to the bare list, like its back link)', () => {
        renderApp('/traces/abc?range=7d&sort=duration&page=2')

        expect(hrefs(within(nav()).getAllByRole('link'))).toEqual([
            '/trail?range=7d',
            '/trail/traces?range=7d',
            '/trail/conversations?range=7d',
            '/trail/agents?range=7d',
            '/trail/usage?range=7d',
        ])
        expect(
            screen.getByRole('link', { name: 'Trail overview' }),
        ).toHaveAttribute('href', '/trail?range=7d')
        expect(
            within(
                screen.getByRole('navigation', { name: 'breadcrumb' }),
            ).getByRole('link', { name: 'Traces' }),
        ).toHaveAttribute('href', '/trail/traces')
    })

    it('leaves the links bare for the default range', () => {
        renderApp('/traces/abc?sort=duration&page=2')

        expect(hrefs(within(nav()).getAllByRole('link'))).toEqual([
            '/trail',
            '/trail/traces',
            '/trail/conversations',
            '/trail/agents',
            '/trail/usage',
        ])
        expect(
            within(
                screen.getByRole('navigation', { name: 'breadcrumb' }),
            ).getByRole('link', { name: 'Traces' }),
        ).toHaveAttribute('href', '/trail/traces')
    })

    it('ignores a range it does not know', () => {
        renderApp('/traces/abc?range=forever')

        expect(
            within(nav()).getByRole('link', { name: 'Traces' }),
        ).toHaveAttribute('href', '/trail/traces')
    })
})
