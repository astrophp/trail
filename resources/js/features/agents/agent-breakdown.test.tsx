import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentModel, AgentTool } from '@/api/types'
import { forgetAgentRefreshFailures } from '@/features/agents/use-agent'
import { forgetBreakdownRefreshFailures } from '@/features/agents/use-agent-breakdown'
import { forgetRecentTracesRefreshFailures } from '@/features/traces'
import {
    breakdownFixture,
    breakdownFor,
    breakdownUrls,
    deferred,
    json,
    mockApi,
    panel,
    paramsOf,
    showFixture,
    showFor,
    strip,
    subAgentOnly,
} from '@/test/agent-page-api'
import { renderApp } from '@/test/render-app'
import { until } from '@/test/wait'

beforeEach(() => {
    forgetAgentRefreshFailures()
    forgetBreakdownRefreshFailures()
    forgetRecentTracesRefreshFailures()
})

afterEach(() => {
    vi.useRealTimers()
})

const reported = {
    state: 'reported',
    input_tokens: 40_000,
    output_tokens: 12_000,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: 52_000,
} as const

const notReported = {
    state: 'not_reported',
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: null,
} as const

const model = (over: Partial<AgentModel> & { model: string }): AgentModel => ({
    provider: 'anthropic',
    steps: 80,
    runs: 20,
    usage: reported,
    cost: { state: 'estimated', amount: 4.1 },
    filters: {
        agent: 'SupportAssistant',
        provider: over.provider ?? 'anthropic',
        model: over.model,
    },
    ...over,
})

const tool = (over: Partial<AgentTool> & { name: string }): AgentTool => ({
    calls: 40,
    failed: 0,
    runs: 20,
    filters: { agent: 'SupportAssistant', tool: over.name },
    ...over,
})

const nothingDelegated = { models: [], tools: [] }
const nothingCut = { limit: 20, total: 0 }

/** The agent's answer with a run still running, as the fixture has it. */
const showFixtureRunning = (url: string) => ({
    ...showFixture,
    data: {
        ...showFixture.data,
        agent: {
            ...showFixture.data.agent,
            name: paramsOf(url).name ?? '',
        },
    },
    range: { ...showFixture.range, preset: '24h' as const },
})

const route = (search = '') => `/agents/agent?name=SupportAssistant${search}`

/** A panel's rows, each as its text. */
const rowsOf = (title: string) =>
    within(panel(title))
        .queryAllByRole('listitem')
        .filter((item) => item.matches('[data-slot="ranked-list-item"]'))

/** The own rows of a panel: those above the list of what happened inside delegated runs. */
const ownRows = (title: string) =>
    rowsOf(title).filter(
        (item) => item.closest('[data-slot="delegated-rows"]') === null,
    )

const delegatedRows = (title: string) =>
    rowsOf(title).filter(
        (item) => item.closest('[data-slot="delegated-rows"]') !== null,
    )

const hrefOf = (row: HTMLElement) =>
    within(row).getByRole('link').getAttribute('href') ?? ''

/** The filters a link writes into the traces list, with the range, as the list reads them. */
const filtersOf = (href: string) =>
    Object.fromEntries(new URL(href, 'http://x').searchParams)

/** How full the share bar of a row is, as a percentage; `null` when it has none. */
const barOf = (row: HTMLElement) => {
    const fill = row.querySelector<HTMLElement>(
        '[data-slot="ranked-list-bar"] > div',
    )

    return fill === null ? null : fill.style.width
}

async function open(search = '') {
    renderApp(route(search))
    await screen.findByText('Estimated cost')
}

