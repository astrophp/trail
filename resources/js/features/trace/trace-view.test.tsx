import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Span, Trace } from '@/api/types'
import { notify } from '@/components/patterns/notify'
import { formatDateTime } from '@/lib/format'
import { appReady, renderApp } from '@/test/render-app'
import {
    detailFixture,
    detailUrls,
    makeAgentSpan,
    makeDetail,
    makeEmbeddingSpan,
    makeStepSpan,
    makeToolSpan,
    mockTraceApi,
} from '@/test/trace-api'
import { deferred, json } from '@/test/traces-api'

const id = '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30'
const shortName = 'SupportAssistant · 0199c2f4…2f30'

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

/** A completed run: an agent, two steps and a tool. */
function completedSpans(): Span[] {
    return [
        makeAgentSpan('root', { sequence: 1 }),
        makeStepSpan('s1', { sequence: 2, parent_id: 'root', step_number: 0 }),
        makeToolSpan('t1', { sequence: 3, parent_id: 'root', name: 'search' }),
        makeStepSpan('s2', { sequence: 4, parent_id: 'root', step_number: 1 }),
    ]
}

/** A failed run: the tool failed, then the step after it, and the agent that ran them. */
function failedSpans(): Span[] {
    return [
        makeAgentSpan('root', {
            sequence: 1,
            status: 'failed',
            issue_kind: 'tool_error',
            error: {
                class: 'RuntimeException',
                message: 'Disk full',
                source: 'run',
                http_status: null,
            },
        }),
        makeStepSpan('s1', { sequence: 2, parent_id: 'root', step_number: 0 }),
        makeToolSpan('t1', {
            sequence: 3,
            parent_id: 'root',
            name: 'lookup',
            status: 'failed',
            issue_kind: 'tool_error',
            error: {
                class: 'RuntimeException',
                message: 'Lookup table is full',
                source: 'tool',
                http_status: null,
            },
        }),
        makeStepSpan('s2', {
            sequence: 4,
            parent_id: 'root',
            step_number: 1,
            status: 'failed',
        }),
    ]
}

function completedDetail(trace: Partial<Trace> = {}) {
    return makeDetail({
        trace: {
            id,
            status: 'completed',
            issue_kind: null,
            bookmarked: false,
            ...trace,
        },
        spans: completedSpans(),
    })
}

function failedDetail(trace: Partial<Trace> = {}) {
    return makeDetail({
        trace: { id, status: 'failed', ...trace },
        spans: failedSpans(),
        error: {
            class: 'RuntimeException',
            message: 'Disk full',
            source: 'run',
            http_status: null,
        },
    })
}

/** Opens the run's page and waits for the tree: only then is there anything to assert about. */
async function openRun(
    runId = id,
    search = '',
    overrides: Record<string, unknown> = {},
) {
    renderApp(`/traces/${runId}${search}`, overrides)
    await appReady()
    await screen.findByRole('tree', { name: 'Execution tree' })
}

const header = () =>
    within(document.querySelector('[data-slot="trace-header"]') as HTMLElement)
const evidence = () =>
    within(
        document.querySelector('[data-slot="evidence-panel"]') as HTMLElement,
    )
const spanHeader = () =>
    within(document.querySelector('[data-slot="span-header"]') as HTMLElement)
const selected = () =>
    screen
        .getAllByRole('treeitem')
        .filter((item) => item.getAttribute('aria-selected') === 'true')
        .map((item) => item.getAttribute('aria-label'))

/** Moves the app to another address the way Back does. */
function goTo(path: string) {
    act(() => {
        window.history.pushState({}, '', `/trail${path}`)
        window.dispatchEvent(new PopStateEvent('popstate'))
    })
}

