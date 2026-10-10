import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import {
    deferred,
    json,
    loaded,
    mockApi,
    paramsOf,
    traceFixture,
} from '@/test/traces-api'

/** Three pages; page N holds the runs `pN-A` and `pN-B`, named `Run NA` and `Run NB`; a status filter has its own runs. */
function pagedList(url: string, perPage = 2) {
    const { pathname, searchParams } = new URL(url, 'http://x')

    if (pathname !== '/trail/api/traces') {
        return json({ message: 'No run with this id.' }, 404)
    }

    const page = Number(searchParams.get('page') ?? 1)
    // The rows change with the status filter, as they do on the server.
    const status = searchParams.get('status')
    const tag = status === null ? '' : `${status}-`
    const label = status === null ? '' : `${status} `
    const names =
        perPage === 2
            ? ['A', 'B']
            : Array.from({ length: perPage }, (_, i) => `R${i}`)

    return json({
        ...traceFixture,
        data: names.map((name) => ({
            ...traceFixture.data[2],
            id: `${tag}p${page}-${name}`,
            name: `Run ${label}${page}${name}`,
        })),
        pagination: {
            page,
            per_page: perPage,
            total: 3 * perPage,
            last_page: 3,
        },
    })
}

const box = (name: string) =>
    screen.getByRole('checkbox', { name: new RegExp(`^Select Run ${name} `) })
const header = () =>
    screen.getByRole('checkbox', { name: 'Select all runs on this page' })
const selectionBar = () =>
    document.querySelector<HTMLElement>('[data-slot="selection-bar"]')
const next = () => screen.getByRole('button', { name: 'Next page' })
const previous = () => screen.getByRole('button', { name: 'Previous page' })

beforeEach(() => {
    mockApi((url) => pagedList(url))
})

