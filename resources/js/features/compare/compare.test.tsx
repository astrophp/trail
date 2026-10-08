import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Span, SpanLimit, Trace, Usage } from '@/api/types'
import { forgetRefreshFailures } from '@/features/trace/use-trace'
import { formatCost, formatDuration } from '@/lib/format'
import { appReady, renderApp } from '@/test/render-app'
import {
    answerInTurn,
    detailUrls,
    makeAgentSpan,
    makeDetail,
    makeStepSpan,
    makeToolSpan,
    mockTraceApi,
} from '@/test/trace-api'
import { deferred } from '@/test/traces-api'

beforeEach(() => {
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'csrf-1',
    }
})

afterEach(() => {
    forgetRefreshFailures()
    delete window.Trail
    vi.restoreAllMocks()
})

const reported = (input: number, output: number): Usage => ({
    state: 'reported',
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: input + output,
})

const plain: Partial<Trace> = {
    status: 'completed',
    issue_kind: null,
    recovered: false,
    child_failed: false,
    streamed: false,
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    duration_ms: 1200,
    usage: reported(1000, 200),
    cost: { state: 'estimated', amount: 0.0123 },
}

const oneStep = (): Span[] => [
    makeAgentSpan('root', { sequence: 1, status: 'completed' }),
    makeStepSpan('s1', {
        sequence: 2,
        parent_id: 'root',
        step_number: 0,
        status: 'completed',
        attempt: 1,
    }),
]

/** A run for the server to answer with. */
function run(
    id: string,
    trace: Partial<Trace> = {},
    spans: Span[] = oneStep(),
    spanLimit?: Partial<SpanLimit>,
) {
    return makeDetail({
        trace: { ...plain, id, ...trace },
        spans,
        spanLimit,
    })
}

const route = (query: string) => `/traces/compare${query}`

async function open(query: string) {
    renderApp(route(query))
    await appReady()
    await screen.findByRole('heading', { level: 1, name: 'Compare traces' })
}

const rowOf = (label: string) =>
    screen
        .getByText(label, { selector: 'dt' })
        .closest<HTMLElement>('[data-slot="compare-row"]')!
const row = (label: string) => within(rowOf(label))
/** What the two sides of a row say. */
const sides = (label: string) =>
    [...rowOf(label).querySelectorAll('dd')].map((cell) =>
        (cell.textContent ?? '').replace(/^Run [AB]/, ''),
    )
const differs = (label: string) => row(label).queryByText('Differs')
/** Waits until both runs are in. */
const bothIn = async () => {
    await screen.findByRole('link', { name: 'Open trace A' })
    await screen.findByRole('link', { name: 'Open trace B' })
}

