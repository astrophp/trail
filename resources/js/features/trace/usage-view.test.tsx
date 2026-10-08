import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSubtotal, Cost, Span, Usage, UsageRow } from '@/api/types'
import { formatCost } from '@/lib/format'
import { appReady, renderApp } from '@/test/render-app'
import {
    makeAgentSpan,
    makeDetail,
    makeEmbeddingSpan,
    makeStepSpan,
    mockTraceApi,
} from '@/test/trace-api'

const id = '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30'

beforeEach(() => {
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'csrf-1',
    }
})

afterEach(() => {
    delete window.Trail
})

const reported = (input: number | null, output: number | null): Usage => ({
    state: 'reported',
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: null,
})

const row = (spanId: string, over: Partial<UsageRow> = {}): UsageRow => ({
    span_id: spanId,
    agent_span_id: 'root',
    type: 'step',
    name: 'step',
    attempt: 1,
    step_number: 0,
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    usage: reported(100, 50),
    cost: { state: 'estimated', amount: 0.01 },
    ...over,
})

const estimated = (amount: number) => ({ state: 'estimated', amount }) as const

const spans = (): Span[] => [
    makeAgentSpan('root', { sequence: 1 }),
    makeStepSpan('s1', { sequence: 2, parent_id: 'root', step_number: 0 }),
    makeStepSpan('s2', { sequence: 3, parent_id: 'root', step_number: 1 }),
]

async function openUsage(detail: ReturnType<typeof makeDetail>, search = '') {
    mockTraceApi({ [id]: detail })
    renderApp(`/traces/${id}?view=usage${search}`)
    await appReady()

    return screen.findByRole('region', { name: 'Token breakdown' })
}

const tokens = () =>
    within(screen.getByRole('region', { name: 'Token breakdown' }))
const cost = () =>
    within(screen.getByRole('region', { name: 'Estimated cost' }))
const table = () =>
    within(screen.getByRole('table', { name: 'Steps and embeddings' }))
const bodyRows = () =>
    table()
        .getAllByRole('row')
        .slice(1)
        .map((tr) => tr.textContent ?? '')

describe('the usage tab: totals', () => {
    it('shows the totals as parts, with the API numbers as given', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: {
                        usage: {
                            state: 'reported',
                            input_tokens: 1000,
                            output_tokens: 400,
                            cache_read_tokens: 300,
                            cache_write_tokens: 50,
                            reasoning_tokens: 120,
                            total_tokens: 1400,
                        },
                        cost: estimated(0.0466),
                    },
                    rows: [row('s1')],
                },
            }),
        )

        const value = (label: string) =>
            tokens().getByText(label, { selector: 'dt' }).nextElementSibling

        expect(value('Input tokens')).toHaveTextContent('1,000')
        expect(value('Cache read')).toHaveTextContent('300')
        expect(value('Cache write')).toHaveTextContent('50')
        expect(value('Output tokens')).toHaveTextContent('400')
        expect(value('Reasoning')).toHaveTextContent('120')
        expect(value('Total tokens')).toHaveTextContent('1,400')
    })

    it('shows totals that do not equal the sum of the rows exactly as the API sent them', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: {
                        usage: {
                            ...reported(7777, 3333),
                            total_tokens: 99_999,
                        },
                        cost: estimated(0.5),
                    },
                    rows: [
                        row('s1', { usage: reported(10, 5) }),
                        row('s2', {
                            usage: reported(20, 5),
                            cost: estimated(0.02),
                        }),
                    ],
                },
            }),
        )

        expect(tokens().getByText('7,777')).toBeInTheDocument()
        expect(tokens().getByText('3,333')).toBeInTheDocument()
        expect(tokens().getByText('99,999')).toBeInTheDocument()
        expect(cost().getByText(formatCost(0.5))).toBeInTheDocument()
        expect(screen.queryByText('30')).not.toBeInTheDocument()
        expect(screen.queryByText(formatCost(0.03))).not.toBeInTheDocument()
    })

    it('reads Pending throughout for a running run, even when the response carries partial amounts', async () => {
        await openUsage(
            makeDetail({
                trace: { id, status: 'running', duration_ms: null },
                spans: [
                    makeAgentSpan('root', { sequence: 1, status: 'running' }),
                ],
                usage: {
                    totals: {
                        usage: {
                            ...reported(555, 66),
                            state: 'pending',
                            total_tokens: 621,
                        },
                        cost: { state: 'pending', amount: 0.77 },
                    },
                    rows: [],
                },
            }),
        )

        expect(tokens().getAllByText('Pending')).toHaveLength(6)
        expect(tokens().queryByText('555')).not.toBeInTheDocument()
        expect(cost().getByText('Pending')).toBeInTheDocument()
        expect(screen.queryByText(formatCost(0.77))).not.toBeInTheDocument()
        expect(
            cost().getByText(
                'The run has not finished. Usage and cost are not final.',
            ),
        ).toBeInTheDocument()
    })

    it('reads Not reported for a count that is missing and keeps a real zero', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: {
                        usage: {
                            state: 'reported',
                            input_tokens: 10,
                            output_tokens: 0,
                            cache_read_tokens: null,
                            cache_write_tokens: null,
                            reasoning_tokens: null,
                            total_tokens: 10,
                        },
                        cost: estimated(0.01),
                    },
                    rows: [],
                },
            }),
        )

        const value = (label: string) =>
            tokens().getByText(label, { selector: 'dt' }).nextElementSibling

        expect(value('Output tokens')).toHaveTextContent(/^0$/)
        expect(value('Cache read')).toHaveTextContent('Not reported')
        expect(value('Reasoning')).toHaveTextContent('Not reported')
    })
})