describe('selecting runs', () => {
    it('selects and unselects a run, and names the box after the run', async () => {
        renderApp('/traces')
        await loaded()

        expect(selectionBar()).toBeNull()
        expect(box('1A')).toHaveAccessibleName(/^Select Run 1A p1-A/)

        await userEvent.click(box('1A'))

        expect(box('1A')).toBeChecked()
        expect(within(selectionBar()!).getByText('1 selected')).toBeVisible()

        // The announcement is a live region that stays mounted; the bar is not one.
        const status = screen.getByText('1 run selected')

        expect(status).toHaveAttribute('role', 'status')
        expect(selectionBar()).not.toHaveAttribute('role')

        await userEvent.click(box('1A'))

        expect(box('1A')).not.toBeChecked()
        expect(selectionBar()).toBeNull()
        expect(status).toBeEmptyDOMElement()
    })

    it('has a header checkbox for the runs of the page: none, some, all', async () => {
        renderApp('/traces')
        await loaded()

        expect(header()).not.toBeChecked()
        expect(header()).not.toBePartiallyChecked()

        await userEvent.click(box('1A'))

        expect(header()).toBePartiallyChecked()

        await userEvent.click(header())

        expect(header()).toBeChecked()
        expect(box('1A')).toBeChecked()
        expect(box('1B')).toBeChecked()
        expect(
            within(selectionBar()!).getByText('Compare 2 traces'),
        ).toBeVisible()

        await userEvent.click(header())

        expect(header()).not.toBeChecked()
        expect(box('1A')).not.toBeChecked()
        expect(selectionBar()).toBeNull()
    })

    it('keeps the selection across pages, sorts and filters', async () => {
        renderApp('/traces')
        await loaded()

        await userEvent.click(box('1A'))
        await userEvent.click(next())
        await screen.findByText('Page 2 of 3')
        await screen.findByRole('checkbox', { name: /^Select Run 2A / })

        expect(box('2A')).not.toBeChecked()
        expect(header()).not.toBeChecked()
        expect(within(selectionBar()!).getByText('1 selected')).toBeVisible()

        await userEvent.click(box('2B'))
        await userEvent.click(previous())
        await screen.findByRole('checkbox', { name: /^Select Run 1A / })

        expect(box('1A')).toBeChecked()
        expect(box('1B')).not.toBeChecked()
        expect(
            within(selectionBar()!).getByText('Compare 2 traces'),
        ).toBeVisible()

        // A sort keeps the same rows, and the same boxes ticked.
        await userEvent.click(
            within(
                screen.getByRole('columnheader', { name: /Duration/ }),
            ).getByRole('button'),
        )
        await waitFor(() =>
            expect(window.location.search).toContain('sort=-duration'),
        )

        expect(box('1A')).toBeChecked()
        expect(box('1B')).not.toBeChecked()
        expect(
            within(selectionBar()!).getByText('Compare 2 traces'),
        ).toBeVisible()

        // A filter brings other runs, which are not ticked, and the selection waits for it to end.
        await userEvent.click(screen.getByRole('tab', { name: /Failed/ }))
        await screen.findByRole('checkbox', { name: /^Select Run failed 1A / })

        expect(box('failed 1A')).not.toBeChecked()
        expect(header()).not.toBeChecked()
        expect(
            within(selectionBar()!).getByText('Compare 2 traces'),
        ).toBeVisible()

        await userEvent.click(box('failed 1B'))

        expect(box('failed 1B')).toBeChecked()
        expect(within(selectionBar()!).getByText('3 selected')).toBeVisible()

        await userEvent.click(screen.getByRole('tab', { name: /All traces/ }))
        await screen.findByRole('checkbox', { name: /^Select Run 1A / })

        expect(box('1A')).toBeChecked()
        expect(box('1B')).not.toBeChecked()
        expect(within(selectionBar()!).getByText('3 selected')).toBeVisible()
    })

    it("ticks nothing while the rows on screen are the previous view's", async () => {
        const held = deferred()
        mockApi((url) =>
            url.includes('status=failed') ? held.promise : pagedList(url),
        )
        renderApp('/traces')
        await loaded()

        await userEvent.click(screen.getByRole('tab', { name: /Failed/ }))
        await waitFor(() =>
            expect(window.location.search).toContain('status=failed'),
        )

        // The old rows are still there, dimmed, until the answer comes.
        expect(box('1A')).toHaveAttribute('aria-disabled', 'true')
        expect(header()).toHaveAttribute('aria-disabled', 'true')

        await userEvent.click(header())
        await userEvent.click(box('1A'))

        expect(selectionBar()).toBeNull()
        expect(box('1A')).not.toBeChecked()

        held.resolve(await pagedList('/trail/api/traces?status=failed&page=1'))
        await screen.findByRole('checkbox', { name: /^Select Run failed 1A / })

        expect(selectionBar()).toBeNull()
        expect(box('failed 1A')).not.toHaveAttribute('aria-disabled')
    })

    it('is cleared by Clear', async () => {
        renderApp('/traces')
        await loaded()

        await userEvent.click(header())
        await userEvent.click(
            within(selectionBar()!).getByRole('button', { name: 'Clear' }),
        )

        expect(selectionBar()).toBeNull()
        expect(box('1A')).not.toBeChecked()
    })

    it('is cleared when the time range changes', async () => {
        renderApp('/traces')
        await loaded()

        await userEvent.click(header())
        expect(selectionBar()).not.toBeNull()

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 7 days' }),
        )

        await waitFor(() => expect(selectionBar()).toBeNull())
        expect(box('1A')).not.toBeChecked()
    })

    it('does not open the run on a click or Space on the checkbox, while the row link still does', async () => {
        renderApp('/traces')
        await loaded()

        await userEvent.click(box('1A'))

        expect(window.location.pathname).toBe('/trail/traces')

        box('1B').focus()
        await userEvent.keyboard(' ')

        expect(box('1B')).toBeChecked()
        expect(window.location.pathname).toBe('/trail/traces')

        await userEvent.keyboard('{Enter}')

        expect(window.location.pathname).toBe('/trail/traces')

        await userEvent.click(screen.getByRole('link', { name: 'Run 1A' }))

        expect(window.location.pathname).toBe('/trail/traces/p1-A')
    })
})