describe('the models', () => {
    const models = [
        model({ model: 'claude-a', runs: 20, steps: 80 }),
        model({
            model: 'claude-b/x 1+2',
            runs: 8,
            steps: 8,
            usage: { ...reported, state: 'pending', total_tokens: 900 },
            cost: { state: 'pending', amount: 0.5 },
        }),
        model({
            provider: 'openai',
            model: 'gpt-x',
            runs: 5,
            steps: 5,
            usage: notReported,
            cost: { state: 'unpriced', amount: null },
        }),
        model({
            model: 'claude-asked',
            runs: 2,
            steps: 0,
            usage: notReported,
            cost: { state: 'not_captured', amount: null },
        }),
    ]

    beforeEach(() => {
        mockApi({
            breakdown: (url) =>
                json(
                    breakdownFor(url, {
                        models,
                        tools: [],
                        delegated: nothingDelegated,
                    }),
                ),
        })
    })

    it('are listed most runs first, each with its values in its own row', async () => {
        await open()
        await screen.findByText('claude-a')

        const [first, second, third, fourth] = ownRows('Models')

        expect(first).toHaveTextContent('claude-a')
        expect(first).toHaveTextContent('anthropic')
        expect(first).toHaveTextContent('20 runs')
        expect(first).toHaveTextContent('80 calls')
        expect(first).toHaveTextContent('$4.10')
        expect(first).toHaveTextContent(/Tokens 52.0k/)
        expect(first).toHaveTextContent('52,000 tokens')

        expect(second).toHaveTextContent('claude-b/x 1+2')
        expect(second).toHaveTextContent('8 runs')
        expect(second).toHaveTextContent('8 calls')

        expect(third).toHaveTextContent('gpt-x')
        expect(third).toHaveTextContent('openai')
        expect(third).toHaveTextContent('5 runs')

        // One row's values are never in another's.
        expect(first).not.toHaveTextContent('gpt-x')
        expect(third).not.toHaveTextContent('52,000')
        // Calls that reported no usage say so; they are not silent about tokens.
        expect(third).toHaveTextContent('Tokens Not reported')
        expect(third).not.toHaveTextContent('$4.10')

        expect(fourth).toHaveTextContent('claude-asked')
        expect(fourth).toHaveTextContent('2 runs')
    })

    it('say that a model was asked for and never called, instead of 0 calls and a cost of nothing', async () => {
        await open()
        await screen.findByText('claude-a')
        const [first, , , asked] = ownRows('Models')

        expect(asked).toHaveTextContent('asked for, not called')
        expect(asked).not.toHaveTextContent('0 calls')
        expect(asked).not.toHaveTextContent('Not captured')
        expect(asked).not.toHaveTextContent('Tokens')
        expect(asked).not.toHaveTextContent('Not reported')
        // A model that was called does not say it was not.
        expect(first).not.toHaveTextContent('asked for, not called')
    })

    it('are links named by the model and what it is worth, not by the label alone', async () => {
        await open()
        await screen.findByText('claude-a')

        expect(
            within(panel('Models')).getByRole('link', {
                name: /^claude-a.* 20 runs$/,
            }),
        ).toBeVisible()
    })

    it('say what the calls cost in the state the API gives, and what the tokens are', async () => {
        await open()
        await screen.findByText('claude-a')
        const [, pending, unpriced] = ownRows('Models')

        // Pending: the amount so far with its tag, and the tokens as pending, never as final.
        expect(pending).toHaveTextContent('$0.50')
        expect(pending).toHaveTextContent('So far')
        expect(pending).toHaveTextContent('Tokens Pending')
        expect(pending).not.toHaveTextContent('Tokens 900')
        expect(unpriced).toHaveTextContent('Unpriced')
        expect(unpriced).toHaveTextContent('Tokens Not reported')
    })

    it('draw the share of the agent’s runs that used it as a bar, clamped to the whole', async () => {
        await open()
        await screen.findByText('claude-a')
        const [over, part, , asked] = ownRows('Models')

        // 20 runs of 23 (the agent's own).
        expect(barOf(over)).toBe(`${(20 / 23) * 100}%`)
        expect(barOf(part)).toBe(`${(8 / 23) * 100}%`)
        expect(barOf(asked)).toBe(`${(2 / 23) * 100}%`)
    })

    it('clamp a share past the whole to the whole', async () => {
        mockApi({
            show: (url) =>
                json(
                    showFor(url, {
                        agent: {
                            top_level: {
                                ...showFor('?name=x').data.agent.top_level!,
                                runs: {
                                    all: 10,
                                    completed: 10,
                                    failed: 0,
                                    incomplete: 0,
                                    running: 0,
                                    awaiting_approval: 0,
                                },
                            },
                        },
                    }),
                ),
            breakdown: (url) =>
                json(
                    breakdownFor(url, {
                        models: [model({ model: 'claude-a', runs: 30 })],
                        tools: [],
                        delegated: nothingDelegated,
                    }),
                ),
        })
        await open()
        await screen.findByText('claude-a')

        expect(barOf(ownRows('Models')[0])).toBe('100%')
    })

    it('draw no bar when there is no total to take a share of', async () => {
        // The agent's figures are still the previous range's while the models of the next arrive.
        const next = deferred()
        mockApi({
            show: (url) =>
                paramsOf(url).range === '7d'
                    ? next.promise
                    : json(showFor(url)),
            breakdown: (url) =>
                json(
                    breakdownFor(url, {
                        models,
                        tools: [],
                        delegated: nothingDelegated,
                    }),
                ),
        })
        await open()
        await screen.findByText('claude-a')
        expect(barOf(ownRows('Models')[0])).not.toBeNull()

        await userEvent.click(screen.getByRole('combobox'))
        await userEvent.click(
            await screen.findByRole('option', { name: 'Last 7 days' }),
        )
        await waitFor(() =>
            expect(strip()?.closest('[aria-busy="true"]')).not.toBeNull(),
        )
        await waitFor(() => expect(barOf(ownRows('Models')[0])).toBeNull())
    })

    it('link to exactly the runs the row counted, over the range of the answer', async () => {
        await open('&range=7d')
        await screen.findByText('claude-a')

        for (const [index, row] of ownRows('Models').entries()) {
            const filters = models[index].filters

            expect(filtersOf(hrefOf(row))).toEqual({
                range: '7d',
                ...filters,
            })
        }

        expect(hrefOf(ownRows('Models')[1])).toBe(
            `/trail/traces?${new URLSearchParams({ range: '7d', agent: 'SupportAssistant', provider: 'anthropic', model: 'claude-b/x 1+2' })}`,
        )
    })

    it('say so, with no link, for a row whose filters the list could not keep', async () => {
        const report = vi.spyOn(console, 'error').mockImplementation(() => {})

        mockApi({
            breakdown: (url) =>
                json(
                    breakdownFor(url, {
                        models: [
                            model({ model: 'ok-model' }),
                            model({
                                model: 'odd-model',
                                filters: {
                                    agent: 'SupportAssistant',
                                    streamed: '1',
                                },
                            }),
                        ],
                        tools: [],
                        delegated: nothingDelegated,
                    }),
                ),
        })
        await open()
        await screen.findByText('ok-model')
        const [linked, odd] = ownRows('Models')

        expect(within(linked).getByRole('link')).toBeVisible()
        expect(within(odd).queryByRole('link')).toBeNull()
        expect(odd).toHaveTextContent('Its runs could not be linked.')
        expect(linked).not.toHaveTextContent('could not be linked')
        expect(report).toHaveBeenCalledWith(
            expect.stringContaining('no "streamed" filter'),
        )
        report.mockRestore()
    })

    it('say so, with no link, for a row with no filters or a filter value the list would trim', async () => {
        const report = vi.spyOn(console, 'error').mockImplementation(() => {})

        mockApi({
            breakdown: (url) =>
                json(
                    breakdownFor(url, {
                        models: [
                            model({ model: 'ok-model' }),
                            model({ model: 'bare-model', filters: {} }),
                            model({
                                model: 'padded-model',
                                filters: {
                                    agent: ' SupportAssistant',
                                    provider: 'anthropic',
                                    model: 'padded-model',
                                },
                            }),
                        ],
                        tools: [],
                        delegated: nothingDelegated,
                    }),
                ),
        })
        await open()
        await screen.findByText('ok-model')
        const [linked, bare, padded] = ownRows('Models')

        expect(within(linked).getByRole('link')).toBeVisible()
        expect(within(bare).queryByRole('link')).toBeNull()
        expect(bare).toHaveTextContent('Its runs could not be linked.')
        expect(within(padded).queryByRole('link')).toBeNull()
        expect(padded).toHaveTextContent('Its runs could not be linked.')
        report.mockRestore()
    })
})

