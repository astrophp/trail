import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CoverageItem } from '@/api/types'
import { makeAgentSpan, makeStepSpan, makeToolSpan } from '@/test/trace-api'
import { TreeHarness } from '@/test/tree-harness'
import { PaneHarness } from '@/test/pane-harness'
import { row } from '@/test/tree-queries'

const spans = [
    makeAgentSpan('root', {
        sequence: 1,
        offset_ms: 0,
        duration_ms: 1000,
    }),
    makeStepSpan('s1', {
        sequence: 2,
        parent_id: 'root',
        step_number: 0,
        offset_ms: 100,
        duration_ms: 500,
    }),
    makeToolSpan('untimed', {
        sequence: 3,
        parent_id: 'root',
        name: 'untimed',
        offset_ms: 600,
        duration_ms: null,
    }),
    makeStepSpan('s2', {
        sequence: 4,
        parent_id: 'root',
        step_number: 1,
        status: 'running',
        offset_ms: 700,
        duration_ms: null,
    }),
]

const bar = (name: string | RegExp) =>
    within(row(name)).getByRole('img', { name: /Starts at/, hidden: true })

describe('the timing lane', () => {
    it("draws a bar from a span's own offset and duration on the run's axis", () => {
        render(<TreeHarness spans={spans} runDurationMs={1000} />)

        const step = bar('Model step 1, Completed')
        const fill = step.querySelector('[data-slot="timing-bar-fill"]')

        expect(step).toHaveAttribute('data-state', 'bar')
        expect(step).toHaveAccessibleName('Starts at +100 ms, took 500 ms')
        expect(fill).toHaveStyle({ left: '10%', width: '50%' })
        expect(
            bar('SupportAssistant, Completed').firstElementChild,
        ).toHaveStyle({ left: '0%', width: '100%' })
    })

    it('says Not captured in the lane of a span without a duration, and draws nothing', () => {
        render(<TreeHarness spans={spans} runDurationMs={1000} />)

        const untimed = row('untimed, Completed')
        const lane = untimed.querySelector('[data-slot="timing-bar"]')

        expect(lane).toHaveAttribute('data-state', 'none')
        expect(lane).toHaveTextContent('Not captured')
        expect(
            untimed.querySelector('[data-slot="timing-bar-fill"]'),
        ).toBeNull()
    })

    it('draws a running span as an open bar, never closed at a guessed end', () => {
        render(<TreeHarness spans={spans} runDurationMs={1000} />)

        const running = within(row('Model step 2, Running')).getByRole('img', {
            name: 'Starts at +700 ms, still running',
            hidden: true,
        })

        expect(running).toHaveAttribute('data-state', 'open')
        expect(running).toHaveTextContent('In progress')
    })

    it('describes a closed bar by its sentence in the row description', () => {
        render(<TreeHarness spans={spans} runDurationMs={1000} />)

        expect(row('Model step 1, Completed')).toHaveAccessibleDescription(
            /Starts at \+100 ms, took 500 ms/,
        )
    })

    it("points a running row's description at its open bar, whose label is the sentence (the computed description is not asserted: jsdom reads the bar's text instead of its label)", () => {
        render(<TreeHarness spans={spans} runDurationMs={1000} />)

        const running = row('Model step 2, Running')
        const bar = running.querySelector('[data-slot="timing-bar"]')

        expect(bar?.id).not.toBe('')
        expect(running.getAttribute('aria-describedby')?.split(' ')).toContain(
            bar?.id,
        )
        expect(bar).toHaveAttribute(
            'aria-label',
            'Starts at +700 ms, still running',
        )
    })

    it('draws no bar when no span has timing, but keeps the duration text', () => {
        render(
            <TreeHarness
                spans={[
                    makeToolSpan('only', {
                        sequence: 1,
                        name: 'only',
                        duration_ms: null,
                    }),
                ]}
            />,
        )

        // The row is there; its lane says Not captured and holds no fill.
        const only = row('only, Completed')
        const lane = only.querySelector('[data-slot="timing-bar"]')

        expect(lane).toHaveAttribute('data-state', 'none')
        expect(lane).toHaveTextContent('Not captured')
        expect(
            document.querySelector('[data-slot="timing-bar-fill"]'),
        ).toBeNull()
        expect(
            within(only).getAllByText('Not captured').length,
        ).toBeGreaterThan(1)
    })

    it('gives a running span its open bar, visibly non-empty, when the run has no duration', () => {
        render(
            <PaneHarness
                runDurationMs={null}
                spans={[
                    makeAgentSpan('root', {
                        sequence: 1,
                        status: 'running',
                        offset_ms: 0,
                        duration_ms: null,
                    }),
                    makeStepSpan('done', {
                        sequence: 2,
                        parent_id: 'root',
                        step_number: 0,
                        offset_ms: 0,
                        duration_ms: 100,
                    }),
                    makeStepSpan('live', {
                        sequence: 3,
                        parent_id: 'root',
                        step_number: 1,
                        status: 'running',
                        offset_ms: 150,
                        duration_ms: null,
                    }),
                ]}
            />,
        )

        const live = row('Model step 2, Running')
        const bar = live.querySelector('[data-slot="timing-bar"]')

        expect(bar).toHaveAttribute('data-state', 'open')
        expect(bar?.querySelector('[data-slot="timing-bar-fill"]')).toHaveClass(
            'min-w-1.5',
        )
        // The axis reaches the running span's start.
        expect(
            document.querySelector('[data-slot="time-axis"]'),
        ).toHaveTextContent('150 ms')
    })

    it('says In progress in the column label when everything is running and nothing has a length yet', () => {
        render(
            <PaneHarness
                spans={[
                    makeAgentSpan('root', {
                        sequence: 1,
                        status: 'running',
                        offset_ms: 0,
                        duration_ms: null,
                    }),
                    makeStepSpan('live', {
                        sequence: 2,
                        parent_id: 'root',
                        step_number: 0,
                        status: 'running',
                        offset_ms: 0,
                        duration_ms: null,
                    }),
                ]}
            />,
        )

        const axis = document.querySelector('[data-slot="time-axis"]')

        expect(axis).toHaveTextContent('In progress')
        expect(axis).not.toHaveTextContent('Timing not captured')
    })
})