describe('the trace page header', () => {
    it('shows every field of the run', async () => {
        mockTraceApi({
            [id]: makeDetail({
                trace: {
                    id,
                    name: 'SupportAssistant',
                    type: 'agent',
                    status: 'failed',
                    issue_kind: 'rate_limited',
                    recovered: true,
                    child_failed: true,
                    streamed: true,
                    provider: 'anthropic',
                    model: 'claude-sonnet-4-5',
                    duration_ms: 3000.5,
                    usage: {
                        ...detailFixture.data.trace.usage,
                        total_tokens: 2174,
                    },
                    cost: { state: 'partial', amount: 0.008752 },
                    conversation_id: 'conversation-1',
                    user: {
                        id: '7',
                        type: 'App\\User',
                        name: 'Ada',
                        email: null,
                    },
                    started_at: '2026-01-02T11:00:00.000Z',
                    bookmarked: true,
                },
                spans: failedSpans(),
            }),
        })
        await openRun()

        expect(
            screen.getByRole('heading', { level: 1, name: 'SupportAssistant' }),
        ).toBeInTheDocument()
        expect(
            header().getByRole('img', { name: 'Agent run' }),
        ).toBeInTheDocument()
        expect(header().getByText(id)).toBeInTheDocument()
        expect(
            header().getByRole('button', { name: 'Copy run id' }),
        ).toBeInTheDocument()
        expect(header().getByText('Failed')).toBeInTheDocument()
        expect(header().getByText('Recovered')).toBeInTheDocument()
        expect(header().getByText('Child failed')).toBeInTheDocument()
        expect(header().getByText('Rate limited')).toBeInTheDocument()
        expect(header().getByText('claude-sonnet-4-5')).toBeInTheDocument()
        expect(header().getByText(/^anthropic · streamed$/)).toBeInTheDocument()
        expect(header().getByText('3.00s')).toBeInTheDocument()
        expect(header().getByText('2.2k')).toBeInTheDocument()
        expect(header().getByText('$0.0088')).toBeInTheDocument()
        expect(header().getByText('Partial')).toBeInTheDocument()
        expect(
            header().getByText(
                formatDateTime(new Date('2026-01-02T11:00:00.000Z'), 'UTC'),
            ),
        ).toBeInTheDocument()
        expect(header().getByText('Ada')).toBeInTheDocument()
        expect(header().getByText('conversation-1')).toBeInTheDocument()
        expect(
            within(
                header().getByText('Spans').closest('div') as HTMLElement,
            ).getByText('4'),
        ).toBeInTheDocument()
        expect(
            header().getByRole('button', {
                name: 'Bookmark SupportAssistant 0199c2f4…2f30',
            }),
        ).toHaveAttribute('aria-pressed', 'true')
    })

    it('shows the status as a soft pill right after the title, tinted in its colour', async () => {
        mockTraceApi({
            [id]: completedDetail({
                status: 'running',
                duration_ms: null,
                ended_at: null,
            }),
        })
        await openRun()

        const title = screen.getByRole('heading', { level: 1 })
        const pill = header()
            .getByText('Running')
            .closest('span') as HTMLElement

        expect(title.nextElementSibling).toBe(pill)
        expect(pill).toHaveClass('rounded-full', 'bg-info-soft', 'text-info')
    })

    it('shows the whole id, and when the run started on one line under the title', async () => {
        mockTraceApi({
            [id]: completedDetail({ started_at: '2026-01-02T11:00:05.000Z' }),
        })
        await openRun()

        expect(header().getByText(id)).not.toHaveClass('sr-only')
        expect(header().getByText('Jan 2 · 11:00:05')).toBeInTheDocument()
    })

    it('labels the figures of the strip, with the model among them', async () => {
        mockTraceApi({ [id]: completedDetail() })
        await openRun()

        for (const label of [
            'Elapsed',
            'Total tokens',
            'Estimated cost',
            'Spans',
            'Model',
        ]) {
            expect(header().getByText(label)).toBeInTheDocument()
        }
    })

    it('shows the id of a user without a name, and leaves out what the run does not have', async () => {
        mockTraceApi({
            [id]: completedDetail({
                user: { id: '42', type: 'App\\User', name: null, email: null },
                conversation_id: null,
                recovered: false,
                child_failed: false,
                streamed: false,
            }),
        })
        await openRun()

        expect(header().getByText('42')).toBeInTheDocument()
        expect(header().queryByText('Conversation')).not.toBeInTheDocument()
        expect(header().queryByText('Recovered')).not.toBeInTheDocument()
        expect(header().queryByText(/streamed/)).not.toBeInTheDocument()
        expect(
            header().queryByRole('group', { name: 'Error' }),
        ).not.toBeInTheDocument()
    })

    it('leaves out the user when the run has none', async () => {
        mockTraceApi({ [id]: completedDetail({ user: null }) })
        await openRun()

        expect(header().queryByText('User')).not.toBeInTheDocument()
    })

    it('reads Pending for tokens and cost while the run is running, though the response carries partial amounts', async () => {
        mockTraceApi({
            [id]: completedDetail({
                status: 'running',
                duration_ms: null,
                ended_at: null,
                usage: {
                    ...detailFixture.data.trace.usage,
                    state: 'pending',
                    total_tokens: 4321,
                },
                cost: { state: 'pending', amount: 0.0123 },
            }),
        })
        await openRun()

        expect(header().getAllByText('Pending')).toHaveLength(2)
        expect(header().getByText('In progress')).toBeInTheDocument()
        expect(header().queryByText(/4\.3k|4,321/)).not.toBeInTheDocument()
        expect(header().queryByText(/\$0\.01/)).not.toBeInTheDocument()
    })

    it('shows the error of a failed run in the header before anything is selected', async () => {
        mockTraceApi({ [id]: failedDetail({ issue_kind: 'tool_error' }) })
        await openRun()

        const error = header().getByRole('group', { name: 'Error' })

        expect(within(error).getByText('Tool error')).toBeInTheDocument()
        expect(within(error).getByText('RuntimeException')).toBeInTheDocument()
        expect(within(error).getByText('Raised by the run')).toBeInTheDocument()
        expect(within(error).getByText('Disk full')).toBeInTheDocument()
    })

    it('shows the error of a failed run whichever span the URL selects', async () => {
        mockTraceApi({ [id]: failedDetail({ issue_kind: 'tool_error' }) })
        await openRun(id, '?span=s1')

        expect(selected()).toEqual(['Model step 1, Completed'])
        expect(
            header().getByRole('group', { name: 'Error' }),
        ).toHaveTextContent('Disk full')
    })

    it('copies the whole id and says so', async () => {
        const success = vi.spyOn(notify, 'success')
        const writeText = vi.fn(() => Promise.resolve())
        mockTraceApi({ [id]: completedDetail() })
        await openRun()
        // user-event installs a clipboard of its own, so the button is pressed after it did.
        const user = userEvent.setup()
        vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText)

        await user.click(header().getByRole('button', { name: 'Copy run id' }))

        await waitFor(() => expect(writeText).toHaveBeenCalledWith(id))
        expect(success).toHaveBeenCalledWith('Run id copied.')
        success.mockRestore()
    })

    it('says so when the id could not be copied', async () => {
        const error = vi.spyOn(notify, 'error')
        mockTraceApi({ [id]: completedDetail() })
        await openRun()
        const user = userEvent.setup()
        vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
            new Error('denied'),
        )

        await user.click(header().getByRole('button', { name: 'Copy run id' }))

        await waitFor(() =>
            expect(error).toHaveBeenCalledWith(
                'The run id could not be copied.',
            ),
        )
        error.mockRestore()
    })
})