describe('the selection bar', () => {
    it('says what is missing for a comparison, and offers it for exactly two', async () => {
        renderApp('/traces')
        await loaded()

        await userEvent.click(box('1A'))
        let current = within(selectionBar()!)

        expect(current.getByText('1 selected')).toBeVisible()
        expect(current.getByText('Select one more to compare')).toBeVisible()
        expect(
            current.queryByRole('link', { name: /Compare/ }),
        ).not.toBeInTheDocument()

        await userEvent.click(box('1B'))
        current = within(selectionBar()!)

        expect(
            current.getByRole('link', { name: 'Compare 2 traces' }),
        ).toBeVisible()
        expect(current.queryByText(/selected/)).not.toBeInTheDocument()

        await userEvent.click(next())
        await screen.findByRole('checkbox', { name: /^Select Run 2A / })
        await userEvent.click(box('2A'))
        current = within(selectionBar()!)

        expect(current.getByText('3 selected')).toBeVisible()
        expect(current.getByText('Compare needs exactly two')).toBeVisible()
        expect(
            current.queryByRole('link', { name: /Compare/ }),
        ).not.toBeInTheDocument()
    })

    it('opens the comparison with the two runs in the order they were selected and the list to come back to', async () => {
        renderApp('/traces?range=7d&sort=-cost')
        await loaded()

        await userEvent.click(box('1B'))
        await userEvent.click(box('1A'))
        await userEvent.click(
            screen.getByRole('link', { name: 'Compare 2 traces' }),
        )

        expect(window.location.pathname).toBe('/trail/traces/compare')
        expect(
            Object.fromEntries(new URLSearchParams(window.location.search)),
        ).toEqual({
            a: 'p1-B',
            b: 'p1-A',
            from: '/traces?range=7d&sort=-cost',
        })
    })

    it("exports the selection by id, in the order it was selected, for the selection's range", async () => {
        renderApp('/traces?range=7d&status=failed')
        await loaded()

        await userEvent.click(box('failed 1B'))
        await userEvent.click(box('failed 1A'))

        const link = screen.getByRole('link', { name: 'Export selection' })

        // The server drops runs outside the range; the bar says so and claims nothing more.
        expect(
            within(selectionBar()!).getByText(
                'Runs outside the time range are left out.',
            ),
        ).toBeVisible()
        expect(screen.getByText('2 runs selected')).toHaveAttribute(
            'role',
            'status',
        )

        expect(link).toHaveAttribute('download')
        expect(paramsOf(link.getAttribute('href') ?? '')).toEqual({
            range: '7d',
            ids: 'failed-p1-B,failed-p1-A',
        })
        expect(link.getAttribute('href')).toMatch(
            /^\/trail\/api\/traces\/export\?/,
        )
    })

    it('cannot export more runs than the endpoint takes, and says why', async () => {
        mockApi((url) => pagedList(url, 101))
        renderApp('/traces')
        await screen.findByRole('checkbox', {
            name: 'Select all runs on this page',
        })
        await screen.findByRole('navigation', { name: 'Pagination' })

        await userEvent.click(header())

        const current = within(selectionBar()!)
        const button = current.getByRole('button', { name: 'Export selection' })

        expect(current.getByText('101 selected')).toBeVisible()
        expect(button).toBeDisabled()
        expect(button).toHaveAccessibleDescription(
            'At most 100 runs can be exported at once.',
        )
        expect(
            current.queryByRole('link', { name: 'Export selection' }),
        ).not.toBeInTheDocument()

        await userEvent.click(box('1R0'))

        expect(
            within(selectionBar()!).getByRole('link', {
                name: 'Export selection',
            }),
        ).toBeVisible()
    })
})
