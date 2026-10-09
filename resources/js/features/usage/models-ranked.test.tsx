import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageModelRow } from '@/api/types'
import { forgetAttentionRefreshFailures } from '@/features/overview/use-attention'
import { forgetOverviewRefreshFailures } from '@/features/overview/use-overview'
import { forgetRankedModelsRefreshFailures } from '@/features/usage/use-ranked-models'
import { refreshEvery } from '@/lib/refresh-policy'
import {
    deferred,
    json,
    mockApi,
    modelUrls,
    overviewFixture,
    overviewWith,
    paramsOf,
    quietOverviewFor,
    runs,
    type Handler,
} from '@/test/overview-api'
import { renderApp } from '@/test/render-app'
import {
    breakdownOf,
    embedding,
    gpt5,
    haiku,
    sonnet,
    unpricedModel,
} from '@/test/usage-api'
import { until } from '@/test/wait'

beforeEach(() => {
    forgetOverviewRefreshFailures()
    forgetAttentionRefreshFailures()
    forgetRankedModelsRefreshFailures()
})

afterEach(() => {
    vi.useRealTimers()
})

const rangeOf = (url: string) => paramsOf(url).range as '1h' | '24h' | '7d'

/** The models endpoint answering with `rows`, `total` of them in all, for the range asked for. */
const models =
    (rows: UsageModelRow[], total = rows.length): Handler =>
    (url) =>
        json(breakdownOf('model', rows, { total, preset: rangeOf(url) }))

/** Seven models, of which the list asks for five. */
const seven = [
    sonnet,
    haiku,
    embedding,
    gpt5,
    ...['one', 'two', 'three'].map((name) => ({
        ...haiku,
        model: `model-${name}`,
        filters: { provider: 'anthropic', model: `model-${name}` },
    })),
]

/** The Overview with nothing running, so nothing is asked again by the clock while a test counts. */
const quiet: Handler = (url) => json(quietOverviewFor(url))

const list = () => screen.findByRole('list', { name: 'Models in this range' })
const heading = () => screen.findByRole('heading', { name: 'Models', level: 3 })
const part = (): HTMLElement => {
    const found = document.querySelector('[data-slot="models-ranked"]')

    if (!(found instanceof HTMLElement)) {
        throw new Error('The list of models is not on the page.')
    }

    return found
}

/** The Overview's own content: the figures, the chart and what needs attention. */
async function expectOverviewIntact() {
    await waitFor(() =>
        expect(
            document.querySelector('[data-slot="metric-strip"]'),
        ).not.toBeNull(),
    )
    expect(
        await screen.findByRole('img', {
            name: /traces started in this range/,
        }),
    ).toBeVisible()
    expect(
        await screen.findByRole('link', { name: 'Recovered by failover' }),
    ).toBeVisible()
}

function rowsOf(of: HTMLElement) {
    return within(of)
        .getAllByRole('listitem')
        .map((item) => ({
            text: item.textContent,
            href: within(item).queryByRole('link')?.getAttribute('href'),
        }))
}