describe('the tools', () => {
    const tools = [
        tool({ name: 'lookup/order 1', runs: 18, calls: 41, failed: 3 }),
        tool({ name: 'send_email', runs: 4, calls: 1, failed: 0 }),
    ]

    beforeEach(() => {
        mockApi({
            breakdown: (url) =>
                json(
                    breakdownFor(url, {
                        models: [],
                        tools,
                        delegated: nothingDelegated,
                    }),
                ),
        })
    })

    it('are listed by their name in the code font, with their runs, calls and failures in their own row', async () => {
        await open()
        await screen.findByText('send_email')
        const [first, second] = ownRows('Tools')

        expect(within(first).getByText('lookup/order 1')).toHaveClass(
            'font-mono',
        )
        expect(first).toHaveTextContent('18 runs')
        expect(first).toHaveTextContent('41 calls')
        expect(first).toHaveTextContent('3 failed')

        expect(second).toHaveTextContent('send_email')
        expect(second).toHaveTextContent('4 runs')
        // A call in the singular, and no failures said when there were none.
        expect(second).toHaveTextContent('1 call')
        expect(second).not.toHaveTextContent('1 calls')
        expect(second).not.toHaveTextContent('failed')
        expect(second).not.toHaveTextContent('3')
    })

    it('draw the share of the agent’s runs that called it', async () => {
        await open()
        await screen.findByText('send_email')
        const [first, second] = ownRows('Tools')

        expect(barOf(first)).toBe(`${(18 / 23) * 100}%`)
        expect(barOf(second)).toBe(`${(4 / 23) * 100}%`)
    })

    it('link to exactly the runs of the row, with the tool filter the list reads', async () => {
        await open('&range=1h')
        await screen.findByText('send_email')

        for (const [index, row] of ownRows('Tools').entries()) {
            expect(filtersOf(hrefOf(row))).toEqual({
                range: '1h',
                ...tools[index].filters,
            })
        }
    })
})

