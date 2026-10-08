import {
    screen,
    within,
    type BoundFunctions,
    type queries,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
    Coverage,
    CoverageItem,
    PendingApproval,
    Trace,
} from '@/api/types'
import { formatDateTime } from '@/lib/format'
import { appReady, renderApp } from '@/test/render-app'
import {
    detailFixture,
    makeAgentSpan,
    makeDetail,
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

type Options = {
    trace?: Partial<Trace>
    coverage?: Partial<Coverage>
    pendingApprovals?: PendingApproval[]
    resolvedToolCallIds?: string[]
    truncated?: boolean
}

async function openMetadata({
    trace,
    coverage,
    pendingApprovals,
    resolvedToolCallIds,
    truncated = false,
}: Options = {}) {
    mockTraceApi({
        [id]: makeDetail({
            trace: { id, ...trace },
            spans: [makeAgentSpan('root', { sequence: 1 })],
            coverage,
            pendingApprovals,
            resolvedToolCallIds,
            spanLimit: truncated
                ? { limit: 1500, total: 3000, truncated: true }
                : undefined,
        }),
    })
    renderApp(`/traces/${id}?view=metadata`)
    await appReady()
    await screen.findByRole('region', { name: 'Recorded attributes' })
}

const attributes = () =>
    within(screen.getByRole('region', { name: 'Recorded attributes' }))
const coverageList = () =>
    within(screen.getByRole('region', { name: 'Capture coverage' }))
const valueOf = (
    scope: { getByText: BoundFunctions<typeof queries>['getByText'] },
    label: string,
) => scope.getByText(label, { selector: 'dt' }).nextElementSibling

const item = (
    state: CoverageItem['state'],
    captured: number,
    expected: number,
    reason: CoverageItem['reason'] = null,
): CoverageItem => ({ state, captured, expected, reason })

const user = { id: '7', type: 'App\\Models\\User', name: 'Ada', email: null }

describe('the metadata tab: recorded attributes', () => {
    it('lists everything recorded about a run that has it all', async () => {
        await openMetadata({
            trace: {
                type: 'agent',
                name: 'SupportAssistant',
                agent_class: 'App\\Agents\\SupportAssistant',
                status: 'failed',
                issue_kind: 'rate_limited',
                recovered: true,
                child_failed: true,
                streamed: true,
                provider: 'anthropic',
                model: 'claude-sonnet-4-5',
                conversation_id: 'conversation-1',
                user,
                started_at: '2026-01-02T11:00:00.000Z',
                ended_at: '2026-01-02T11:00:03.000Z',
                duration_ms: 3000,
                span_count: 4,
                bookmarked: true,
                cost: { state: 'partial', amount: 0.01 },
                usage: { ...detailFixture.data.trace.usage, state: 'reported' },
            },
        })

        const list = attributes()

        expect(valueOf(list, 'Run id')).toHaveTextContent(id)
        expect(
            list.getByRole('button', { name: 'Copy Run id' }),
        ).toBeInTheDocument()
        expect(valueOf(list, 'Type')).toHaveTextContent('Agent run')
        expect(valueOf(list, 'Agent')).toHaveTextContent('SupportAssistant')
        expect(valueOf(list, 'Agent class')).toHaveTextContent(
            'App\\Agents\\SupportAssistant',
        )
        expect(valueOf(list, 'Status')).toHaveTextContent('Failed')
        expect(valueOf(list, 'Issue kind')).toHaveTextContent('Rate limited')
        expect(valueOf(list, 'Recovered')).toHaveTextContent('Yes')
        expect(valueOf(list, 'Child failed')).toHaveTextContent('Yes')
        expect(valueOf(list, 'Recording')).toHaveTextContent('Streamed')
        expect(valueOf(list, 'Provider')).toHaveTextContent('anthropic')
        expect(valueOf(list, 'Provider')).toHaveTextContent('last attempt')
        expect(valueOf(list, 'Requested model')).toHaveTextContent(
            'claude-sonnet-4-5',
        )
        expect(valueOf(list, 'Requested model')).toHaveTextContent(
            'last attempt',
        )
        expect(valueOf(list, 'Conversation id')).toHaveTextContent(
            'conversation-1',
        )
        expect(
            list.getByRole('button', { name: 'Copy Conversation id' }),
        ).toBeInTheDocument()
        expect(valueOf(list, 'User')).toHaveTextContent('Ada')
        expect(valueOf(list, 'User id')).toHaveTextContent('7')
        expect(valueOf(list, 'User type')).toHaveTextContent(
            'App\\Models\\User',
        )
        expect(valueOf(list, 'Started')).toHaveTextContent(
            formatDateTime(new Date('2026-01-02T11:00:00.000Z'), 'UTC'),
        )
        expect(valueOf(list, 'Ended')).toHaveTextContent(
            formatDateTime(new Date('2026-01-02T11:00:03.000Z'), 'UTC'),
        )
        expect(valueOf(list, 'Duration')).toHaveTextContent('3.00s')
        expect(valueOf(list, 'Spans')).toHaveTextContent('4')
        expect(valueOf(list, 'Cost state')).toHaveTextContent('Partial')
        expect(valueOf(list, 'Usage state')).toHaveTextContent('Reported')
        expect(valueOf(list, 'Bookmarked')).toHaveTextContent('Yes')
    })

    it('leaves out the rows that do not apply, and says No for a run that is not bookmarked', async () => {
        await openMetadata({
            trace: {
                type: 'embedding',
                status: 'completed',
                agent_class: null,
                issue_kind: null,
                recovered: false,
                child_failed: false,
                streamed: false,
                conversation_id: null,
                user: null,
                bookmarked: false,
            },
        })

        const list = attributes()

        // Neighbouring rows are there, so the omissions below are not a page that did not render.
        expect(valueOf(list, 'Type')).toHaveTextContent('Embedding run')
        expect(valueOf(list, 'Name')).toBeInTheDocument()
        expect(valueOf(list, 'Recording')).toHaveTextContent('Not streamed')
        expect(valueOf(list, 'Bookmarked')).toHaveTextContent('No')
        expect(valueOf(list, 'Started')).toBeInTheDocument()
        expect(valueOf(list, 'Ended')).toBeInTheDocument()

        for (const label of [
            'Agent class',
            'Issue kind',
            'Recovered',
            'Child failed',
            'Conversation id',
            'User',
            'User id',
            'User type',
            'Resolved tool calls',
        ]) {
            expect(
                list.queryByText(label, { selector: 'dt' }),
            ).not.toBeInTheDocument()
        }

        expect(list.queryByText('last attempt')).not.toBeInTheDocument()
        expect(list.queryByText('None')).not.toBeInTheDocument()
    })
})

describe('the metadata tab: when the run ended', () => {
    it('says a finished run without an end was not captured', async () => {
        await openMetadata({
            trace: { status: 'completed', ended_at: null },
        })

        expect(valueOf(attributes(), 'Started')).toBeInTheDocument()
        expect(valueOf(attributes(), 'Ended')).toHaveTextContent('Not captured')
    })

    it('leaves the end out only while the run is running', async () => {
        await openMetadata({
            trace: { status: 'running', ended_at: null, duration_ms: null },
        })

        expect(valueOf(attributes(), 'Started')).toBeInTheDocument()
        expect(
            attributes().queryByText('Ended', { selector: 'dt' }),
        ).not.toBeInTheDocument()
    })
})

describe('the metadata tab: capture coverage', () => {
    it('lists the six items in order, each with its state in words and a mark', async () => {
        await openMetadata()

        const list = coverageList()
        const labels = list
            .getAllByText(/./, { selector: 'dt' })
            .map((dt) => dt.textContent)

        expect(labels).toEqual([
            'Timing',
            'Responding model',
            'Usage',
            'Cost',
            'System prompt',
            'Payloads',
        ])
        expect(
            screen
                .getByRole('region', { name: 'Capture coverage' })
                .querySelectorAll('dd svg'),
        ).toHaveLength(6)
    })

    it.each([
        ['captured', item('captured', 4, 4), 'Captured (4 of 4)'],
        [
            'partial, unfinished',
            item('partial', 2, 4, 'unfinished'),
            'Partly captured (2 of 4): the spans without it never finished',
        ],
        [
            'not captured, not reported',
            item('not_captured', 0, 3, 'not_reported'),
            'Not captured (0 of 3): not reported by the SDK or provider',
        ],
        [
            'not captured, streamed',
            item('not_captured', 0, 1, 'streamed'),
            'Not captured (0 of 1): streamed runs do not report the responding model',
        ],
        [
            'partial, no price',
            item('partial', 1, 2, 'no_price'),
            'Partly captured (1 of 2): no price is configured for a model',
        ],
        [
            'not captured with counts as given',
            item('not_captured', 1, 3, 'not_reported'),
            'Not captured (1 of 3): not reported by the SDK or provider',
        ],
        [
            'not applicable',
            item('not_applicable', 0, 0),
            'Not applicable to this run',
        ],
    ])('words %s', async (_name, value, words) => {
        await openMetadata({ coverage: { usage: value } })

        expect(valueOf(coverageList(), 'Usage')).toHaveTextContent(words)
        expect(valueOf(coverageList(), 'Cost')).toBeInTheDocument()
    })

    it('shows a state it does not know as received, with a neutral mark', async () => {
        await openMetadata({
            coverage: {
                usage: {
                    state: 'degraded',
                    captured: 2,
                    expected: 5,
                    reason: null,
                } as unknown as CoverageItem,
            },
        })

        expect(valueOf(coverageList(), 'Usage')).toHaveTextContent(
            'Reported as degraded (2 of 5)',
        )
        expect(
            valueOf(coverageList(), 'Usage')?.querySelector('svg'),
        ).not.toBeNull()
        expect(coverageList().queryByText(/undefined/)).toBeNull()
    })

    it('leaves out a reason it does not know', async () => {
        await openMetadata({
            coverage: {
                usage: {
                    state: 'partial',
                    captured: 1,
                    expected: 2,
                    reason: 'rate_limited',
                } as unknown as CoverageItem,
            },
        })

        const text = valueOf(coverageList(), 'Usage')?.textContent

        expect(text).toBe('Partly captured (1 of 2)')
    })

    it('words the system prompt and payload gaps by what was not stored', async () => {
        await openMetadata({
            coverage: {
                system_prompt: item('not_captured', 0, 2, 'not_stored'),
                payloads: item('partial', 1, 4, 'not_stored'),
            },
        })

        expect(valueOf(coverageList(), 'System prompt')).toHaveTextContent(
            'Not captured (0 of 2): no system prompt was stored',
        )
        expect(valueOf(coverageList(), 'Payloads')).toHaveTextContent(
            'Partly captured (1 of 4): payloads were not stored; payload capture may be switched off (trail.capture.enabled)',
        )
    })

    it('says the counts cover the first spans when the response was cut', async () => {
        await openMetadata({ truncated: true })

        expect(valueOf(coverageList(), 'Timing')).toBeInTheDocument()
        expect(
            coverageList().getByText(
                'Coverage is counted over the first 1,500 spans.',
            ),
        ).toBeInTheDocument()
    })

    it('has no such line when nothing was cut', async () => {
        await openMetadata()

        expect(valueOf(coverageList(), 'Timing')).toBeInTheDocument()
        expect(screen.queryByText(/Coverage is counted over/)).toBeNull()
    })
})

describe('the metadata tab: pending approvals', () => {
    it('lists each waiting tool call, with its arguments and reason when stored', async () => {
        await openMetadata({
            trace: { status: 'awaiting_approval' },
            pendingApprovals: [
                {
                    tool_call_id: 'toolu_02',
                    tool: 'refund_order',
                    arguments: { order: 1042 },
                    reason: 'Moves money',
                },
                {
                    tool_call_id: 'toolu_03',
                    tool: 'delete_account',
                    arguments: null,
                    reason: null,
                },
            ],
            resolvedToolCallIds: ['toolu_01'],
        })

        const panel = within(
            screen.getByRole('region', { name: 'Pending approvals' }),
        )
        const items = panel
            .getAllByRole('listitem')
            .filter((li) => li.textContent?.includes('Tool call id'))

        expect(items).toHaveLength(2)
        expect(within(items[0]).getByText('refund_order')).toBeInTheDocument()
        expect(within(items[0]).getByText('toolu_02')).toBeInTheDocument()
        expect(
            within(items[0]).getByRole('button', { name: 'Copy Tool call id' }),
        ).toBeInTheDocument()
        expect(within(items[0]).getByText('Moves money')).toBeInTheDocument()
        expect(within(items[0]).getByText(/1042/)).toBeInTheDocument()
        expect(within(items[1]).getByText('delete_account')).toBeInTheDocument()
        expect(within(items[1]).getByText(/Not captured/)).toBeInTheDocument()
        expect(
            within(items[1]).queryByText('Reason', { selector: 'dt' }),
        ).not.toBeInTheDocument()
        expect(
            panel.getByText(
                'A run that resumes after approval is recorded as a separate run.',
            ),
        ).toBeInTheDocument()
        expect(valueOf(attributes(), 'Resolved tool calls')).toHaveTextContent(
            'toolu_01',
        )
        expect(
            panel.queryByText('Resolved tool calls', { selector: 'dt' }),
        ).not.toBeInTheDocument()
    })

    it('is absent for a run that waits for nothing, while the tool calls it settled are still listed', async () => {
        await openMetadata({ resolvedToolCallIds: ['toolu_01', 'toolu_04'] })

        expect(valueOf(attributes(), 'Run id')).toBeInTheDocument()
        expect(valueOf(attributes(), 'Resolved tool calls')).toHaveTextContent(
            'toolu_01toolu_04',
        )
        expect(
            screen.queryByRole('region', { name: 'Pending approvals' }),
        ).not.toBeInTheDocument()
    })
})