describe('the list', () => {
    it('asks for the first five models by runs and lists them, each linking to its runs', async () => {
        const fetchMock = mockApi(
            quiet,
            undefined,
            undefined,
            undefined,
            models([sonnet, haiku, embedding, gpt5]),
        )
        renderApp('/')
        const of = await list()

        expect(modelUrls(fetchMock).map(paramsOf)).toEqual([
            {
                range: '24h',
                by: 'model',
                sort: '-runs',
                page: '1',
                per_page: '5',
            },
        ])
        expect(rowsOf(of)).toEqual([
            {
                text: 'claude-sonnet-4-5anthropic2 runs',
                href: '/trail/traces?provider=anthropic&model=claude-sonnet-4-5',
            },
            {
                text: 'claude-haiku-4-5anthropic2 runs',
                href: '/trail/traces?provider=anthropic&model=claude-haiku-4-5',
            },
            {
                text: 'text-embedding-3-smallopenai2 runs',
                href: '/trail/traces?provider=openai&model=text-embedding-3-small',
            },
            {
                text: 'gpt-5openai1 run',
                href: '/trail/traces?provider=openai&model=gpt-5',
            },
        ])
        // The models are the Overview's second heading level 3 under the chart's panel.
        expect(await heading()).toBeVisible()
        expect(part().closest('[data-slot="panel"]')).toContainElement(
            screen.getByRole('heading', { name: 'Trace activity' }),
        )
    })

    it('links to the runs of the range it was counted over', async () => {
        mockApi(quiet, undefined, undefined, undefined, models([sonnet]))
        renderApp('/?range=7d')
        const of = await list()

        expect(rowsOf(of)[0]?.href).toBe(
            '/trail/traces?range=7d&provider=anthropic&model=claude-sonnet-4-5',
        )
    })

    it('draws a row without a link, and says why, when its runs cannot be listed', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        mockApi(
            quiet,
            undefined,
            undefined,
            undefined,
            models([sonnet, { ...haiku, filters: {} }]),
        )
        renderApp('/')
        const of = await list()
        const [linked, loose] = rowsOf(of)

        expect(linked?.href).toBe(
            '/trail/traces?provider=anthropic&model=claude-sonnet-4-5',
        )
        expect(loose?.href).toBeUndefined()
        expect(loose?.text).toContain('claude-haiku-4-5')
        expect(loose?.text).toContain('Its runs could not be linked.')
        expect(linked?.text).not.toContain('could not be linked')
        error.mockRestore()
    })

    it('has no link to the rest with five models or fewer', async () => {
        mockApi(
            quiet,
            undefined,
            undefined,
            undefined,
            models(seven.slice(0, 5)),
        )
        renderApp('/')
        const of = await list()

        expect(rowsOf(of)).toHaveLength(5)
        expect(
            within(part()).queryByRole('link', { name: /^View all/ }),
        ).toBeNull()
    })

    it('links to the Usage page by model for the same range when there are more', async () => {
        mockApi(
            quiet,
            undefined,
            undefined,
            undefined,
            models(seven.slice(0, 5), seven.length),
        )
        renderApp('/')
        const of = await list()

        expect(rowsOf(of)).toHaveLength(5)
        expect(
            within(part())
                .getByRole('link', { name: 'View all models' })
                .getAttribute('href'),
        ).toBe('/trail/usage?by=model&sort=-runs')
    })

    it.each([
        ['volume', '/trail/usage?by=model&sort=-runs'],
        ['duration', '/trail/usage?by=model&sort=-runs'],
        // The Usage page ranks by cost unless told otherwise.
        ['cost', '/trail/usage?by=model'],
    ])(
        'opens the Usage page ranked as the list is under %s',
        async (chart, href) => {
            mockApi(
                quiet,
                undefined,
                undefined,
                undefined,
                models(seven.slice(0, 5), seven.length),
            )
            renderApp(`/?chart=${chart}`)
            await list()

            expect(
                within(part())
                    .getByRole('link', { name: 'View all models' })
                    .getAttribute('href'),
            ).toBe(href)
        },
    )

    it('keeps the range of the page in the link to the rest', async () => {
        mockApi(
            quiet,
            undefined,
            undefined,
            undefined,
            models(seven.slice(0, 5), seven.length),
        )
        renderApp('/?range=1h')
        await list()

        expect(
            within(part())
                .getByRole('link', { name: 'View all models' })
                .getAttribute('href'),
        ).toBe('/trail/usage?by=model&range=1h&sort=-runs')
    })
})