describe('the usage tab: estimated cost', () => {
    const cases: [Cost, string, string | null][] = [
        [
            estimated(0.0466),
            'Calculated from the recorded usage and the configured model prices.',
            formatCost(0.0466),
        ],
        [
            { state: 'partial', amount: 0.02 },
            'Covers only the steps and embeddings that could be priced.',
            formatCost(0.02),
        ],
        [
            { state: 'unpriced', amount: null },
            'None of the models in this run has a configured price.',
            'Unpriced',
        ],
        [
            { state: 'pending', amount: null },
            'The run has not finished. Usage and cost are not final.',
            'Pending',
        ],
        [
            { state: 'not_captured', amount: null },
            'No usage was reported, so there was nothing to price.',
            'Not captured',
        ],
    ]

    it.each(cases)('explains %j', async (state, sentence, amount) => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: { usage: reported(1, 1), cost: state },
                    rows: [row('s1')],
                },
            }),
        )

        expect(cost().getByText(sentence)).toBeInTheDocument()
        expect(cost().getByText(amount ?? '')).toBeInTheDocument()
        expect(cost().queryByText(/No price is configured/)).toBeNull()
    })

    it('names each model without a price once, in order of first appearance', async () => {
        const unpriced = { state: 'unpriced', amount: null } as const

        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: {
                        usage: reported(1, 1),
                        cost: { state: 'partial', amount: 0.01 },
                    },
                    rows: [
                        row('s1', {
                            model: 'claude-haiku-4-5',
                            cost: unpriced,
                        }),
                        row('s2'),
                        row('s3', {
                            provider: 'openai',
                            model: 'gpt-5',
                            cost: unpriced,
                        }),
                        row('s4', {
                            model: 'claude-haiku-4-5',
                            cost: unpriced,
                        }),
                    ],
                },
            }),
        )

        expect(
            cost().getByText(
                'No price is configured for: anthropic / claude-haiku-4-5, openai / gpt-5.',
            ),
        ).toBeInTheDocument()
    })

    it('names the models of a run where none could be priced', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: {
                        usage: reported(1, 1),
                        cost: { state: 'unpriced', amount: null },
                    },
                    rows: [
                        row('s1', {
                            model: 'claude-haiku-4-5',
                            cost: { state: 'unpriced', amount: null },
                        }),
                    ],
                },
            }),
        )

        expect(
            cost().getByText(
                'No price is configured for: anthropic / claude-haiku-4-5.',
            ),
        ).toBeInTheDocument()
    })
})