describe('the execution pane', () => {
    it('says how many spans the run has, from the server', async () => {
        mockTraceApi({
            [id]: makeDetail({
                trace: { id, span_count: 6 },
                spans: completedSpans(),
            }),
        })
        await openRun()

        expect(
            screen.getByRole('heading', { name: 'Execution' }),
        ).toBeInTheDocument()
        expect(screen.getByText('6 spans')).toBeInTheDocument()
    })

    it('says span in the singular for a run with one', async () => {
        mockTraceApi({
            [id]: makeDetail({
                trace: { id, span_count: 1 },
                spans: [makeAgentSpan('root', { sequence: 1 })],
            }),
        })
        await openRun()

        expect(screen.getByText('1 span')).toBeInTheDocument()
        expect(screen.queryByText('1 spans')).not.toBeInTheDocument()
    })

    it('puts the tree and the evidence in one bordered card, and notes what durations include', async () => {
        mockTraceApi({ [id]: completedDetail() })
        await openRun()

        const card = document.querySelector('[data-slot="split-view"]')!

        expect(card).toHaveClass('border', 'rounded-lg')
        expect(
            within(card as HTMLElement).getByRole('tree', {
                name: 'Execution tree',
            }),
        ).toBeInTheDocument()
        expect(
            within(card as HTMLElement).getByRole('tablist', {
                name: 'Evidence',
            }),
        ).toBeInTheDocument()
        expect(
            screen.getByText('Parent durations include their children.'),
        ).toBeInTheDocument()
        // The tree itself is not a second box inside the card.
        expect(screen.getByRole('tree')).not.toHaveClass('border')
    })
})