describe('what it ranks by', () => {
    it('ranks by runs under Volume and says so', async () => {
        const fetchMock = mockApi(
            quiet,
            undefined,
            undefined,
            undefined,
            models([sonnet, gpt5]),
        )
        renderApp('/')
        const of = await list()

        expect(modelUrls(fetchMock).map((url) => paramsOf(url).sort)).toEqual([
            '-runs',
        ])
        expect(rowsOf(of).map((row) => row.text)).toEqual([
            'claude-sonnet-4-5anthropic2 runs',
            'gpt-5openai1 run',
        ])
        expect(within(part()).getByText('Ranked by runs.')).toBeVisible()
        expect(
            within(part()).queryByText(/duration is not recorded/),
        ).toBeNull()
    })

    it('ranks by runs under Duration, because the breakdown has no duration per model, and says so', async () => {
        const fetchMock = mockApi(
            quiet,
            undefined,
            undefined,
            undefined,
            models([sonnet, gpt5]),
        )
        renderApp('/?chart=duration')
        const of = await list()

        expect(modelUrls(fetchMock).map((url) => paramsOf(url).sort)).toEqual([
            '-runs',
        ])
        expect(rowsOf(of).map((row) => row.text)).toEqual([
            'claude-sonnet-4-5anthropic2 runs',
            'gpt-5openai1 run',
        ])
        expect(
            within(part()).getByText(
                'Models are ranked by runs because duration is not recorded per model.',
            ),
        ).toBeVisible()
        expect(within(part()).queryByText('Ranked by runs.')).toBeNull()
    })

    it('ranks by estimated cost under Cost, with the runs beneath each amount', async () => {
        const fetchMock = mockApi(
            quiet,
            undefined,
            undefined,
            undefined,
            models([{ ...haiku }, { ...embedding }]),
        )
        renderApp('/?chart=cost')
        const of = await list()

        expect(modelUrls(fetchMock).map((url) => paramsOf(url).sort)).toEqual([
            '-cost',
        ])
        expect(rowsOf(of).map((row) => row.text)).toEqual([
            'claude-haiku-4-5anthropic$0.00452 runs',
            'text-embedding-3-smallopenai$0.00042 runs',
        ])
        expect(
            within(part()).getByText('Ranked by estimated cost.'),
        ).toBeVisible()
        expect(
            within(part()).queryByText(/duration is not recorded/),
        ).toBeNull()
    })

    it('says Unpriced, Not captured and So far where an amount is not final, and never $0', async () => {
        mockApi(
            quiet,
            undefined,
            undefined,
            undefined,
            models([sonnet, haiku, unpricedModel, gpt5]),
        )
        renderApp('/?chart=cost')
        const of = await list()
        const [pending, priced, unpriced, notCaptured] =
            within(of).getAllByRole('listitem')

        expect(within(pending).getByText('So far')).toBeVisible()
        expect(within(pending).getByText('$0.0083')).toBeVisible()
        expect(within(priced).getByText('$0.0045')).toBeVisible()
        expect(within(unpriced).getByText('Unpriced')).toBeVisible()
        expect(within(notCaptured).getByText('Not captured')).toBeVisible()
        // A model with no amount shows none, rather than a zero.
        expect(within(unpriced).queryByText(/\$/)).toBeNull()
        expect(within(notCaptured).queryByText(/\$/)).toBeNull()
    })

    it('asks again, ranked by the new figure, when the chart is switched, and ranks by runs when it is switched back', async () => {
        const fetchMock = mockApi(
            quiet,
            undefined,
            undefined,
            undefined,
            (url) =>
                json(
                    breakdownOf(
                        'model',
                        paramsOf(url).sort === '-cost'
                            ? [haiku, sonnet]
                            : [sonnet, haiku],
                        { preset: rangeOf(url) },
                    ),
                ),
        )
        renderApp('/')
        const of = await list()
        const texts = () =>
            rowsOf(within(part()).getByRole('list')).map((row) => row.text)

        expect(rowsOf(of).map((row) => row.text)).toEqual([
            'claude-sonnet-4-5anthropic2 runs',
            'claude-haiku-4-5anthropic2 runs',
        ])

        await userEvent.click(screen.getByRole('radio', { name: 'Cost' }))
        await waitFor(() =>
            expect(texts()).toEqual([
                'claude-haiku-4-5anthropic$0.00452 runs',
                'claude-sonnet-4-5anthropic$0.0083So far, runs are still running, so this can still grow2 runs',
            ]),
        )
        expect(modelUrls(fetchMock).map((url) => paramsOf(url).sort)).toContain(
            '-cost',
        )

        await userEvent.click(screen.getByRole('radio', { name: 'Duration' }))
        await waitFor(() =>
            expect(
                within(part()).getByText(/duration is not recorded per model/),
            ).toBeVisible(),
        )
        expect(
            rowsOf(within(part()).getByRole('list')).map((row) => row.text),
        ).toEqual([
            'claude-sonnet-4-5anthropic2 runs',
            'claude-haiku-4-5anthropic2 runs',
        ])
    })
})