describe('the usage tab: usage by span', () => {
    it('lists the rows in the API order, each with its model, counts and cost', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.03) },
                    rows: [
                        row('s2', {
                            step_number: 1,
                            usage: {
                                ...reported(11, 22),
                                cache_read_tokens: 0,
                                reasoning_tokens: 7,
                            },
                            cost: { state: 'unpriced', amount: null },
                        }),
                        row('s1', { usage: reported(null, 5) }),
                    ],
                },
            }),
        )

        const rows = bodyRows()

        expect(rows).toHaveLength(2)
        expect(rows[0]).toContain('Model step 2')
        expect(rows[0]).toContain('claude-sonnet-4-5')
        expect(rows[0]).toContain('anthropic')
        expect(rows[0]).toContain('Unpriced')
        expect(rows[1]).toContain('Model step 1')
        expect(rows[1]).toContain(formatCost(0.01))

        const cells = (index: number) =>
            within(table().getAllByRole('row')[index + 1])
                .getAllByRole('cell')
                .map((cell) => cell.textContent)

        // Input, output, cache read, cache write, reasoning.
        expect(cells(0).slice(1, 6)).toEqual([
            '11',
            '22',
            '0',
            'Not reported',
            '7',
        ])
        expect(cells(1).slice(1, 3)).toEqual(['Not reported', '5'])
    })

    it('names the attempt only when the run made more than one', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: [
                    makeAgentSpan('root', { sequence: 1 }),
                    makeStepSpan('s1', {
                        sequence: 2,
                        parent_id: 'root',
                        step_number: 0,
                        attempt: 1,
                    }),
                    makeStepSpan('s2', {
                        sequence: 3,
                        parent_id: 'root',
                        step_number: 0,
                        attempt: 2,
                    }),
                ],
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.02) },
                    rows: [row('s1'), row('s2', { attempt: 2 })],
                },
            }),
        )

        const rows = bodyRows()

        expect(rows[0]).toContain('Attempt 1 of 2')
        expect(rows[1]).toContain('Attempt 2 of 2')
    })

    it('shows no attempt for a run with one', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.02) },
                    rows: [row('s1'), row('s2')],
                },
            }),
        )

        expect(bodyRows()).toHaveLength(2)
        expect(screen.queryByText(/Attempt \d of/)).not.toBeInTheDocument()
    })

    it("opens the row's span in the execution view with one URL write", async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.02) },
                    rows: [row('s1'), row('s2', { step_number: 1 })],
                },
            }),
            '&tab=raw',
        )
        const replace = vi.spyOn(window.history, 'replaceState')
        const push = vi.spyOn(window.history, 'pushState')

        await userEvent.click(
            table().getByRole('button', { name: /^Model step 2,/ }),
        )

        expect(replace).toHaveBeenCalledTimes(1)
        expect(push).not.toHaveBeenCalled()
        replace.mockRestore()
        push.mockRestore()

        const search = new URLSearchParams(window.location.search)

        expect(search.get('span')).toBe('s2')
        expect(search.has('view')).toBe(false)
        expect(search.get('tab')).toBe('raw')
        expect(
            await screen.findByRole('tree', { name: 'Execution tree' }),
        ).toBeInTheDocument()
        expect(screen.queryByRole('table')).not.toBeInTheDocument()

        const selectedItems = screen
            .getAllByRole('treeitem')
            .filter((item) => item.getAttribute('aria-selected') === 'true')

        expect(selectedItems).toHaveLength(1)
        expect(selectedItems[0]).toHaveAccessibleName(/^Model step 2/)
    })

    it('moves focus to the opened span in the tree, since the table that held it is gone', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.02) },
                    rows: [row('s1'), row('s2', { step_number: 1 })],
                },
            }),
        )

        await userEvent.click(
            table().getByRole('button', { name: /^Model step 2,/ }),
        )

        await waitFor(() =>
            expect(document.activeElement).toHaveAccessibleName(
                /^Model step 2/,
            ),
        )
        expect(document.activeElement).toHaveAttribute('role', 'treeitem')
    })

    it("groups a delegated run by agent with each agent's own subtotal, rows under no agent last", async () => {
        const subtotal = (
            spanId: string,
            name: string,
            amount: number,
        ): AgentSubtotal => ({
            span_id: spanId,
            name,
            usage: reported(900, 90),
            cost: estimated(amount),
        })

        await openUsage(
            makeDetail({
                trace: { id },
                spans: [
                    makeAgentSpan('root', { sequence: 1, name: 'Planner' }),
                    makeStepSpan('s1', {
                        sequence: 2,
                        parent_id: 'root',
                        step_number: 0,
                    }),
                    makeAgentSpan('child', {
                        sequence: 3,
                        parent_id: 'root',
                        name: 'Researcher',
                    }),
                    makeStepSpan('s2', {
                        sequence: 4,
                        parent_id: 'child',
                        step_number: 0,
                    }),
                    makeEmbeddingSpan('e1', { sequence: 5 }),
                ],
                agents: [
                    subtotal('root', 'Planner', 0.11),
                    subtotal('child', 'Researcher', 0.22),
                ],
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.33) },
                    rows: [
                        row('e1', {
                            type: 'embedding',
                            agent_span_id: null,
                            step_number: null,
                            name: 'embeddings',
                        }),
                        row('s2', { agent_span_id: 'child' }),
                        row('s1', { agent_span_id: 'root' }),
                    ],
                },
            }),
        )

        const rows = bodyRows()

        expect(rows).toHaveLength(6)
        expect(rows[0]).toContain('Model step 1')
        expect(rows[1]).toContain('Planner')
        expect(rows[1]).toContain('own, without delegated agents')
        expect(rows[1]).toContain(formatCost(0.11))
        expect(rows[2]).toContain('Model step 1')
        expect(rows[3]).toContain('Researcher')
        expect(rows[3]).toContain(formatCost(0.22))
        expect(rows[4]).toBe('Not under an agent')
        expect(rows[5]).toContain('embeddings')
    })

    it('shows no grouping and no subtotal row for a run with one agent', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.02) },
                    rows: [row('s1'), row('s2')],
                },
            }),
        )

        expect(bodyRows()).toHaveLength(2)
        expect(screen.queryByText('own, without delegated agents')).toBeNull()
        expect(screen.queryByText('Not under an agent')).toBeNull()
    })

    it('says the table covers only the first spans when the response was cut', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                spanLimit: { limit: 2000, total: 5000, truncated: true },
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.02) },
                    rows: [row('s1')],
                },
            }),
        )

        expect(
            screen.getByText(
                'This table covers the first 2,000 spans. The totals above cover the whole run.',
            ),
        ).toBeInTheDocument()
        expect(bodyRows()).toHaveLength(1)
    })

    it('has no notice when nothing was cut', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.02) },
                    rows: [row('s1')],
                },
            }),
        )

        expect(bodyRows()).toHaveLength(1)
        expect(screen.queryByText(/This table covers/)).toBeNull()
    })

    it("shows an embedding-only run's row", async () => {
        await openUsage(
            makeDetail({
                trace: { id, type: 'embedding' },
                spans: [makeEmbeddingSpan('e1', { sequence: 1 })],
                agents: [],
                usage: {
                    totals: {
                        usage: reported(8, null),
                        cost: estimated(0.001),
                    },
                    rows: [
                        row('e1', {
                            type: 'embedding',
                            agent_span_id: null,
                            step_number: null,
                            name: 'embeddings',
                            model: 'text-embedding-3-small',
                            provider: 'openai',
                        }),
                    ],
                },
            }),
        )

        expect(bodyRows()).toHaveLength(1)
        expect(bodyRows()[0]).toContain('embeddings')
        expect(bodyRows()[0]).toContain('text-embedding-3-small')
    })

    it('says so instead of an empty table when nothing billable was recorded', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: [makeAgentSpan('root', { sequence: 1 })],
                usage: {
                    totals: {
                        usage: {
                            ...reported(null, null),
                            state: 'not_reported',
                        },
                        cost: { state: 'not_captured', amount: null },
                    },
                    rows: [],
                },
            }),
        )

        expect(
            screen.getByText(
                'No model steps or embeddings were recorded for this run.',
            ),
        ).toBeInTheDocument()
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
        expect(
            cost().getByText(
                'No usage was reported, so there was nothing to price.',
            ),
        ).toBeInTheDocument()
    })
})