describe('the selected span', () => {
    it('is where the failure started on a failed run, though the root failed too, with its error', async () => {
        mockTraceApi({ [id]: failedDetail() })
        await openRun()

        // The root agent, the tool and a later step all failed: the tool is where it started.
        expect(
            screen.getByRole('treeitem', { name: 'SupportAssistant, Failed' }),
        ).toBeInTheDocument()
        expect(selected()).toEqual(['lookup, Failed'])
        expect(
            spanHeader().getByRole('heading', { name: 'lookup' }),
        ).toBeInTheDocument()
        expect(
            evidence().getByRole('group', { name: 'Error' }),
        ).toHaveTextContent('Lookup table is full')
    })

    it('is the root on a run that completed', async () => {
        mockTraceApi({ [id]: completedDetail() })
        await openRun()

        expect(selected()).toEqual(['SupportAssistant, Completed'])
        expect(
            spanHeader().getByRole('heading', { name: 'SupportAssistant' }),
        ).toBeInTheDocument()
        expect(
            evidence().queryByRole('group', { name: 'Error' }),
        ).not.toBeInTheDocument()
    })

    it("is the URL's span, which a click writes to the URL without adding a history entry", async () => {
        mockTraceApi({ [id]: completedDetail() })
        await openRun(id, '?span=s2')

        expect(selected()).toEqual(['Model step 2, Completed'])
        expect(
            spanHeader().getByRole('heading', { name: 'Model step 2' }),
        ).toBeInTheDocument()

        const entries = window.history.length

        await userEvent.click(
            screen.getByRole('treeitem', { name: 'search, Completed' }),
        )

        expect(window.location.search).toBe('?span=t1')
        expect(window.history.length).toBe(entries)
        expect(selected()).toEqual(['search, Completed'])
        expect(
            spanHeader().getByRole('heading', { name: 'search' }),
        ).toBeInTheDocument()
    })

    it('keeps the other parameters of the URL when it writes the span', async () => {
        mockTraceApi({ [id]: completedDetail() })
        await openRun(id, '?range=7d')

        await userEvent.click(
            screen.getByRole('treeitem', { name: 'search, Completed' }),
        )

        expect(new URLSearchParams(window.location.search).get('range')).toBe(
            '7d',
        )
        expect(new URLSearchParams(window.location.search).get('span')).toBe(
            't1',
        )
    })

    it('does not write the default selection to the URL', async () => {
        mockTraceApi({ [id]: failedDetail() })
        await openRun()

        expect(window.location.search).toBe('')
    })

    it('falls back to the default for a span the run does not have, without an error', async () => {
        mockTraceApi({ [id]: failedDetail() })
        await openRun(id, '?span=nope')

        expect(selected()).toEqual(['lookup, Failed'])
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows the facts of a model step: status, attempt, model, duration, tokens and cost', async () => {
        const spans = [
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
                provider: 'openai',
                model: 'gpt-x',
            }),
        ]
        mockTraceApi({ [id]: makeDetail({ trace: { id }, spans }) })
        await openRun(id, '?span=s2')

        expect(
            spanHeader().getByRole('heading', { name: 'Model step 1' }),
        ).toBeInTheDocument()
        expect(spanHeader().getByText('Completed')).toBeInTheDocument()
        expect(spanHeader().getByText('Attempt 2 of 2')).toBeInTheDocument()
        expect(spanHeader().getByText('gpt-x')).toBeInTheDocument()
        expect(spanHeader().getByText('840 ms')).toBeInTheDocument()
        expect(spanHeader().getByText('1.5k')).toBeInTheDocument()
    })

    it('shows no attempt for a run that made one, and no tokens for a tool', async () => {
        mockTraceApi({ [id]: completedDetail() })
        await openRun(id, '?span=t1')

        // The tool's head says what it is, and has no model line, no attempt and no tokens.
        expect(
            spanHeader().getByRole('heading', { name: 'search' }),
        ).toBeInTheDocument()
        expect(spanHeader().getByText('Tool call')).toBeInTheDocument()
        expect(spanHeader().queryByText(/ · /)).not.toBeInTheDocument()
        expect(spanHeader().queryByText(/^Attempt/)).not.toBeInTheDocument()
        expect(spanHeader().queryByText(/tokens/)).not.toBeInTheDocument()
    })
})