describe('a ranking over part of the models', () => {
    it.each([
        [true, 'Ranked by runs among the models read; some were not.'],
        [false, 'Ranked by runs.'],
    ])(
        'says so only when the breakdown was cut (truncated: %s)',
        async (truncated, note) => {
            mockApi(quiet, undefined, undefined, undefined, (url) =>
                json(
                    breakdownOf('model', [sonnet, haiku], {
                        preset: rangeOf(url),
                        truncated,
                    }),
                ),
            )
            renderApp('/')
            await list()

            expect(within(part()).getByText(note)).toBeVisible()
            expect(within(part()).queryByText(/some were not/) === null).toBe(
                !truncated,
            )
        },
    )

    it.each([
        [
            'duration',
            'Models are ranked by runs because duration is not recorded per model among the models read; some were not.',
        ],
        [
            'cost',
            'Ranked by estimated cost among the models read; some were not.',
        ],
    ])('says it under %s as well', async (chart, note) => {
        mockApi(quiet, undefined, undefined, undefined, (url) =>
            json(
                breakdownOf('model', [sonnet], {
                    preset: rangeOf(url),
                    truncated: true,
                }),
            ),
        )
        renderApp(`/?chart=${chart}`)
        await list()

        expect(within(part()).getByText(note)).toBeVisible()
    })
})