describe('the usage tab: reading the table', () => {
    it('gives each row a header and every column one, and the table a name of its own', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.02) },
                    rows: [row('s1'), row('s2', { step_number: 1 })],
                },
            }),
        )

        expect(
            table()
                .getAllByRole('columnheader')
                .map((th) => th.textContent),
        ).toEqual([
            'Span',
            'Model',
            'Input',
            'Output',
            'Cache read',
            'Cache write',
            'Reasoning',
            'Cost',
        ])
        expect(table().getAllByRole('rowheader')).toHaveLength(2)
        expect(
            screen.queryByRole('region', { name: 'Steps and embeddings' }),
        ).not.toBeInTheDocument()
        expect(
            screen.getByRole('region', { name: 'Usage by span' }),
        ).toBeInTheDocument()
    })

    it('tells the rows of a delegated run apart by agent', async () => {
        const subtotal = (spanId: string, name: string): AgentSubtotal => ({
            span_id: spanId,
            name,
            usage: reported(1, 1),
            cost: estimated(0.01),
        })

        await openUsage(
            makeDetail({
                trace: { id },
                spans: [
                    makeAgentSpan('root', { sequence: 1, name: 'Planner' }),
                    makeStepSpan('s1', {
                        sequence: 2,
                        parent_id: 'root',
                        step_number: 0,
                    }),
                    makeAgentSpan('child', {
                        sequence: 3,
                        parent_id: 'root',
                        name: 'PolicyResearcher',
                    }),
                    makeStepSpan('s2', {
                        sequence: 4,
                        parent_id: 'child',
                        step_number: 0,
                    }),
                ],
                agents: [
                    subtotal('root', 'Planner'),
                    subtotal('child', 'PolicyResearcher'),
                ],
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.02) },
                    rows: [
                        row('s1', { agent_span_id: 'root' }),
                        row('s2', { agent_span_id: 'child' }),
                    ],
                },
            }),
        )

        expect(
            table().getByRole('button', {
                name: 'Model step 1, Planner. Open in the execution tree',
            }),
        ).toBeInTheDocument()
        expect(
            table().getByRole('button', {
                name: 'Model step 1, PolicyResearcher. Open in the execution tree',
            }),
        ).toBeInTheDocument()
    })

    it('adds the attempt to the name when the run failed over', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: [
                    makeAgentSpan('root', { sequence: 1 }),
                    makeStepSpan('s1', {
                        sequence: 2,
                        parent_id: 'root',
                        step_number: 0,
                    }),
                    makeStepSpan('s2', {
                        sequence: 3,
                        parent_id: 'root',
                        step_number: 0,
                        attempt: 2,
                    }),
                ],
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.02) },
                    rows: [row('s1'), row('s2', { attempt: 2 })],
                },
            }),
        )

        expect(
            table().getByRole('button', {
                name: 'Model step 1, SupportAssistant, attempt 1. Open in the execution tree',
            }),
        ).toBeInTheDocument()
        expect(
            table().getByRole('button', {
                name: 'Model step 1, SupportAssistant, attempt 2. Open in the execution tree',
            }),
        ).toBeInTheDocument()
    })

    it('shows the attempt without a total when the spans were cut, since the total is unknown', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: [
                    makeAgentSpan('root', { sequence: 1 }),
                    makeStepSpan('s2', {
                        sequence: 3,
                        parent_id: 'root',
                        step_number: 0,
                        attempt: 2,
                    }),
                ],
                spanLimit: { limit: 2000, total: 5000, truncated: true },
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.02) },
                    rows: [row('s2', { attempt: 2 })],
                },
            }),
        )

        expect(bodyRows()[0]).toContain('Attempt 2')
        expect(bodyRows()[0]).not.toContain(' of ')
    })

    it('keeps rows and agents that the API repeats', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: { usage: reported(1, 1), cost: estimated(0.02) },
                    rows: [row('s1'), row('s1')],
                },
            }),
        )

        expect(bodyRows()).toHaveLength(2)
    })
})