describe('comparing two runs', () => {
    it('shows both runs side by side from the URL, with their values', async () => {
        mockTraceApi({
            'run-a': run('run-a', { name: 'Triage' }),
            'run-b': run('run-b', {
                name: 'Support',
                status: 'failed',
                issue_kind: 'rate_limited',
                duration_ms: 4500,
                usage: reported(3000, 500),
                cost: { state: 'estimated', amount: 0.0456 },
            }),
        })
        await open('?a=run-a&b=run-b')
        await bothIn()

        expect(sides('Status')[0]).toBe('Completed')
        expect(sides('Status')[1]).toBe('FailedRate limited')
        expect(sides('Duration')).toEqual([
            formatDuration(1200),
            formatDuration(4500),
        ])
        expect(row('Tokens').getByText('1,200 tokens')).toBeInTheDocument()
        expect(row('Tokens').getByText('3,500 tokens')).toBeInTheDocument()
        expect(sides('Est. cost')).toEqual([
            formatCost(0.0123),
            formatCost(0.0456),
        ])
        expect(sides('Agent')[0]).toContain('Triage')
        expect(sides('Agent')[1]).toContain('Support')
        expect(
            row('Provider and model').getAllByText('claude-sonnet-4-5'),
        ).toHaveLength(2)
        expect(sides('Streamed')).toEqual(['No', 'No'])
        expect(
            screen.getByRole('link', { name: 'Open trace A' }),
        ).toHaveAttribute(
            'href',
            `/trail/traces/run-a?from=${encodeURIComponent('/traces/compare?a=run-a&b=run-b')}`,
        )
        expect(
            screen.getByRole('link', { name: 'Open trace B' }),
        ).toHaveAttribute(
            'href',
            expect.stringContaining('/trail/traces/run-b?from='),
        )
    })

    it('says in words what was not captured, and marks no such row as differing', async () => {
        mockTraceApi({
            'run-a': run('run-a', {
                duration_ms: null,
                model: null,
                usage: {
                    ...reported(0, 0),
                    state: 'not_reported',
                    input_tokens: null,
                    output_tokens: null,
                    total_tokens: null,
                },
                cost: { state: 'unpriced', amount: null },
            }),
            'run-b': run('run-b', {
                status: 'running',
                streamed: true,
                usage: {
                    ...reported(0, 0),
                    state: 'pending',
                    input_tokens: null,
                    output_tokens: null,
                    total_tokens: null,
                },
                cost: { state: 'pending', amount: null },
            }),
        })
        await open('?a=run-a&b=run-b')
        await bothIn()

        expect(sides('Duration')).toEqual(['Not captured', 'In progress'])
        expect(sides('Tokens')).toEqual([
            'Not reportedIn Not reported · Out Not reported',
            'PendingIn Pending · Out Pending',
        ])
        expect(sides('Est. cost')).toEqual(['Unpriced', 'Pending'])
        expect(
            row('Provider and model').getByText('Not captured', {
                selector: 'span.text-muted-foreground',
            }),
        ).toBeInTheDocument()

        for (const label of [
            'Duration',
            'Tokens',
            'Est. cost',
            'Provider and model',
        ]) {
            expect(differs(label)).toBeNull()
        }

        // A keyed row with a side missing is not marked; keyed rows with both sides are.
        expect(differs('Status')).toBeInTheDocument()
        expect(differs('Streamed')).toBeInTheDocument()
    })

    it('marks the rows whose shown values differ, and only those', async () => {
        mockTraceApi({
            'run-a': run('run-a'),
            'run-b': run(
                'run-b',
                {
                    status: 'failed',
                    issue_kind: 'tool_error',
                    model: 'claude-haiku-4-5',
                    streamed: true,
                },
                [
                    ...oneStep(),
                    makeToolSpan('t1', {
                        sequence: 3,
                        parent_id: 'root',
                        status: 'failed',
                    }),
                ],
            ),
        })
        await open('?a=run-a&b=run-b')
        await bothIn()

        for (const label of [
            'Status',
            'Provider and model',
            'Streamed',
            'Spans',
            'Tools',
            'Failed spans',
        ]) {
            expect(differs(label), label).toBeInTheDocument()
        }

        for (const label of [
            'Agents',
            'Model steps',
            'Embeddings',
            'Attempts',
            'Incomplete spans',
            'Agent',
        ]) {
            expect(differs(label), label).toBeNull()
        }

        // The icon is decoration: the word is what says it.
        expect(within(rowOf('Status')).getByText('Differs')).toBeVisible()
    })

    it('counts the structure of a failover and of a delegation', async () => {
        mockTraceApi({
            'run-a': run('run-a', {}, [
                makeAgentSpan('root', { sequence: 1, status: 'completed' }),
                makeStepSpan('s1', {
                    sequence: 2,
                    parent_id: 'root',
                    step_number: 0,
                    attempt: 1,
                    status: 'failed',
                }),
                makeStepSpan('s2', {
                    sequence: 3,
                    parent_id: 'root',
                    step_number: 0,
                    attempt: 2,
                    status: 'completed',
                }),
            ]),
            'run-b': run('run-b', {}, [
                makeAgentSpan('root', { sequence: 1, status: 'completed' }),
                makeToolSpan('t1', {
                    sequence: 2,
                    parent_id: 'root',
                    status: 'completed',
                }),
                makeAgentSpan('child', {
                    sequence: 3,
                    parent_id: 'root',
                    status: 'incomplete',
                }),
                makeStepSpan('s1', {
                    sequence: 4,
                    parent_id: 'child',
                    step_number: 0,
                    attempt: 1,
                    status: 'completed',
                }),
            ]),
        })
        await open('?a=run-a&b=run-b')
        await bothIn()

        expect(sides('Spans')).toEqual(['3', '4'])
        expect(sides('Agents')).toEqual(['1', '2'])
        expect(sides('Model steps')).toEqual(['2', '1'])
        expect(sides('Tools')).toEqual(['0', '1'])
        expect(sides('Embeddings')).toEqual(['0', '0'])
        expect(sides('Attempts')).toEqual(['2', '1'])
        expect(sides('Failed spans')).toEqual(['1', '0'])
        expect(sides('Incomplete spans')).toEqual(['0', '1'])
    })

    it('says when the counts by type cover only the spans that were returned', async () => {
        mockTraceApi({
            'run-a': run('run-a', {}, oneStep(), {
                total: 5000,
                truncated: true,
                limit: 2,
            }),
            'run-b': run('run-b'),
        })
        await open('?a=run-a&b=run-b')
        await bothIn()

        expect(sides('Spans')[0]).toBe(
            '5,000The counts by type cover the first 2 spans',
        )
        expect(sides('Spans')[1]).toBe('2')
    })

    it('asks for two different runs when an id is missing or both are the same, and asks for nothing', async () => {
        const fetchMock = mockTraceApi({ 'run-a': run('run-a') })

        for (const query of ['', '?a=run-a', '?b=run-a', '?a=run-a&b=run-a']) {
            document.body.innerHTML = ''
            window.history.pushState({}, '', '/trail/traces')
            const { unmount } = renderApp(route(query))
            await appReady()

            expect(
                await screen.findByRole('heading', {
                    name: 'Choose two different runs to compare',
                }),
            ).toBeInTheDocument()
            expect(
                screen.getByRole('link', { name: 'Back to traces' }),
            ).toHaveAttribute('href', '/trail/traces')
            expect(screen.queryByText('Open trace A')).not.toBeInTheDocument()
            unmount()
        }

        // `compare` was never read as a run's id, nor the empty ids as runs.
        expect(detailUrls(fetchMock)).toEqual([])
    })

    it('says "Run not found" for the run that is gone while the other shows', async () => {
        mockTraceApi({ 'run-a': run('run-a', { name: 'Triage' }) })
        await open('?a=run-a&b=gone')

        await screen.findByText('Run not found')

        expect(row('Run').getByText('Run not found')).toBeVisible()
        expect(sides('Status')).toEqual(['Completed', 'Unavailable'])
        expect(screen.getByRole('link', { name: 'Open trace A' })).toBeVisible()
        expect(
            screen.queryByRole('link', { name: 'Open trace B' }),
        ).not.toBeInTheDocument()
        expect(differs('Status')).toBeNull()
    })

    it('draws bars for the column still loading while the other shows', async () => {
        const held = deferred()
        mockTraceApi({
            'run-a': run('run-a'),
            'run-b': () => held.promise,
        })
        await open('?a=run-a&b=run-b')
        await screen.findByText('Completed')

        expect(document.querySelector('dl')).toHaveAttribute(
            'aria-busy',
            'true',
        )
        expect(
            document.querySelectorAll('[data-slot="skeleton"]').length,
        ).toBeGreaterThan(0)

        held.resolve(
            new Response(JSON.stringify(run('run-b', { status: 'failed' }))),
        )
        await screen.findByText('Failed')

        expect(document.querySelector('dl')).toHaveAttribute(
            'aria-busy',
            'false',
        )
        expect(
            document.querySelectorAll('[data-slot="skeleton"]'),
        ).toHaveLength(0)
    })

    it('shows a failed request in its column with a retry, and the other column still shows', async () => {
        mockTraceApi({
            'run-a': run('run-a'),
            'run-b': answerInTurn(500, run('run-b', { status: 'failed' })),
        })
        await open('?a=run-a&b=run-b')

        const alert = await screen.findByRole('alert')

        expect(
            within(alert).getByText('The run could not be loaded'),
        ).toBeVisible()
        expect(sides('Status')[0]).toBe('Completed')

        await userEvent.click(
            within(alert).getByRole('button', { name: 'Try again' }),
        )

        await screen.findByText('Failed')
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('leads back to the list it was started from, and a run opened from here leads back here', async () => {
        mockTraceApi({ 'run-a': run('run-a'), 'run-b': run('run-b') })
        const list = '/traces?range=7d&status=failed'
        await open(`?a=run-a&b=run-b&from=${encodeURIComponent(list)}`)
        await bothIn()

        expect(
            screen.getByRole('link', { name: 'Back to traces' }),
        ).toHaveAttribute('href', '/trail/traces?range=7d&status=failed')

        await userEvent.click(
            screen.getByRole('link', { name: 'Open trace B' }),
        )

        const back = await screen.findAllByRole('link', {
            name: 'Back to comparison',
        })

        expect(window.location.pathname).toBe('/trail/traces/run-b')
        expect(back[0]).toHaveAttribute(
            'href',
            '/trail/traces/compare?a=run-a&b=run-b',
        )
        expect(
            screen.queryByRole('group', { name: 'Step through the list' }),
        ).not.toBeInTheDocument()
    })

    it('works out nothing from the values it shows', async () => {
        mockTraceApi({
            'run-a': run('run-a'),
            'run-b': run('run-b', {
                cost: { state: 'estimated', amount: 0.0246 },
                duration_ms: 2400,
                usage: reported(2000, 400),
            }),
        })
        await open('?a=run-a&b=run-b')
        await bothIn()

        // The whole text of the three rows: any extra number, sign or word would fail here.
        expect(rowOf('Duration').textContent).toBe(
            `DurationRun A${formatDuration(1200)}Run B${formatDuration(2400)}`,
        )
        expect(rowOf('Tokens').textContent).toBe(
            'TokensRun A1.2k1,200 tokensIn 1,000 · Out 200Run B2.4k2,400 tokensIn 2,000 · Out 400',
        )
        expect(rowOf('Est. cost').textContent).toBe(
            `Est. costRun A${formatCost(0.0123)}Run B${formatCost(0.0246)}`,
        )
        expect(differs('Est. cost')).toBeNull()

        const text = document.querySelector('main')?.textContent ?? ''
        expect(text).toContain(formatCost(0.0246))

        expect(text).not.toMatch(
            /%|×|\bx\b|faster|slower|cheaper|costlier|more expensive|\bless\b|difference|\bratio\b|saved|twice|double|[+−]\s?\$/i,
        )
        expect(screen.queryByText('Differs')).not.toBeInTheDocument()
    })

    it('does not state counts by type for a run with more spans than came back, nor mark them', async () => {
        mockTraceApi({
            // The failed span is among the spans beyond the limit.
            'run-a': run('run-a', {}, oneStep(), {
                total: 5000,
                truncated: true,
                limit: 2,
            }),
            'run-b': run('run-b', {}, [
                ...oneStep(),
                makeStepSpan('s2', {
                    sequence: 3,
                    parent_id: 'root',
                    step_number: 1,
                    attempt: 1,
                    status: 'completed',
                }),
            ]),
        })
        await open('?a=run-a&b=run-b')
        await bothIn()

        expect(sides('Failed spans')).toEqual(['At least 0', '0'])
        expect(sides('Model steps')).toEqual(['At least 1', '2'])
        expect(sides('Attempts')).toEqual(['At least 1', '1'])

        for (const label of [
            'Agents',
            'Model steps',
            'Tools',
            'Embeddings',
            'Attempts',
            'Failed spans',
            'Incomplete spans',
        ]) {
            expect(differs(label), label).toBeNull()
        }

        // The total is the run's own, not counted.
        expect(differs('Spans')).toBeInTheDocument()
    })

    it('does not mark the span rows while a run is still running', async () => {
        mockTraceApi({
            'run-a': run('run-a', { status: 'running' }),
            'run-b': run('run-b', {}, [
                ...oneStep(),
                makeToolSpan('t1', {
                    sequence: 3,
                    parent_id: 'root',
                    status: 'failed',
                }),
            ]),
        })
        await open('?a=run-a&b=run-b')
        await bothIn()

        expect(differs('Status')).toBeInTheDocument()

        for (const label of ['Spans', 'Agents', 'Tools', 'Failed spans']) {
            expect(differs(label), label).toBeNull()
        }
    })

    it('loads both columns again from nothing when the page is reloaded', async () => {
        const fetchMock = mockTraceApi({
            'run-a': run('run-a'),
            'run-b': run('run-b', { status: 'failed' }),
        })
        const first = renderApp(route('?a=run-a&b=run-b'))
        await appReady()
        await bothIn()
        first.unmount()

        // A new app with a new query client, at the same address.
        renderApp(route('?a=run-a&b=run-b'))
        await appReady()
        await bothIn()

        expect(sides('Status')).toEqual(['Completed', 'Failed'])

        const asked = detailUrls(fetchMock)

        expect(asked.filter((url) => url.endsWith('/run-a'))).toHaveLength(2)
        expect(asked.filter((url) => url.endsWith('/run-b'))).toHaveLength(2)
    })
})
