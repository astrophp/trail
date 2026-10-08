import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AgentSubtotal, Span, Usage } from '@/api/types'
import { MetadataPanel } from '@/features/trace/metadata-panel'
import { formatCount, formatDateTime } from '@/lib/format'
import {
    detailFixture,
    makeAgentSpan,
    makeEmbeddingSpan,
    makeStepSpan,
    makeToolSpan,
} from '@/test/trace-api'

const coverage = detailFixture.data.coverage

const reported: Usage = {
    state: 'reported',
    input_tokens: 1200,
    output_tokens: 310,
    cache_read_tokens: 800,
    cache_write_tokens: null,
    reasoning_tokens: 90,
    total_tokens: 1510,
}

function show(span: Span, subtotal?: AgentSubtotal, cov = coverage) {
    return render(
        <MetadataPanel span={span} subtotal={subtotal} coverage={cov} />,
    )
}

const labels = () =>
    [...document.querySelectorAll('[data-slot="key-value-list"] dt')].map(
        (dt) => dt.textContent,
    )

/** The value cell beside a label. */
function value(label: string) {
    const dt = screen.getByText(label, { selector: 'dt' })

    return dt.nextElementSibling as HTMLElement
}

describe('the metadata table', () => {
    it('is one table of rows, with label and value side by side', () => {
        show(makeToolSpan('t', { sequence: 2, parent_id: 'p' }))

        expect(
            document.querySelector('[data-slot="key-value-list"]'),
        ).toHaveAttribute('data-layout', 'rows')
    })

    it('leaves out what cannot apply to a tool: no step index, provider, models or tokens', () => {
        show(makeToolSpan('t', { sequence: 2, parent_id: 'p' }))

        expect(labels()).toEqual([
            'Span id',
            'Parent span id',
            'Type',
            'Attempt',
            'Sequence',
            'Status',
            'Started',
            'Ended',
            'Offset',
            'Duration',
        ])
        expect(
            screen.queryByText(/Not applicable|None/),
        ).not.toBeInTheDocument()
    })

    it('shows a step with its step index, models and tokens, and an issue only when it has one', () => {
        const { unmount } = show(
            makeStepSpan('s', {
                sequence: 3,
                parent_id: 'p',
                step_number: 1,
                usage: reported,
            }),
        )

        expect(labels()).toEqual([
            'Span id',
            'Parent span id',
            'Type',
            'Attempt',
            'Step index',
            'Sequence',
            'Provider',
            'Requested model',
            'Responding model',
            'Status',
            'Started',
            'Ended',
            'Offset',
            'Duration',
            'Input tokens',
            'Cache read',
            'Cache write',
            'Output tokens',
            'Reasoning',
            'Total tokens',
            'Cost',
        ])
        expect(labels()).not.toContain('Issue kind')

        unmount()
        show(
            makeStepSpan('s', {
                sequence: 3,
                parent_id: 'p',
                step_number: 0,
                status: 'failed',
                issue_kind: 'rate_limited',
            }),
        )

        expect(value('Issue kind')).toHaveTextContent('Rate limited')
    })

    it('shows an agent without a parent or a step index, with its own tokens and cost', () => {
        show(makeAgentSpan('a', { sequence: 1 }), {
            span_id: 'a',
            name: 'SupportAssistant',
            usage: reported,
            cost: { state: 'estimated', amount: 0.5 },
        })

        expect(labels()).toEqual([
            'Span id',
            'Type',
            'Attempt',
            'Sequence',
            'Provider',
            'Requested model',
            'Status',
            'Started',
            'Ended',
            'Offset',
            'Duration',
            'Own input tokens',
            'Cache read',
            'Cache write',
            'Own output tokens',
            'Reasoning',
            'Own total tokens',
            'Own cost',
        ])
        expect(screen.queryByText('Parent span id')).not.toBeInTheDocument()
        expect(value('Own cost')).toHaveTextContent('$0.5000')
    })

    it('shows an embeddings call with its models but no step index or responding model', () => {
        show(makeEmbeddingSpan('e', { sequence: 1 }))

        expect(labels()).toContain('Provider')
        expect(labels()).toContain('Requested model')
        expect(labels()).not.toContain('Step index')
        expect(labels()).not.toContain('Responding model')
    })

    it('leaves out Ended for a span that has not ended', () => {
        show(
            makeToolSpan('t', {
                sequence: 2,
                parent_id: 'p',
                status: 'running',
                ended_at: null,
                duration_ms: null,
            }),
        )

        expect(labels()).not.toContain('Ended')
        expect(value('Duration')).toHaveTextContent('In progress')
    })

    it('says Not captured for a value a finished span should have and does not', () => {
        show(
            makeToolSpan('t', {
                sequence: 2,
                parent_id: 'p',
                duration_ms: null,
            }),
        )

        expect(value('Duration')).toHaveTextContent('Not captured')
    })

    it('says Pending for the responding model of a running step, and why it is missing on a streamed run', () => {
        const { unmount } = show(
            makeStepSpan('s', {
                sequence: 3,
                parent_id: 'p',
                step_number: 0,
                status: 'running',
                responding_model: null,
            }),
        )

        expect(value('Responding model')).toHaveTextContent('Pending')

        unmount()
        show(
            makeStepSpan('s', {
                sequence: 3,
                parent_id: 'p',
                step_number: 0,
                responding_model: null,
            }),
            undefined,
            {
                ...coverage,
                responding_model: {
                    ...coverage.responding_model,
                    reason: 'streamed',
                },
            },
        )

        expect(value('Responding model')).toHaveTextContent(
            'Not captured (streamed runs do not report it)',
        )
    })
})