describe('other shapes of run', () => {
    const row = (name: string) => screen.getByRole('treeitem', { name })

    /** Triage, a tool, the agent it delegated to, and that agent's step. */
    function delegatedSpans(): Span[] {
        return [
            makeAgentSpan('a1', { sequence: 1, name: 'Triage' }),
            makeToolSpan('t1', { sequence: 2, parent_id: 'a1', name: 'ask' }),
            makeAgentSpan('a2', {
                sequence: 3,
                parent_id: 't1',
                name: 'Research',
            }),
            makeStepSpan('s1', {
                sequence: 4,
                parent_id: 'a2',
                step_number: 0,
            }),
        ]
    }

    it("selects the URL's nested span after mount, shows its facts and opens its ancestors", async () => {
        mockTraceApi({
            [id]: makeDetail({
                trace: { id, name: 'Triage' },
                spans: delegatedSpans(),
            }),
        })
        await openRun()
        expect(selected()).toEqual(['Triage, Completed'])

        await userEvent.click(
            row('Triage, Completed').querySelector(
                '[data-slot="span-row-toggle"]',
            ) as Element,
        )
        expect(screen.getAllByRole('treeitem')).toHaveLength(1)

        goTo(`/traces/${id}?span=s1`)

        await waitFor(() =>
            expect(selected()).toEqual(['Model step 1, Completed']),
        )
        expect(
            spanHeader().getByRole('heading', { name: 'Model step 1' }),
        ).toBeInTheDocument()
        expect(screen.getAllByRole('treeitem')).toHaveLength(4)

        for (const ancestor of [
            'Triage, Completed',
            'ask, Completed',
            'Research, Completed',
        ]) {
            expect(row(ancestor)).toHaveAttribute('aria-expanded', 'true')
        }
    })

    it('shows an embedding-only run as one row, with its model', async () => {
        mockTraceApi({
            [id]: makeDetail({
                trace: { id, name: 'embed-docs', type: 'embedding' },
                spans: [makeEmbeddingSpan('e', { sequence: 1 })],
            }),
        })
        await openRun()

        expect(screen.getAllByRole('treeitem')).toHaveLength(1)
        expect(selected()).toEqual(['embeddings, Completed'])
        expect(
            header().getByRole('img', { name: 'Embedding run' }),
        ).toBeInTheDocument()
        expect(
            spanHeader().getByRole('heading', { name: 'embeddings' }),
        ).toBeInTheDocument()
        expect(screen.queryByText(/^Attempt \d+ of/)).not.toBeInTheDocument()
    })

    it('groups the steps of a failover run under attempt rows and restarts the step numbers in each', async () => {
        mockTraceApi({
            [id]: makeDetail({
                trace: { id },
                spans: [
                    makeAgentSpan('root', { sequence: 1 }),
                    makeStepSpan('a1s0', {
                        sequence: 2,
                        parent_id: 'root',
                        attempt: 1,
                        step_number: 0,
                        status: 'failed',
                    }),
                    makeStepSpan('a2s0', {
                        sequence: 3,
                        parent_id: 'root',
                        attempt: 2,
                        step_number: 0,
                    }),
                    makeStepSpan('a2s1', {
                        sequence: 4,
                        parent_id: 'root',
                        attempt: 2,
                        step_number: 1,
                    }),
                ],
            }),
        })
        await openRun()

        expect(
            screen
                .getAllByRole('treeitem')
                .map((item) => item.getAttribute('aria-label')),
        ).toEqual([
            'SupportAssistant, Completed',
            'Attempt 1 of 2',
            'Model step 1, Failed',
            'Attempt 2 of 2',
            'Model step 1, Completed',
            'Model step 2, Completed',
        ])
        expect(
            within(screen.getByRole('tree')).queryByText(/^Attempt \d of 2$/),
        ).not.toBeInTheDocument()
    })

    it("labels an agent's tokens and cost as its own, and a step's as plain", async () => {
        mockTraceApi({
            [id]: makeDetail({ trace: { id }, spans: completedSpans() }),
        })
        await openRun()

        expect(spanHeader().getByText('own tokens')).toBeInTheDocument()
        expect(spanHeader().getByText('own cost')).toBeInTheDocument()

        await userEvent.click(row('Model step 1, Completed'))

        expect(spanHeader().getByText('tokens')).toBeInTheDocument()
        expect(spanHeader().getByText('cost')).toBeInTheDocument()
        expect(spanHeader().queryByText('own tokens')).not.toBeInTheDocument()
    })
})