describe('its states', () => {
    it('never shows the previous figure’s rows under the new note while the new ones load', async () => {
        const cost = deferred()

        mockApi(quiet, undefined, undefined, undefined, (url) =>
            paramsOf(url).sort === '-cost'
                ? cost.promise
                : models([sonnet])(url),
        )
        renderApp('/')
        await list()
        await userEvent.click(screen.getByRole('radio', { name: 'Cost' }))

        await waitFor(() =>
            expect(
                part().querySelector('[data-slot="ranked-list-skeleton"]'),
            ).not.toBeNull(),
        )
        expect(within(part()).queryByText(/2 runs/)).toBeNull()
        expect(within(part()).queryByText(/^Ranked by/)).toBeNull()
        expect(
            within(part()).queryByRole('list', {
                name: 'Models in this range',
            }),
        ).toBeNull()

        cost.resolve(await models([haiku])('/api/usage/breakdown?range=24h'))

        expect(await list()).toBeVisible()
        expect(
            within(part()).getByText('Ranked by estimated cost.'),
        ).toBeVisible()
        expect(within(part()).getByText('$0.0045')).toBeVisible()
    })

    it('asks nothing more when the chart goes Volume, Duration, Volume: it is one entry', async () => {
        const fetchMock = mockApi(
            quiet,
            undefined,
            undefined,
            undefined,
            models([sonnet]),
        )
        renderApp('/')
        await list()

        await userEvent.click(screen.getByRole('radio', { name: 'Duration' }))
        await within(part()).findByText(/duration is not recorded/)
        await userEvent.click(screen.getByRole('radio', { name: 'Volume' }))
        await within(part()).findByText('Ranked by runs.')

        expect(modelUrls(fetchMock)).toHaveLength(1)
    })

    it('draws placeholder rows while loading, and the Overview is usable meanwhile', async () => {
        const held = deferred()

        mockApi(quiet, undefined, undefined, undefined, () => held.promise)
        renderApp('/')
        await heading()

        expect(
            part().querySelector('[data-slot="ranked-list-skeleton"]'),
        ).not.toBeNull()
        expect(
            within(part()).queryByRole('list', {
                name: 'Models in this range',
            }),
        ).toBeNull()
        await expectOverviewIntact()

        held.resolve(await models([sonnet])('/api/usage/breakdown?range=24h'))

        expect(await list()).toBeVisible()
        expect(
            part().querySelector('[data-slot="ranked-list-skeleton"]'),
        ).toBeNull()
    })

    it('says so when no model was used, and the Overview is still there', async () => {
        mockApi(quiet, undefined, undefined, undefined, models([]))
        renderApp('/')

        expect(
            await screen.findByText('No model usage in this range'),
        ).toBeVisible()
        expect(
            within(part()).queryByRole('list', {
                name: 'Models in this range',
            }),
        ).toBeNull()
        expect(within(part()).queryByRole('link')).toBeNull()
        await expectOverviewIntact()
    })

    it('says it could not be loaded, keeps focus on the retry while it retries, and the Overview is untouched', async () => {
        const retry = deferred()
        let asked = 0

        mockApi(quiet, undefined, undefined, undefined, (url) => {
            asked += 1

            return asked === 1
                ? json({ message: 'The usage could not be read.' }, 500)
                : asked === 2
                  ? retry.promise
                  : models([sonnet])(url)
        })
        renderApp('/')
        const alert = await screen.findByRole('alert')

        expect(alert).toHaveTextContent('The models could not be loaded')
        await expectOverviewIntact()
        // Nothing else on the page failed.
        expect(screen.getAllByRole('alert')).toHaveLength(1)

        const button = within(alert).getByRole('button', { name: 'Try again' })

        await userEvent.click(button)
        await until(() => expect(asked).toBe(2))

        // The retry is in flight: the failure and its button are still there, and still focused.
        expect(button).toBeInTheDocument()
        expect(button).toHaveFocus()

        retry.resolve(await models([sonnet])('/api/usage/breakdown?range=24h'))

        expect(await list()).toBeVisible()
        expect(within(part()).queryByRole('alert')).toBeNull()
        // The button went away with focus on it: focus goes to the list's own heading.
        await waitFor(() =>
            expect(document.activeElement).toBe(part().querySelector('h3')),
        )
    })

    it('dims the previous range’s rows, and keeps their links, until the next range arrives', async () => {
        const next = deferred()

        mockApi(quiet, undefined, undefined, undefined, (url) =>
            rangeOf(url) === '7d' ? next.promise : models([sonnet])(url),
        )
        renderApp('/')
        const of = await list()
        const busy = () => part().querySelector('[aria-busy="true"]')

        expect(busy()).toBeNull()

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 7 days' }),
        )
        await until(() => expect(busy()).not.toBeNull())

        const dimmed = busy() as HTMLElement

        // Still the first range's rows, linked to the first range's runs.
        expect(within(dimmed).getByRole('list')).toBe(of)
        expect(rowsOf(of)[0]?.href).toBe(
            '/trail/traces?provider=anthropic&model=claude-sonnet-4-5',
        )
        // Said once, outside the busy part, where a screen reader may mute it.
        const statuses = within(part()).getAllByRole('status')

        expect(statuses).toHaveLength(1)
        expect(statuses[0]).toHaveTextContent('Loading the models')
        expect(dimmed).not.toContainElement(statuses[0])
        expect(dimmed.querySelector('[role="status"]')).toBeNull()

        next.resolve(await models([haiku])('/api/usage/breakdown?range=7d'))

        await waitFor(() => expect(busy()).toBeNull())
        expect(rowsOf(within(part()).getByRole('list'))[0]?.href).toBe(
            '/trail/traces?range=7d&provider=anthropic&model=claude-haiku-4-5',
        )
        expect(within(part()).getByRole('status')).toBeEmptyDOMElement()
    })
})