describe('the times of the metadata table', () => {
    it('are the full date and time on one line, with how long ago only on hover', () => {
        const span = makeToolSpan('t', {
            sequence: 2,
            parent_id: 'p',
            started_at: '2026-01-01T12:00:00.031Z',
            ended_at: '2026-01-01T12:00:01.531Z',
        })

        show(span)

        for (const [label, at] of [
            ['Started', span.started_at],
            ['Ended', span.ended_at as string],
        ] as const) {
            const cell = value(label)
            const time = within(cell).getByText(
                formatDateTime(new Date(at), undefined),
            )

            expect(time.tagName).toBe('TIME')
            expect(cell.querySelectorAll('time')).toHaveLength(1)
            expect(time.children).toHaveLength(0)
            expect(time.title).toMatch(/ago$|just now$/)
        }
    })
})

describe('the ids of the metadata table', () => {
    it('are monospace, with the copy button immediately after the value', () => {
        show(makeToolSpan('t-id', { sequence: 2, parent_id: 'p-id' }))

        for (const [label, id] of [
            ['Span id', 't-id'],
            ['Parent span id', 'p-id'],
        ] as const) {
            const cell = value(label)
            const button = within(cell).getByRole('button', {
                name: `Copy ${label}`,
            })
            const text = within(cell).getByText(id)

            expect(text).toHaveClass('font-mono')
            expect(button.previousElementSibling).toBe(text.parentElement)
            // The value does not stretch to push the button to the far edge.
            expect(text.parentElement).toHaveClass(
                'group-data-[layout=rows]/kvl:flex-initial',
            )
        }
    })
})

describe('the token rows of the metadata table', () => {
    const rowsOf = () =>
        Object.fromEntries(
            [...document.querySelectorAll('dt')].map((dt) => [
                dt.textContent,
                dt.nextElementSibling?.textContent,
            ]),
        )

    it("show a step's counts as reported, nothing added up, and the parts indented", () => {
        show(
            makeStepSpan('s', {
                sequence: 3,
                parent_id: 'p',
                step_number: 0,
                usage: reported,
                cost: { state: 'estimated', amount: 0.0083 },
            }),
        )

        expect(rowsOf()).toMatchObject({
            'Input tokens': formatCount(1200),
            'Cache read': formatCount(800),
            'Cache write': 'Not reported',
            'Output tokens': formatCount(310),
            Reasoning: formatCount(90),
            'Total tokens': formatCount(1510),
            Cost: '$0.0083',
        })
        expect(screen.getByText('Cache read', { selector: 'dt' })).toHaveClass(
            'group-data-[layout=rows]/kvl:ps-4',
        )
        expect(
            screen.getByText('Input tokens', { selector: 'dt' }),
        ).not.toHaveClass('group-data-[layout=rows]/kvl:ps-4')
    })

    it("label an agent's own subtotal as its own", () => {
        show(makeAgentSpan('a', { sequence: 1 }), {
            span_id: 'a',
            name: 'SupportAssistant',
            usage: reported,
            cost: { state: 'estimated', amount: 0.5 },
        })

        expect(rowsOf()).toMatchObject({
            'Own input tokens': formatCount(1200),
            'Own output tokens': formatCount(310),
            'Own total tokens': formatCount(1510),
            'Own cost': '$0.5000',
        })
        expect(labels()).not.toContain('Input tokens')
    })

    it('say Pending in every row while the call is pending', () => {
        show(
            makeStepSpan('s', {
                sequence: 3,
                parent_id: 'p',
                step_number: 0,
                usage: { ...reported, state: 'pending' },
            }),
        )

        const rows = rowsOf()

        for (const label of [
            'Input tokens',
            'Cache read',
            'Cache write',
            'Output tokens',
            'Reasoning',
            'Total tokens',
        ]) {
            expect(rows[label]).toBe('Pending')
        }
    })

    it('say Not reported in every row when the provider reported nothing', () => {
        const none: Usage = {
            state: 'not_reported',
            input_tokens: null,
            output_tokens: null,
            cache_read_tokens: null,
            cache_write_tokens: null,
            reasoning_tokens: null,
            total_tokens: null,
        }

        show(
            makeStepSpan('s', {
                sequence: 3,
                parent_id: 'p',
                step_number: 0,
                usage: none,
            }),
        )

        const rows = rowsOf()

        for (const label of [
            'Input tokens',
            'Cache read',
            'Cache write',
            'Output tokens',
            'Reasoning',
            'Total tokens',
        ]) {
            expect(rows[label]).toBe('Not reported')
        }
    })
})

describe('the stored metadata under the table', () => {
    it('is a payload section after the table, when the span has metadata', () => {
        show(
            makeToolSpan('t', {
                sequence: 2,
                parent_id: 'p',
                metadata: { region: 'eu' },
            }),
        )

        const table = document.querySelector(
            '[data-slot="key-value-list"]',
        ) as Element
        const heading = screen.getByText('Stored metadata')

        expect(
            table.compareDocumentPosition(heading) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
    })
})