describe('a tool whose name is empty', () => {
    it('is drawn without a link, since a link would show the runs of every tool', async () => {
        const report = vi.spyOn(console, 'error').mockImplementation(() => {})

        mockApi({
            breakdown: (url) =>
                json(
                    breakdownFor(url, {
                        models: [],
                        tools: [
                            tool({ name: 'real_tool' }),
                            tool({
                                name: '',
                                filters: {
                                    agent: 'SupportAssistant',
                                    tool: '',
                                },
                            }),
                        ],
                        delegated: nothingDelegated,
                    }),
                ),
        })
        await open()
        await screen.findByText('real_tool')
        const [linked, empty] = ownRows('Tools')

        expect(within(linked).getByRole('link')).toBeVisible()
        expect(within(empty).queryByRole('link')).toBeNull()
        expect(empty).toHaveTextContent('Its runs could not be linked.')
        report.mockRestore()
    })
})

describe('what happened inside the runs it was delegated to', () => {
    const delegated = {
        models: [
            {
                provider: 'openai',
                model: 'gpt-inner',
                steps: 3,
                runs: 2,
                usage: reported,
                cost: { state: 'estimated', amount: 0.2 },
            },
        ],
        tools: [{ name: 'inner_tool', calls: 3, failed: 1, runs: 2 }],
    } as const

    it('is a quieter list under the agent’s own, with no links and no bars, and says why', async () => {
        mockApi({
            breakdown: (url) =>
                json(
                    breakdownFor(url, {
                        models: [model({ model: 'own-model' })],
                        tools: [tool({ name: 'own_tool' })],
                        delegated: {
                            models: [...delegated.models],
                            tools: [...delegated.tools],
                        },
                    }),
                ),
        })
        await open()
        await screen.findByText('own-model')

        for (const title of ['Models', 'Tools']) {
            const [own] = ownRows(title)
            const [inner] = delegatedRows(title)

            // Paired: the agent's own row links and has a bar, the delegated one has neither.
            expect(within(own).getByRole('link')).toBeVisible()
            expect(barOf(own)).not.toBeNull()
            expect(within(inner).queryByRole('link')).toBeNull()
            expect(barOf(inner)).toBeNull()
            expect(
                within(panel(title)).getByRole('heading', {
                    level: 3,
                    name: 'Inside its runs as a sub-agent',
                }),
            ).toBeVisible()
        }

        expect(delegatedRows('Models')[0]).toHaveTextContent('gpt-inner')
        expect(delegatedRows('Models')[0]).toHaveTextContent('2 runs')
        expect(delegatedRows('Tools')[0]).toHaveTextContent('inner_tool')
        expect(delegatedRows('Tools')[0]).toHaveTextContent('1 failed')
        expect(
            within(panel('Models')).getByText(
                'The traces list cannot filter on these, so they have no links.',
            ),
        ).toBeVisible()
    })

    it('is a list with a name of its own, for when no heading comes before it', async () => {
        mockApi({
            show: (url) => json(showFor(url, subAgentOnly)),
            breakdown: (url) =>
                json(
                    breakdownFor(url, {
                        models: [],
                        tools: [],
                        delegated: {
                            models: [...delegated.models],
                            tools: [...delegated.tools],
                        },
                    }),
                ),
        })
        renderApp(route())
        await screen.findByText('gpt-inner')

        expect(
            within(panel('Models')).getByRole('list', {
                name: 'Models used inside the runs it was delegated to',
            }),
        ).toBeVisible()
        expect(
            within(panel('Tools')).getByRole('list', {
                name: 'Tools used inside the runs it was delegated to',
            }),
        ).toBeVisible()
    })

    it('is left out when there is none', async () => {
        mockApi({
            breakdown: (url) =>
                json(
                    breakdownFor(url, {
                        models: [model({ model: 'own-model' })],
                        tools: [tool({ name: 'own_tool' })],
                        delegated: nothingDelegated,
                    }),
                ),
        })
        await open()
        await screen.findByText('own-model')

        expect(delegatedRows('Models')).toEqual([])
        expect(screen.queryByText('Inside its runs as a sub-agent')).toBeNull()
    })

    it('is the main content of an agent that only ran as a sub-agent, with no heading of its own for it', async () => {
        mockApi({
            show: (url) => json(showFor(url, subAgentOnly)),
            breakdown: (url) =>
                json(
                    breakdownFor(url, {
                        models: [],
                        tools: [],
                        delegated: {
                            models: [...delegated.models],
                            tools: [...delegated.tools],
                        },
                    }),
                ),
        })
        renderApp(route())
        await screen.findByText('gpt-inner')

        expect(ownRows('Models')).toHaveLength(0)
        expect(delegatedRows('Models')).toHaveLength(1)
        expect(delegatedRows('Tools')).toHaveLength(1)
        expect(screen.queryByText('Inside its runs as a sub-agent')).toBeNull()
        expect(within(panel('Models')).queryByRole('link')).toBeNull()
        expect(within(panel('Tools')).queryByRole('link')).toBeNull()
        expect(
            within(panel('Models')).getByText(
                /Counted inside the runs of the agents/,
            ),
        ).toBeVisible()
    })

    it('says what the agent’s own runs recorded when only the delegated ones have rows', async () => {
        mockApi({
            breakdown: (url) =>
                json(
                    breakdownFor(url, {
                        models: [],
                        tools: [],
                        delegated: {
                            models: [...delegated.models],
                            tools: [...delegated.tools],
                        },
                    }),
                ),
        })
        await open()
        await screen.findByText('gpt-inner')

        expect(
            within(panel('Models')).getByText(
                'Its own runs recorded no model in this range.',
            ),
        ).toBeVisible()
        expect(
            within(panel('Tools')).getByText(
                'Its own runs recorded no tool in this range.',
            ),
        ).toBeVisible()
        expect(
            screen.queryByText('No model was called in this range'),
        ).toBeNull()
    })
})