const partial = (captured: number, expected: number): CoverageItem => ({
    state: 'partial',
    captured,
    expected,
    reason: 'not_reported',
})

describe('the column labels of the lane', () => {
    it('show the start, the middle and the end of the axis', () => {
        render(<PaneHarness spans={spans} runDurationMs={2000} />)

        const axis = document.querySelector('[data-slot="time-axis"]')

        expect(axis).toHaveTextContent('0 ms')
        expect(axis).toHaveTextContent('1.00s')
        expect(axis).toHaveTextContent('2.00s')
        expect(axis?.children).toHaveLength(3)
    })

    it('are hidden from assistive technology, because the rows carry the facts', () => {
        render(<PaneHarness spans={spans} runDurationMs={2000} />)

        const axis = document.querySelector('[data-slot="time-axis"]')

        expect(axis?.closest('[aria-hidden="true"]')).not.toBeNull()
    })

    it('say Timing not captured when the run has no timing at all', () => {
        render(
            <PaneHarness
                spans={[
                    makeToolSpan('only', {
                        sequence: 1,
                        duration_ms: null,
                    }),
                ]}
            />,
        )

        expect(
            document.querySelector('[data-slot="time-axis"]'),
        ).toHaveTextContent('Timing not captured')
    })

    it('raise the axis to the span that ends after the run', () => {
        render(<PaneHarness spans={spans} runDurationMs={500} />)

        expect(
            document.querySelector('[data-slot="time-axis"]'),
        ).toHaveTextContent('1.00s')
    })
})

describe('the note under the tree', () => {
    it('keeps the note on parent durations and adds no count when timing is complete', () => {
        render(<PaneHarness spans={spans} runDurationMs={1000} />)

        expect(
            screen.getByText('Parent durations include their children.'),
        ).toBeInTheDocument()
        expect(
            screen.queryByText(/Timing was captured/),
        ).not.toBeInTheDocument()
    })

    it('says in words how many spans have timing when the server reports a gap', () => {
        render(
            <PaneHarness
                spans={spans}
                runDurationMs={1000}
                timing={partial(4, 6)}
            />,
        )

        expect(
            screen.getByText('Timing was captured for 4 of 6 spans.'),
        ).toBeInTheDocument()
        expect(
            screen.getByText('Parent durations include their children.'),
        ).toBeInTheDocument()
    })

    it('uses the singular for one expected span', () => {
        render(
            <PaneHarness
                spans={spans}
                runDurationMs={1000}
                timing={{ ...partial(0, 1), state: 'not_captured' }}
            />,
        )

        expect(
            screen.getByText('Timing was captured for 0 of 1 span.'),
        ).toBeInTheDocument()
    })
})