describe('the usage tab: cost across a cut and unnamed models', () => {
    const unpriced = { state: 'unpriced', amount: null } as const
    const partial = { state: 'partial', amount: 0.01 } as const

    it('says the unpriced steps are beyond the returned spans when none of the rows is unpriced', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                spanLimit: { limit: 2000, total: 5000, truncated: true },
                usage: {
                    totals: { usage: reported(1, 1), cost: partial },
                    rows: [row('s1')],
                },
            }),
        )

        expect(
            cost().getByText(
                'The unpriced steps are beyond the first 2,000 spans.',
            ),
        ).toBeInTheDocument()
    })

    it('says what the list of models covers when the spans were cut', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                spanLimit: { limit: 2000, total: 5000, truncated: true },
                usage: {
                    totals: { usage: reported(1, 1), cost: partial },
                    rows: [
                        row('s1', {
                            model: 'claude-haiku-4-5',
                            cost: unpriced,
                        }),
                    ],
                },
            }),
        )

        expect(
            cost().getByText(
                'Among the first 2,000 spans, no price is configured for: anthropic / claude-haiku-4-5.',
            ),
        ).toBeInTheDocument()
    })

    it('counts unpriced steps whose model was not captured', async () => {
        await openUsage(
            makeDetail({
                trace: { id },
                spans: spans(),
                usage: {
                    totals: { usage: reported(1, 1), cost: partial },
                    rows: [
                        row('s1', {
                            model: 'claude-haiku-4-5',
                            cost: unpriced,
                        }),
                        row('s2', {
                            provider: null,
                            model: null,
                            cost: unpriced,
                        }),
                        row('s3', {
                            provider: null,
                            model: null,
                            cost: unpriced,
                        }),
                    ],
                },
            }),
        )

        expect(
            cost().getByText(
                'No price is configured for: anthropic / claude-haiku-4-5 and 2 steps whose model was not captured.',
            ),
        ).toBeInTheDocument()
        expect(screen.queryByText(/Not captured \/ Not captured/)).toBeNull()
    })
})