describe('a list that was cut', () => {
    it('says how many of how many it shows, for each list that was', async () => {
        mockApi({
            breakdown: (url) =>
                json(
                    breakdownFor(
                        url,
                        {
                            models: [model({ model: 'm' })],
                            tools: [tool({ name: 't' })],
                            delegated: {
                                models: [
                                    {
                                        provider: 'p',
                                        model: 'dm',
                                        steps: 1,
                                        runs: 1,
                                        usage: reported,
                                        cost: { state: 'estimated', amount: 1 },
                                    },
                                ],
                                tools: [],
                            },
                        },
                        {
                            models: { limit: 20, total: 1234 },
                            tools: { limit: 20, total: 20 },
                            delegated: {
                                models: { limit: 5, total: 6 },
                                tools: nothingCut,
                            },
                        },
                    ),
                ),
        })
        await open()
        await screen.findByText('m')

        const models = within(panel('Models'))

        expect(models.getByText('Showing the first 20 of 1,234')).toBeVisible()
        expect(models.getByText('Showing the first 5 of 6')).toBeVisible()
        // A list with everything in it says nothing about being cut.
        expect(
            within(panel('Tools')).queryByText(/Showing the first/),
        ).toBeNull()
    })
})

describe('the states of each panel', () => {
    it('are loading while the models and tools are, and the rest of the page is not held up', async () => {
        const pending = deferred()
        const fetchMock = mockApi({ breakdown: () => pending.promise })

        await open()
        await until(() => expect(breakdownUrls(fetchMock)).toHaveLength(1))

        for (const title of ['Models', 'Tools']) {
            expect(
                panel(title).querySelector('[data-slot="panel-loading"]'),
            ).not.toBeNull()
        }

        expect(strip()).not.toBeNull()
        expect(
            await screen.findByRole('heading', { name: 'Needs attention' }),
        ).toBeVisible()
        await screen.findByRole('heading', { name: 'Recent traces' })

        pending.resolve(await json(breakdownFor('?range=24h')))
        await screen.findAllByText('claude-haiku-4-5')

        expect(
            panel('Models').querySelector('[data-slot="panel-loading"]'),
        ).toBeNull()
    })

    it('are failed with a way to try again, and the failure leaves the rest of the page as it is', async () => {
        let fail = true
        mockApi({
            breakdown: (url) =>
                fail
                    ? json({ message: 'Down.' }, 500)
                    : json(breakdownFor(url)),
        })

        await open()

        for (const title of ['Models', 'Tools']) {
            expect(
                await within(panel(title)).findByRole('alert'),
            ).toHaveTextContent(
                `The ${title.toLowerCase().slice(0, -1)}s could not be loaded`,
            )
        }

        expect(strip()).not.toBeNull()
        expect(
            screen.getByRole('heading', { name: 'Recent traces' }),
        ).toBeVisible()
        expect(
            screen.getByRole('heading', { name: 'Needs attention' }),
        ).toBeVisible()
        // Only the models and the tools say anything failed.
        expect(screen.getAllByRole('alert')).toHaveLength(2)

        fail = false
        await userEvent.click(
            within(panel('Models')).getByRole('button', { name: 'Try again' }),
        )
        await screen.findAllByText('claude-haiku-4-5')

        expect(screen.queryByRole('alert')).toBeNull()
    })

    it('hand focus to the page heading when the retry brings the rows, not to nothing', async () => {
        let fail = true
        mockApi({
            breakdown: (url) =>
                fail
                    ? json({ message: 'Down.' }, 500)
                    : json(breakdownFor(url)),
        })

        await open()
        const retry = await within(panel('Models')).findByRole('button', {
            name: 'Try again',
        })

        retry.focus()
        expect(retry).toHaveFocus()
        fail = false
        await userEvent.click(retry)
        await screen.findAllByText('claude-haiku-4-5')

        await waitFor(() =>
            expect(
                screen.getByRole('heading', {
                    level: 1,
                    name: 'SupportAssistant',
                }),
            ).toHaveFocus(),
        )
    })

    it('hand focus to the page heading when the try again of the refresh note brings the rows', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
        let quiet = false
        let fail = false
        mockApi({
            show: (url) =>
                json(
                    quiet
                        ? showFor(url)
                        : {
                              ...showFixtureRunning(url),
                          },
                ),
            breakdown: (url) =>
                fail
                    ? json({ message: 'Down.' }, 500)
                    : json(breakdownFor(url)),
        })

        await open()
        await screen.findAllByText('claude-haiku-4-5')
        // The runs finish, and the asking again that follows fails.
        quiet = true
        fail = true
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000)
        })

        const retry = await screen.findByRole('button', { name: 'Try again' })

        // The page's own note and the breakdown's are one: only one says the refresh failed.
        expect(screen.getAllByText(/The last refresh failed/)).toHaveLength(1)

        retry.focus()
        fail = false
        await userEvent.click(retry)
        await waitFor(() =>
            expect(screen.queryByText(/The last refresh failed/)).toBeNull(),
        )
        await waitFor(() =>
            expect(
                screen.getByRole('heading', {
                    level: 1,
                    name: 'SupportAssistant',
                }),
            ).toHaveFocus(),
        )
    })

    it('are empty, in words that claim nothing about runs that were not asked', async () => {
        mockApi({
            breakdown: (url) =>
                json(
                    breakdownFor(
                        url,
                        { models: [], tools: [], delegated: nothingDelegated },
                        {
                            models: nothingCut,
                            tools: nothingCut,
                            delegated: {
                                models: nothingCut,
                                tools: nothingCut,
                            },
                        },
                    ),
                ),
        })

        await open()

        expect(
            await within(panel('Models')).findByText(
                'No model was called in this range',
            ),
        ).toBeVisible()
        expect(
            within(panel('Tools')).getByText(
                'No tool was called in this range',
            ),
        ).toBeVisible()
    })

    it('keep the previous range’s rows dimmed, with their own range’s links, until the next arrive', async () => {
        const next = deferred()
        mockApi({
            breakdown: (url) =>
                paramsOf(url).range === '7d'
                    ? next.promise
                    : json(breakdownFor(url)),
        })
        await open()
        await screen.findAllByText('claude-haiku-4-5')

        expect(panel('Models').querySelector('[aria-busy="true"]')).toBeNull()

        await userEvent.click(screen.getByRole('combobox'))
        await userEvent.click(
            await screen.findByRole('option', { name: 'Last 7 days' }),
        )

        await waitFor(() =>
            expect(
                panel('Models').querySelector('[aria-busy="true"]'),
            ).not.toBeNull(),
        )

        const dimmed = panel('Models').querySelector('[aria-busy="true"]')

        expect(dimmed).toHaveClass('opacity-60')
        expect(filtersOf(hrefOf(ownRows('Models')[0])).range).toBeUndefined()
        expect(
            within(panel('Tools')).getByText('Loading the tools', {
                selector: '[role="status"]',
            }),
        ).toBeInTheDocument()

        next.resolve(
            await json(
                breakdownFor('?range=7d', {
                    models: [model({ model: 'seven-days' })],
                    tools: [],
                    delegated: nothingDelegated,
                }),
            ),
        )
        await screen.findByText('seven-days')

        expect(panel('Models').querySelector('[aria-busy="true"]')).toBeNull()
        expect(filtersOf(hrefOf(ownRows('Models')[0])).range).toBe('7d')
    })

    it('do not read an empty answer from the previous range as an answer for this one', async () => {
        const next = deferred()
        mockApi({
            breakdown: (url) =>
                paramsOf(url).range === '7d'
                    ? next.promise
                    : json(
                          breakdownFor(url, {
                              models: [],
                              tools: [],
                              delegated: nothingDelegated,
                          }),
                      ),
        })
        await open()
        await within(panel('Models')).findByText(
            'No model was called in this range',
        )

        await userEvent.click(screen.getByRole('combobox'))
        await userEvent.click(
            await screen.findByRole('option', { name: 'Last 7 days' }),
        )

        await waitFor(() =>
            expect(
                panel('Models').querySelector('[data-slot="panel-loading"]'),
            ).not.toBeNull(),
        )
        // The "no model" that was on screen is the previous range's: it is not said again.
        expect(
            within(panel('Models')).queryByText(
                'No model was called in this range',
            ),
        ).toBeNull()
        expect(
            panel('Models').querySelector('[data-slot="panel-loading"]'),
        ).not.toBeNull()

        await act(async () => {
            next.resolve(
                await json(
                    breakdownFor('?range=7d', {
                        models: [model({ model: 'm7' })],
                    }),
                ),
            )
        })
        await screen.findByText('m7')
    })
})

