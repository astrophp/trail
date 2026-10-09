import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { forgetAttentionRefreshFailures } from '@/features/overview/use-attention'
import { forgetOverviewRefreshFailures } from '@/features/overview/use-overview'
import { renderApp } from '@/test/render-app'
import { mockApi } from '@/test/overview-api'

beforeEach(() => {
    forgetOverviewRefreshFailures()
    forgetAttentionRefreshFailures()
})

async function open() {
    mockApi()
    renderApp('/')
    await screen.findByRole('heading', { name: 'Needs attention' })
    await screen.findByRole('link', { name: 'Failed runs' })

    return screen.getByRole('main')
}

const before = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('the Overview page', () => {
    it('has the figures, the activity chart and the list of what needs attention', async () => {
        const main = await open()

        expect(main.querySelector('[data-slot="metric-strip"]')).not.toBeNull()
        expect(
            within(main).getByRole('img', {
                name: /traces started in this range/,
            }),
        ).toBeVisible()
        expect(
            within(main).getByRole('link', { name: 'Recovered by failover' }),
        ).toBeVisible()
    })

    it('has one level-1 heading and the two panels under it as level 2, none skipped', async () => {
        const main = await open()

        expect(
            within(main)
                .getAllByRole('heading')
                .map((heading) => [
                    heading.textContent,
                    heading.getAttribute('aria-level') ?? heading.tagName,
                ]),
        ).toEqual([
            ['Overview', 'H1'],
            ['Trace activity', '2'],
            ['Needs attention', '2'],
        ])
    })

    it('reads, and tabs, in the order it looks: figures, chart with its switch and data, then the list', async () => {
        const main = await open()
        const stripLink = main.querySelector(
            '[data-slot="metric-strip"] a',
        ) as HTMLElement
        const activity = screen
            .getByRole('heading', { name: 'Trace activity' })
            .closest('[data-slot="panel"]') as HTMLElement
        const attention = screen
            .getByRole('heading', { name: 'Needs attention' })
            .closest('[data-slot="panel"]') as HTMLElement
        const switchGroup = within(activity).getByRole('radiogroup')
        const viewData = within(activity).getByRole('button', {
            name: 'View data',
        })
        const firstRow = within(attention).getByRole('link', {
            name: 'Failed runs',
        })

        expect(before(stripLink, activity)).toBe(true)
        expect(before(activity, attention)).toBe(true)
        expect(before(switchGroup, viewData)).toBe(true)
        expect(before(viewData, firstRow)).toBe(true)

        // The keyboard walks the same way: the strip's links, the switch, the button, the list.
        const visited: Element[] = []

        await userEvent.click(document.body)
        for (let step = 0; step < 40; step++) {
            await userEvent.tab()
            visited.push(document.activeElement as Element)

            if (document.activeElement === firstRow) {
                break
            }
        }

        const at = (element: Element) => visited.indexOf(element)
        const checked = within(activity)
            .getAllByRole('radio')
            .find((radio) => radio.getAttribute('aria-checked') === 'true')

        expect(at(stripLink)).toBeGreaterThanOrEqual(0)
        expect(at(checked as Element)).toBeGreaterThan(at(stripLink))
        expect(at(viewData)).toBeGreaterThan(at(checked as Element))
        expect(at(firstRow)).toBeGreaterThan(at(viewData))
    })

    it('stacks the panels at the full width of the page, the chart first', async () => {
        await open()
        const activity = screen
            .getByRole('heading', { name: 'Trace activity' })
            .closest('[data-slot="panel"]') as HTMLElement
        const attention = screen
            .getByRole('heading', { name: 'Needs attention' })
            .closest('[data-slot="panel"]') as HTMLElement

        expect(activity.parentElement).toBe(attention.parentElement)
        expect(activity.parentElement).toHaveClass('flex-col')
        expect(activity.className).not.toMatch(/col-span|grid-cols/)
        expect(attention.className).not.toMatch(/col-span|col-start/)
    })
})