describe('refreshing', () => {
    const fakeInterval = () =>
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    async function tick() {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(refreshEvery)
        })
    }

    it('is not restarted or cancelled by the ticks of the page, and is asked again once when the page settles', async () => {
        fakeInterval()
        const slow = deferred()
        const signals: AbortSignal[] = []
        let overview = overviewFixture
        let asked = 0

        const fetchMock = mockApi(
            () => json(overview),
            undefined,
            undefined,
            undefined,
            (url, init) => {
                asked += 1
                signals.push(init?.signal as AbortSignal)

                return asked === 1 ? slow.promise : models([haiku])(url)
            },
        )

        renderApp('/')
        await until(() => expect(modelUrls(fetchMock)).toHaveLength(1))

        // The page's runs are still running and it asks again, twice; the held request is left alone.
        await tick()
        await tick()
        await until(() =>
            expect(
                fetchMock.mock.calls.filter(([url]) =>
                    url.includes('/api/overview?'),
                ).length,
            ).toBeGreaterThanOrEqual(3),
        )

        expect(modelUrls(fetchMock)).toHaveLength(1)
        expect(signals[0]?.aborted).toBe(false)

        // Nothing runs any more: one more request, once the held one has landed.
        overview = overviewWith({ runs: runs({ completed: 32 }) })
        await tick()
        await until(() => expect(modelUrls(fetchMock)).toHaveLength(1))
        slow.resolve(await models([sonnet])('/api/usage/breakdown?range=24h'))
        await until(() => expect(modelUrls(fetchMock)).toHaveLength(2))
        await waitFor(() =>
            expect(
                rowsOf(within(part()).getByRole('list')).map((row) => row.text),
            ).toEqual(['claude-haiku-4-5anthropic2 runs']),
        )

        // Settled: the page asks for nothing again, and neither does the list.
        await tick()
        await tick()
        expect(modelUrls(fetchMock)).toHaveLength(2)
        expect(signals.every((signal) => !signal.aborted)).toBe(true)
    })

    it('keeps the rows and says so when the refresh after the page settles fails', async () => {
        fakeInterval()
        let overview = overviewFixture
        let asked = 0

        const fetchMock = mockApi(
            () => json(overview),
            undefined,
            undefined,
            undefined,
            (url) => {
                asked += 1

                return asked === 1
                    ? models([sonnet])(url)
                    : json({ message: 'The usage could not be read.' }, 500)
            },
        )

        renderApp('/')
        await list()

        overview = overviewWith({ runs: runs({ completed: 32 }) })
        await tick()
        await until(() => expect(modelUrls(fetchMock)).toHaveLength(2))

        expect(await screen.findByText(/The last refresh failed/)).toBeVisible()
        expect(
            rowsOf(within(part()).getByRole('list')).map((row) => row.text),
        ).toEqual(['claude-sonnet-4-5anthropic2 runs'])
        expect(within(part()).queryByRole('alert')).toBeNull()
    })

    it('asks again from the note, and puts focus on the list’s heading when it recovers', async () => {
        fakeInterval()
        let overview = overviewFixture
        let asked = 0

        const fetchMock = mockApi(
            () => json(overview),
            undefined,
            undefined,
            undefined,
            (url) => {
                asked += 1

                return asked === 2
                    ? json({ message: 'The usage could not be read.' }, 500)
                    : models(asked === 1 ? [sonnet] : [haiku])(url)
            },
        )

        renderApp('/')
        await list()
        overview = overviewWith({ runs: runs({ completed: 32 }) })
        await tick()
        await screen.findByText(/The last refresh failed/)

        const retry = within(part()).getByRole('button', { name: 'Try again' })

        await userEvent.click(retry)
        await until(() => expect(modelUrls(fetchMock)).toHaveLength(3))

        await waitFor(() =>
            expect(
                rowsOf(within(part()).getByRole('list')).map((row) => row.text),
            ).toEqual(['claude-haiku-4-5anthropic2 runs']),
        )
        expect(within(part()).queryByText(/The last refresh failed/)).toBeNull()
        expect(document.activeElement).toBe(part().querySelector('h3'))
    })
})