describe('moving between runs', () => {
    it("never shows the previous run's spans under the next run", async () => {
        const next = deferred()
        const nextId = 'run-b'
        mockTraceApi({
            [id]: completedDetail(),
            [nextId]: () => next.promise,
        })
        await openRun()
        expect(screen.getAllByRole('treeitem')).toHaveLength(4)

        goTo(`/traces/${nextId}`)

        expect(
            await screen.findByRole('status', { name: 'Loading run' }),
        ).toBeVisible()
        expect(screen.queryByRole('tree')).not.toBeInTheDocument()
        expect(screen.queryByRole('treeitem')).not.toBeInTheDocument()
        expect(
            screen.queryByRole('heading', {
                level: 1,
                name: 'SupportAssistant',
            }),
        ).not.toBeInTheDocument()

        next.resolve(
            new Response(
                JSON.stringify(
                    makeDetail({
                        trace: { id: nextId, name: 'OtherAgent' },
                        spans: [
                            makeAgentSpan('b-root', {
                                sequence: 1,
                                name: 'OtherAgent',
                            }),
                        ],
                    }),
                ),
            ),
        )

        expect(
            await screen.findByRole('treeitem', {
                name: 'OtherAgent, Completed',
            }),
        ).toBeVisible()
        expect(screen.getAllByRole('treeitem')).toHaveLength(1)
        expect(
            screen.queryByRole('status', { name: 'Loading run' }),
        ).not.toBeInTheDocument()
    })
})