describe('another agent', () => {
    it('shows none of the previous agent’s models while its own are on the way', async () => {
        const next = deferred()
        mockApi({
            breakdown: (url) =>
                paramsOf(url).name === 'Beta'
                    ? next.promise
                    : json(breakdownFor(url)),
        })
        await open()
        await screen.findAllByText('claude-haiku-4-5')

        await act(async () => {
            window.history.pushState({}, '', '/trail/agents/agent?name=Beta')
            window.dispatchEvent(new PopStateEvent('popstate'))
            await Promise.resolve()
        })
        await screen.findByRole('heading', { level: 1, name: 'Beta' })
        await screen.findByText('Estimated cost')

        expect(screen.queryByText('claude-haiku-4-5')).toBeNull()
        expect(
            panel('Models').querySelector('[data-slot="panel-loading"]'),
        ).not.toBeNull()
    })
})

describe('the fixture', () => {
    it('is what the API sent, drawn: one model and one tool of its own, and the same inside delegated runs', async () => {
        mockApi()
        await open()
        await screen.findAllByText('claude-haiku-4-5')

        expect(ownRows('Models')).toHaveLength(
            breakdownFixture.data.models.length,
        )
        expect(ownRows('Tools')).toHaveLength(
            breakdownFixture.data.tools.length,
        )
        expect(delegatedRows('Models')).toHaveLength(
            breakdownFixture.data.delegated.models.length,
        )
        expect(delegatedRows('Tools')).toHaveLength(
            breakdownFixture.data.delegated.tools.length,
        )
    })
})
