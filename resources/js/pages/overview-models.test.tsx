import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { forgetAttentionRefreshFailures } from '@/features/overview/use-attention'
import { forgetOverviewRefreshFailures } from '@/features/overview/use-overview'
import { renderApp } from '@/test/render-app'
import {
    deferred,
    json,
    mockApi,
    modelsFor,
    modelUrls,
    overviewFor,
    overviewUrls,
    paramsOf,
    quietOverviewFor,
} from '@/test/overview-api'

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

describe('the models beside the chart', () => {
    it('are in the activity panel, after the chart, and not a panel of their own', async () => {
        const main = await open()
        const activity = screen
            .getByRole('heading', { name: 'Trace activity' })
            .closest('[data-slot="panel"]') as HTMLElement
        const models = await within(activity).findByRole('heading', {
            name: 'Models',
            level: 3,
        })
        const chart = within(activity).getByRole('img', {
            name: /traces started in this range/,
        })

        expect(before(chart, models)).toBe(true)
        expect(models.closest('[data-slot="panel"]')).toBe(activity)
        expect(main.querySelectorAll('[data-slot="panel"]')).toHaveLength(3)
    })

    it('announce their loading apart from the chart’s, each once, outside every busy part', async () => {
        const overview = deferred()
        const next = deferred()

        mockApi(
            (url) =>
                paramsOf(url).range === '7d'
                    ? overview.promise
                    : json(quietOverviewFor(url)),
            undefined,
            undefined,
            undefined,
            (url) =>
                paramsOf(url).range === '7d'
                    ? next.promise
                    : json(modelsFor(url)),
        )
        renderApp('/')
        await screen.findByRole('list', { name: 'Models in this range' })

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 7 days' }),
        )

        const activity = screen
            .getByRole('heading', { name: 'Trace activity' })
            .closest('[data-slot="panel"]') as HTMLElement

        // The chart is the previous range's, dimmed; so are the models. Two different sentences.
        await waitFor(() =>
            expect(
                within(activity)
                    .getAllByRole('status')
                    .map((one) => one.textContent),
            ).toEqual(['Loading the activity chart', 'Loading the models']),
        )

        const statuses = within(activity).getAllByRole('status')
        const busy = activity.querySelectorAll('[aria-busy="true"]')

        expect(busy).toHaveLength(2)
        for (const region of busy) {
            for (const status of statuses) {
                expect(region).not.toContainElement(status)
            }
        }
        expect(
            within(activity).getAllByText(
                /^Loading the (activity chart|models)$/,
            ),
        ).toHaveLength(2)

        overview.resolve(
            await json({
                ...overviewFor('/api/overview?range=7d'),
            }),
        )
        next.resolve(await json(modelsFor('/api/usage/breakdown?range=7d')))
    })

    it('are asked for once, as a request of their own, ranked by runs', async () => {
        const fetchMock = mockApi()
        renderApp('/')
        await screen.findByRole('list', { name: 'Models in this range' })

        expect(modelUrls(fetchMock).map(paramsOf)).toEqual([
            {
                range: '24h',
                by: 'model',
                sort: '-runs',
                page: '1',
                per_page: '5',
            },
        ])
        // The overview's own request carries nothing of the list's.
        expect(overviewUrls(fetchMock).map(paramsOf)).toEqual([
            { range: '24h' },
        ])
    })
})