describe('loading, failing and not finding a run', () => {
    it('shows a skeleton shaped like the page while the run loads', async () => {
        const pending = deferred()
        mockTraceApi({ [id]: () => pending.promise })
        renderApp(`/traces/${id}`)
        await appReady()

        expect(
            await screen.findByRole('status', { name: 'Loading run' }),
        ).toBeVisible()
        expect(screen.queryByRole('tree')).not.toBeInTheDocument()

        pending.resolve(new Response(JSON.stringify(completedDetail())))

        await screen.findByRole('tree')
        expect(
            screen.queryByRole('status', { name: 'Loading run' }),
        ).not.toBeInTheDocument()
    })

    it('says the run could not be loaded, and loads it on a retry', async () => {
        let calls = 0
        mockTraceApi({
            [id]: () =>
                (calls += 1) === 1
                    ? json({ message: 'Server error.' }, 500)
                    : json(completedDetail()),
        })
        renderApp(`/traces/${id}`)
        await appReady()

        const alert = await screen.findByRole('alert')

        expect(
            within(alert).getByText('The run could not be loaded'),
        ).toBeInTheDocument()
        expect(within(alert).getByText('Server error.')).toBeInTheDocument()
        expect(screen.queryByRole('tree')).not.toBeInTheDocument()

        await userEvent.click(
            within(alert).getByRole('button', { name: 'Try again' }),
        )

        expect(await screen.findByRole('tree')).toBeVisible()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(calls).toBe(2)
    })

    it('says a run is not found, with a way back to the list', async () => {
        mockTraceApi({})
        renderApp(
            `/traces/ghost?from=${encodeURIComponent('/traces?range=7d&status=failed')}`,
        )
        await appReady()

        expect(
            await screen.findByRole('heading', { name: 'Run not found' }),
        ).toBeVisible()
        expect(screen.queryByRole('tree')).not.toBeInTheDocument()
        expect(
            screen.queryByText('The run could not be loaded'),
        ).not.toBeInTheDocument()
        expect(
            screen.getByRole('link', { name: 'Back to traces' }),
        ).toHaveAttribute('href', '/trail/traces?range=7d&status=failed')
    })
})

describe('the breadcrumb and the browser tab', () => {
    const crumbs = () =>
        within(screen.getByRole('navigation', { name: 'breadcrumb' }))

    it('say Trace until the run has loaded, then the run name and short id', async () => {
        const pending = deferred()
        mockTraceApi({ [id]: () => pending.promise })
        renderApp(`/traces/${id}`)
        await appReady()
        await screen.findByRole('status', { name: 'Loading run' })

        expect(crumbs().getByText('Trace')).toBeInTheDocument()
        expect(document.title).toBe('Trace · Trail')

        pending.resolve(new Response(JSON.stringify(completedDetail())))
        await screen.findByRole('tree')

        await waitFor(() => expect(document.title).toBe(`${shortName} · Trail`))
        expect(crumbs().getByText(shortName)).toBeInTheDocument()
        expect(crumbs().queryByText('Trace')).not.toBeInTheDocument()
        expect(
            crumbs().getByRole('link', { name: 'Traces' }),
        ).toBeInTheDocument()
    })

    it('say Trace for a run that is not found', async () => {
        mockTraceApi({})
        renderApp('/traces/ghost')
        await appReady()
        await screen.findByRole('heading', { name: 'Run not found' })

        expect(crumbs().getByText('Trace')).toBeInTheDocument()
        expect(document.title).toBe('Trace · Trail')
    })

    it("do not carry the run's name to the page the person goes to", async () => {
        mockTraceApi({ [id]: completedDetail() })
        await openRun()
        await waitFor(() => expect(document.title).toBe(`${shortName} · Trail`))

        goTo('/usage')

        await waitFor(() => expect(document.title).toBe('Usage & cost · Trail'))
        expect(crumbs().queryByText(shortName)).not.toBeInTheDocument()
    })

    it('go back to Trace while the next run loads', async () => {
        const next = deferred()
        mockTraceApi({ [id]: completedDetail(), other: () => next.promise })
        await openRun()
        await waitFor(() => expect(document.title).toBe(`${shortName} · Trail`))

        goTo('/traces/other')

        await screen.findByRole('status', { name: 'Loading run' })
        await waitFor(() => expect(document.title).toBe('Trace · Trail'))
        next.resolve(new Response('{}', { status: 404 }))
        await screen.findByRole('heading', { name: 'Run not found' })
    })
})

