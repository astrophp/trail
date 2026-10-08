import { describe, expect, it } from 'vitest'
import type { Span, Trace } from '@/api/types'
import { buildSpanTree } from '@/features/trace/build-span-tree'
import { selectNotices } from '@/features/trace/select-notices'
import {
    makeAgentSpan,
    makeDetail,
    makeStepSpan,
    makeToolSpan,
} from '@/test/trace-api'

const approval = (tool: string, id: string) => ({
    tool_call_id: id,
    tool,
    arguments: {},
    reason: null,
})

const failedStep = (id: string, sequence: number, attempt: number) =>
    makeStepSpan(id, {
        sequence,
        parent_id: 'root',
        attempt,
        step_number: 0,
        status: 'failed',
    })

function notices(
    trace: Partial<Trace>,
    options: {
        spans?: Span[]
        pendingApprovals?: ReturnType<typeof approval>[]
        truncated?: boolean
    } = {},
) {
    const spans = options.spans ?? [makeAgentSpan('root', { sequence: 1 })]
    const detail = makeDetail({
        trace,
        spans,
        pendingApprovals: options.pendingApprovals,
        spanLimit: options.truncated
            ? { limit: 2, total: 5, truncated: true }
            : undefined,
    })

    return selectNotices(detail.data, detail.span_limit, buildSpanTree(spans))
}

describe('selectNotices', () => {
    it('has nothing to say about a finished, ordinary run', () => {
        expect(notices({ status: 'completed' })).toEqual([])
        expect(notices({ status: 'failed' })).toEqual([])
    })

    it('says a running run is still open', () => {
        expect(notices({ status: 'running' })).toEqual([{ kind: 'running' }])
    })

    it('says an incomplete run never ended, and whether it was abandoned', () => {
        expect(
            notices({ status: 'incomplete', issue_kind: 'abandoned' }),
        ).toEqual([{ kind: 'incomplete', abandoned: true }])
        expect(notices({ status: 'incomplete', issue_kind: null })).toEqual([
            { kind: 'incomplete', abandoned: false },
        ])
    })

    it('names the tools waiting for approval in order, once each', () => {
        expect(
            notices(
                { status: 'awaiting_approval' },
                {
                    pendingApprovals: [
                        approval('issue_refund', 'a'),
                        approval('send_email', 'b'),
                        approval('issue_refund', 'c'),
                    ],
                },
            ),
        ).toEqual([{ kind: 'approval', tools: ['issue_refund', 'send_email'] }])
        expect(notices({ status: 'awaiting_approval' })).toEqual([
            { kind: 'approval', tools: [] },
        ])
    })

    it('shows at most one of the status notices', () => {
        for (const status of [
            'running',
            'incomplete',
            'awaiting_approval',
        ] as const) {
            expect(
                notices({ status }).filter((notice) =>
                    ['running', 'incomplete', 'approval'].includes(notice.kind),
                ),
            ).toHaveLength(1)
        }
    })

    it('points a recovered run at the failed span of its earliest failed attempt', () => {
        const spans = [
            makeAgentSpan('root', { sequence: 1 }),
            failedStep('late', 5, 2),
            failedStep('early', 3, 1),
            makeStepSpan('answer', {
                sequence: 6,
                parent_id: 'root',
                attempt: 3,
                step_number: 0,
            }),
        ]

        expect(
            notices({ status: 'completed', recovered: true }, { spans }),
        ).toEqual([{ kind: 'recovered', spanId: 'early' }])
    })

    it('has no span for a recovered run whose failed attempt is not among the spans', () => {
        expect(notices({ status: 'completed', recovered: true })).toEqual([
            { kind: 'recovered', spanId: null },
        ])
    })

    it('points a child-failed run at the first failed agent that has a parent', () => {
        const spans = [
            makeAgentSpan('root', { sequence: 1, status: 'failed' }),
            makeToolSpan('tool', { sequence: 2, parent_id: 'root' }),
            makeAgentSpan('second', {
                sequence: 5,
                parent_id: 'tool',
                status: 'failed',
            }),
            makeAgentSpan('first', {
                sequence: 3,
                parent_id: 'root',
                status: 'failed',
            }),
            makeAgentSpan('fine', { sequence: 4, parent_id: 'root' }),
        ]

        expect(
            notices({ status: 'completed', child_failed: true }, { spans }),
        ).toEqual([{ kind: 'child-failed', spanId: 'first', runFailed: false }])
        expect(notices({ status: 'completed', child_failed: true })).toEqual([
            { kind: 'child-failed', spanId: null, runFailed: false },
        ])
        expect(notices({ status: 'failed', child_failed: true })).toEqual([
            { kind: 'child-failed', spanId: null, runFailed: true },
        ])
    })

    it('puts a cut run first, then the status, then the flags', () => {
        expect(
            notices(
                {
                    status: 'running',
                    recovered: true,
                    child_failed: true,
                },
                { truncated: true },
            ).map((notice) => notice.kind),
        ).toEqual(['truncated', 'running', 'recovered', 'child-failed'])
        expect(notices({ status: 'completed' }, { truncated: true })).toEqual([
            { kind: 'truncated', limit: 2, total: 5 },
        ])
    })
})