describe('the usage tab: a run still running', () => {
    it('reads Pending for the run, the running step and the agent subtotals, and shows the finished step as it is', async () => {
        const pending = (input: number): Usage => ({
            ...reported(input, null),
            state: 'pending',
        })
        const subtotal = (spanId: string, name: string): AgentSubtotal => ({
            span_id: spanId,
            name,
            usage: pending(77),
            cost: { state: 'pending', amount: 0.9 },
        })

        await openUsage(
            makeDetail({
                trace: { id, status: 'running', duration_ms: null },
                spans: [
                    makeAgentSpan('root', {
                        sequence: 1,
                        status: 'running',
                        name: 'Planner',
                    }),
                    makeStepSpan('s1', {
                        sequence: 2,
                        parent_id: 'root',
                        step_number: 0,
                    }),
                    makeAgentSpan('child', {
                        sequence: 3,
                        parent_id: 'root',
                        status: 'running',
                        name: 'Researcher',
                    }),
                    makeStepSpan('s2', {
                        sequence: 4,
                        parent_id: 'child',
                        step_number: 0,
                        status: 'running',
                    }),
                ],
                agents: [
                    subtotal('root', 'Planner'),
                    subtotal('child', 'Researcher'),
                ],
                usage: {
                    totals: {
                        usage: pending(321),
                        cost: { state: 'pending', amount: 0.9 },
                    },
                    rows: [
                        row('s1', {
                            agent_span_id: 'root',
                            usage: reported(100, 50),
                            cost: estimated(0.01),
                        }),
                        row('s2', {
                            agent_span_id: 'child',
                            usage: pending(13),
                            cost: { state: 'pending', amount: 0.3 },
                        }),
                    ],
                },
            }),
        )

        expect(tokens().getAllByText('Pending')).toHaveLength(6)
        expect(tokens().queryByText('321')).toBeNull()
        expect(cost().getByText('Pending')).toBeInTheDocument()

        const rows = bodyRows()

        expect(rows).toHaveLength(4)
        // The finished step keeps its real counts and cost.
        expect(rows[0]).toContain('100')
        expect(rows[0]).toContain('50')
        expect(rows[0]).toContain(formatCost(0.01))
        // Its agent, the running step and its agent read Pending, never the amounts so far.
        expect(rows[1]).toContain('Planner')
        expect(rows[1].match(/Pending/g)).toHaveLength(6)
        expect(rows[2].match(/Pending/g)).toHaveLength(6)
        expect(rows[3]).toContain('Researcher')
        expect(rows[3].match(/Pending/g)).toHaveLength(6)
        for (const text of rows.slice(1)) {
            expect(text).not.toContain('77')
            expect(text).not.toContain('13')
            expect(text).not.toContain(formatCost(0.9))
        }
    })
})