describe('the bookmark', () => {
    const name = 'Bookmark SupportAssistant 0199c2f4…2f30'
    const toggle = () => header().getByRole('button', { name })

    /**
     * A server that keeps the run's bookmark and answers the detail from it. A write is held
     * until `hold` is released, or refused with a 500 (and then not kept).
     */
    function serve({
        hold,
        refuse = false,
    }: { hold?: Promise<Response>; refuse?: boolean } = {}) {
        let bookmarked = false
        const fetchMock = mockTraceApi(
            { [id]: () => json(completedDetail({ bookmarked })) },
            (_url, init) => {
                if (refuse) {
                    return json({ message: 'No.' }, 500)
                }

                bookmarked = init?.method === 'PUT'

                return hold ?? json({ data: { trace_id: id, bookmarked } })
            },
        )

        return { fetchMock, saved: () => bookmarked }
    }

    it('shows a press at once, keeps it once saved, and fetches the run again', async () => {
        const hold = deferred()
        const { fetchMock } = serve({ hold: hold.promise })
        await openRun()
        expect(toggle()).toHaveAttribute('aria-pressed', 'false')
        const fetched = detailUrls(fetchMock).length

        await userEvent.click(toggle())

        expect(toggle()).toHaveAttribute('aria-pressed', 'true')
        expect(
            fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT'),
        ).toHaveLength(1)
        expect(detailUrls(fetchMock)).toHaveLength(fetched)

        // The server saves it before the response reaches the page.
        await act(async () => {
            hold.resolve(
                new Response(
                    JSON.stringify({
                        data: { trace_id: id, bookmarked: true },
                    }),
                ),
            )
            await Promise.resolve()
        })

        await waitFor(() =>
            expect(detailUrls(fetchMock).length).toBeGreaterThan(fetched),
        )
        expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    })

    it('goes back to the state before the press when the write fails, says so, and fetches the run again', async () => {
        const error = vi.spyOn(notify, 'error')
        const { fetchMock, saved } = serve({ refuse: true })
        await openRun()
        const fetched = detailUrls(fetchMock).length

        await userEvent.click(toggle())

        await waitFor(() =>
            expect(toggle()).toHaveAttribute('aria-pressed', 'false'),
        )
        expect(error).toHaveBeenCalledWith('The bookmark could not be saved.')
        await waitFor(() =>
            expect(detailUrls(fetchMock).length).toBeGreaterThan(fetched),
        )
        expect(saved()).toBe(false)
        expect(toggle()).toHaveAttribute('aria-pressed', 'false')
        error.mockRestore()
    })

    it('removes a bookmark with a second press', async () => {
        const { fetchMock, saved } = serve()
        await openRun()

        await userEvent.click(toggle())
        await waitFor(() => expect(saved()).toBe(true))
        await userEvent.click(toggle())

        expect(toggle()).toHaveAttribute('aria-pressed', 'false')
        await waitFor(() => expect(saved()).toBe(false))
        expect(
            fetchMock.mock.calls
                .filter(([url]) => url.endsWith('/bookmark'))
                .map(([, init]) => init?.method),
        ).toEqual(['PUT', 'DELETE'])
    })
})
