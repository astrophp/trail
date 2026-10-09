import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Span } from '@/api/types'
import { TimingBar } from '@/components/telemetry/timing-bar'

type Timing = Pick<Span, 'offset_ms' | 'duration_ms' | 'status'>

const completed: Timing = {
    offset_ms: 100,
    duration_ms: 200,
    status: 'completed',
}

const fill = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-slot="timing-bar-fill"]')

const root = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-slot="timing-bar"]')!

const bad = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
] as const

const expectClean = (container: HTMLElement) => {
    const everything =
        container.innerHTML + (root(container).getAttribute('title') ?? '')

    expect(everything).not.toMatch(/NaN|Infinity/)
}

describe('TimingBar', () => {
    it('draws a captured span at its offset and length', () => {
        const { container } = render(
            <TimingBar span={completed} axisMs={1000} />,
        )

        expect(root(container)).toHaveAttribute('data-state', 'bar')
        expect(fill(container)).toHaveStyle({ left: '10%', width: '20%' })
        expect(
            screen.getByRole('img', { name: 'Starts at +100 ms, took 200 ms' }),
        ).toBeInTheDocument()
        expect(root(container)).toHaveAttribute(
            'title',
            'Starts at +100 ms, took 200 ms',
        )
        expect(fill(container)).toHaveAttribute('aria-hidden', 'true')
    })

    it('starts at the left edge for a zero offset', () => {
        const { container } = render(
            <TimingBar span={{ ...completed, offset_ms: 0 }} axisMs={1000} />,
        )

        expect(fill(container)).toHaveStyle({ left: '0%', width: '20%' })
        expect(
            screen.getByRole('img', { name: /^Starts at \+0 ms/ }),
        ).toBeInTheDocument()
    })

    it('keeps a tiny real duration visible', () => {
        const { container } = render(
            <TimingBar
                span={{
                    offset_ms: 31,
                    duration_ms: 0.0004,
                    status: 'completed',
                }}
                axisMs={10_000}
            />,
        )

        expect(
            screen.getByRole('img', { name: 'Starts at +31 ms, took <1 ms' }),
        ).toBeInTheDocument()
        expect(fill(container)).toHaveClass('min-w-1.5')
        expect(fill(container)!.style.width).not.toBe('')
        expect(fill(container)!.style.width).not.toBe('0%')
    })

    it('keeps a zero duration visible as a real, minimal bar', () => {
        const { container } = render(
            <TimingBar
                span={{ offset_ms: 5, duration_ms: 0, status: 'completed' }}
                axisMs={1000}
            />,
        )

        expect(root(container)).toHaveAttribute('data-state', 'bar')
        expect(fill(container)).toHaveClass('min-w-1.5')
    })

    it('draws only the part of a span inside the axis when it starts before it, and states the real start', () => {
        const { container } = render(
            <TimingBar
                span={{ offset_ms: -12, duration_ms: 100, status: 'completed' }}
                axisMs={1000}
            />,
        )

        expect(fill(container)).toHaveStyle({ left: '0%', width: '8.8%' })
        expect(
            screen.getByRole('img', {
                name: 'Starts at −12 ms, took 100 ms',
            }),
        ).toBeInTheDocument()
    })

    it('never draws past the right edge', () => {
        const { container } = render(
            <TimingBar
                span={{ offset_ms: 900, duration_ms: 500, status: 'completed' }}
                axisMs={1000}
            />,
        )

        expect(fill(container)).toHaveStyle({ left: '90%', width: '10%' })
        expect(root(container)).toHaveClass('overflow-hidden')
        expect(
            screen.getByRole('img', { name: /took 500 ms/ }),
        ).toBeInTheDocument()
    })

    it('holds a span that starts beyond the axis to its right edge', () => {
        const { container } = render(
            <TimingBar
                span={{
                    offset_ms: 5_000,
                    duration_ms: 100,
                    status: 'completed',
                }}
                axisMs={1000}
            />,
        )

        expect(
            screen.getByRole('img', { name: 'Starts at +5.00s, took 100 ms' }),
        ).toBeInTheDocument()
        expect(root(container)).toHaveClass('overflow-hidden')
        expect(fill(container)).toHaveStyle({ right: '0px' })
        expect(fill(container)!.style.left).toBe('')
        expect(fill(container)).toHaveClass('min-w-1.5')
    })

    it('shows the words and no bar when the duration was not captured', () => {
        const { container } = render(
            <TimingBar
                span={{ offset_ms: 5, duration_ms: null, status: 'completed' }}
                axisMs={1000}
            />,
        )

        expect(screen.getByText('Not captured')).toBeInTheDocument()
        expect(screen.getByText(/starts at \+5\.0 ms/)).toBeInTheDocument()
        expect(root(container)).toHaveAttribute('data-state', 'none')
        expect(fill(container)).toBeNull()
    })

    it.each([null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
        "states the span's own timing without a bar when the axis is %s",
        (axisMs) => {
            const { container } = render(
                <TimingBar
                    span={{ ...completed, duration_ms: 400, offset_ms: 200 }}
                    axisMs={axisMs}
                />,
            )

            expect(screen.getByText('400 ms')).toBeInTheDocument()
            expect(
                screen.getByText('Starts at +200 ms, took 400 ms'),
            ).toBeInTheDocument()
            expect(screen.queryByText('Not captured')).toBeNull()
            expect(root(container)).toHaveAttribute('data-state', 'none')
            expect(fill(container)).toBeNull()
            expectClean(container)
        },
    )

    it.each(bad)(
        'treats a %s duration as not captured',
        (_name, duration_ms) => {
            const { container } = render(
                <TimingBar
                    span={{ ...completed, duration_ms }}
                    axisMs={1000}
                />,
            )

            expect(screen.getByText('Not captured')).toBeInTheDocument()
            expect(fill(container)).toBeNull()
            expectClean(container)
        },
    )

    it('treats a negative duration as not captured', () => {
        const { container } = render(
            <TimingBar
                span={{ ...completed, duration_ms: -3 }}
                axisMs={1000}
            />,
        )

        expect(screen.getByText('Not captured')).toBeInTheDocument()
        expect(fill(container)).toBeNull()
        expectClean(container)
    })

    it.each(bad)(
        'draws no bar and makes no start claim for a %s offset',
        (_name, offset_ms) => {
            const { container } = render(
                <TimingBar span={{ ...completed, offset_ms }} axisMs={1000} />,
            )

            expect(screen.getByText('200 ms')).toBeInTheDocument()
            expect(screen.getByText('Took 200 ms')).toBeInTheDocument()
            expect(container.textContent).not.toMatch(/Starts at/)
            expect(root(container)).toHaveAttribute('data-state', 'none')
            expect(fill(container)).toBeNull()
            expectClean(container)
        },
    )

    it('says Not captured, with no start claim, for a non-finite offset and no duration', () => {
        const { container } = render(
            <TimingBar
                span={{
                    offset_ms: Number.NaN,
                    duration_ms: null,
                    status: 'completed',
                }}
                axisMs={1000}
            />,
        )

        expect(screen.getByText('Not captured')).toBeInTheDocument()
        expect(container.textContent).not.toMatch(/starts at/i)
        expectClean(container)
    })

    it('draws a running span open-ended from its offset to the end of the axis', () => {
        const { container } = render(
            <TimingBar
                span={{ offset_ms: 250, duration_ms: null, status: 'running' }}
                axisMs={1000}
            />,
        )

        expect(root(container)).toHaveAttribute('data-state', 'open')
        expect(fill(container)).toHaveStyle({ left: '25%', right: '0px' })
        expect(fill(container)!.style.width).toBe('')
        expect(
            screen.getByRole('img', {
                name: 'Starts at +250 ms, still running',
            }),
        ).toBeInTheDocument()
    })

    it('draws a running span on the same full-width track as a finished one, with no words in the lane', () => {
        const { container: done } = render(
            <TimingBar span={completed} axisMs={1000} />,
        )
        const { container: live } = render(
            <TimingBar
                span={{ offset_ms: 100, duration_ms: null, status: 'running' }}
                axisMs={1000}
            />,
        )

        expect(root(live).tagName).toBe(root(done).tagName)
        expect(root(live)).toHaveClass(
            'relative',
            'block',
            'h-2',
            'w-full',
            'overflow-hidden',
        )
        expect(root(live)).not.toHaveClass('flex')
        expect(root(live).children).toHaveLength(1)
        expect(root(live).children[0]).toBe(fill(live))
        expect(live.textContent).toBe('')
        expect(screen.queryByText('In progress')).toBeNull()
    })

    it('starts a running bar exactly where a finished bar with the same offset starts', () => {
        for (const offset_ms of [0, 100, 333.3, 949]) {
            const { container: done, unmount: unmountDone } = render(
                <TimingBar
                    span={{ offset_ms, duration_ms: 50, status: 'completed' }}
                    axisMs={1000}
                />,
            )
            const { container: live, unmount: unmountLive } = render(
                <TimingBar
                    span={{ offset_ms, duration_ms: null, status: 'running' }}
                    axisMs={1000}
                />,
            )

            expect(fill(done)!.style.left).not.toBe('')
            expect(fill(live)!.style.left).toBe(fill(done)!.style.left)
            unmountDone()
            unmountLive()
        }
    })

    it('ignores a duration held by a running span', () => {
        const { container } = render(
            <TimingBar
                span={{ offset_ms: 0, duration_ms: 40, status: 'running' }}
                axisMs={1000}
            />,
        )

        expect(fill(container)!.style.width).toBe('')
        expect(container.innerHTML).not.toContain('40 ms')
        expect(
            screen.getByRole('img', { name: 'Starts at +0 ms, still running' }),
        ).toBeInTheDocument()
    })

    it('names a running span without an offset "Still running", and draws no bar', () => {
        const { container } = render(
            <TimingBar
                span={{
                    offset_ms: Number.NaN,
                    duration_ms: null,
                    status: 'running',
                }}
                axisMs={1000}
            />,
        )

        expect(root(container)).toHaveAttribute('title', 'Still running')
        expect(root(container)).toHaveAttribute('data-state', 'none')
        expect(fill(container)).toBeNull()
    })

    it.each([null, 0, Number.NaN])(
        'shows only the words for a running span when the axis is %s',
        (axisMs) => {
            const { container } = render(
                <TimingBar
                    span={{
                        offset_ms: 250,
                        duration_ms: null,
                        status: 'running',
                    }}
                    axisMs={axisMs}
                />,
            )

            expect(screen.getByText('In progress')).toBeInTheDocument()
            expect(root(container)).toHaveAttribute('data-state', 'none')
            expect(fill(container)).toBeNull()
            expectClean(container)
        },
    )

    it('shows only the words for a running span with a non-finite offset', () => {
        const { container } = render(
            <TimingBar
                span={{
                    offset_ms: Number.NaN,
                    duration_ms: null,
                    status: 'running',
                }}
                axisMs={1000}
            />,
        )

        expect(screen.getByText('In progress')).toBeInTheDocument()
        expect(root(container)).toHaveAttribute('data-state', 'none')
        expect(fill(container)).toBeNull()
        expectClean(container)
    })

    it('stripes only a running bar, and slides the stripes only when motion is welcome', () => {
        const { container } = render(
            <TimingBar
                span={{ offset_ms: 0, duration_ms: null, status: 'running' }}
                axisMs={1000}
            />,
        )

        expect(fill(container)).toHaveClass(
            'bg-stripes-info',
            'motion-safe:animate-stripes',
        )
        expect(fill(container)).not.toHaveClass('animate-stripes')
        expect(fill(container)!.className).not.toMatch(
            /animate-pulse|bg-linear/,
        )
    })

    it.each([
        'completed',
        'failed',
        'incomplete',
        'awaiting_approval',
    ] as const)('does not stripe a %s bar', (status) => {
        const { container } = render(
            <TimingBar
                span={{ offset_ms: 0, duration_ms: 10, status }}
                axisMs={100}
            />,
        )

        expect(fill(container)).not.toBeNull()
        expect(fill(container)!.className).not.toMatch(/stripes/)
    })

    it('says a failed span failed, and draws it differently', () => {
        const { container } = render(
            <TimingBar
                span={{ ...completed, status: 'failed' }}
                axisMs={1000}
            />,
        )

        expect(
            screen.getByRole('img', {
                name: 'Starts at +100 ms, failed after 200 ms',
            }),
        ).toBeInTheDocument()
        expect(fill(container)).toHaveClass('bg-destructive', 'border-r-2')
    })

    it('says an incomplete span is incomplete, and draws it dashed', () => {
        const { container } = render(
            <TimingBar
                span={{ ...completed, status: 'incomplete' }}
                axisMs={1000}
            />,
        )

        expect(
            screen.getByRole('img', {
                name: 'Starts at +100 ms, incomplete after 200 ms',
            }),
        ).toBeInTheDocument()
        expect(fill(container)).toHaveClass('border-dashed')
    })

    it('says a span awaiting approval is awaiting approval, and draws it outlined', () => {
        const { container } = render(
            <TimingBar
                span={{ ...completed, status: 'awaiting_approval' }}
                axisMs={1000}
            />,
        )

        expect(
            screen.getByRole('img', {
                name: 'Starts at +100 ms, awaiting approval after 200 ms',
            }),
        ).toBeInTheDocument()
        expect(fill(container)).toHaveClass('border-primary-ink')
    })

    it('gives every status its own drawing', () => {
        const statuses = [
            'completed',
            'failed',
            'incomplete',
            'awaiting_approval',
            'running',
        ] as const
        const classes = statuses.map((status) => {
            const { container, unmount } = render(
                <TimingBar
                    span={{ offset_ms: 0, duration_ms: 10, status }}
                    axisMs={100}
                />,
            )
            const value = fill(container)!.className

            unmount()

            return value
        })

        expect(new Set(classes).size).toBe(statuses.length)
    })

    it('accepts a className in every state', () => {
        const { container, rerender } = render(
            <TimingBar span={completed} axisMs={1000} className="extra" />,
        )

        expect(root(container)).toHaveClass('extra')

        rerender(
            <TimingBar
                span={{ ...completed, duration_ms: null }}
                axisMs={1000}
                className="extra"
            />,
        )

        expect(screen.getByText('Not captured')).toBeInTheDocument()
        expect(root(container)).toHaveClass('extra')
    })

    it('puts an id on its root in every state, for a row to describe itself by', () => {
        const running: Timing = { ...completed, status: 'running' }
        const states: [Timing, number | null][] = [
            [completed, 1000],
            [running, 1000],
            [running, null],
            [{ ...completed, duration_ms: null }, 1000],
            [completed, null],
        ]

        for (const [span, axisMs] of states) {
            const { container, unmount } = render(
                <TimingBar span={span} axisMs={axisMs} id="bar" />,
            )

            expect(root(container)).toHaveAttribute('id', 'bar')
            unmount()
        }
    })

    it('keeps an open bar visible, held to the right edge with a minimum width, near the end of the axis', () => {
        for (const offset_ms of [950, 960, 1000, 5000]) {
            const { container, unmount } = render(
                <TimingBar
                    span={{ offset_ms, duration_ms: null, status: 'running' }}
                    axisMs={1000}
                />,
            )

            expect(root(container)).toHaveAttribute('data-state', 'open')
            expect(fill(container)).toHaveClass(
                'min-w-1.5',
                'bg-stripes-info',
                'rounded-l-sm',
            )
            expect(fill(container)!.className).not.toMatch(/rounded-(sm|full)/)
            expect(fill(container)).toHaveStyle({ right: '0px' })
            expect(fill(container)!.style.left).toBe('')
            unmount()
        }
    })

    it('shows a span that ends before the axis starts as a minimum-width mark, not a long bar', () => {
        const { container } = render(
            <TimingBar
                span={{
                    offset_ms: -500,
                    duration_ms: 100,
                    status: 'completed',
                }}
                axisMs={1000}
            />,
        )

        expect(fill(container)).toHaveStyle({ left: '0%', width: '0%' })
        expect(fill(container)).toHaveClass('min-w-1.5')
        expect(
            screen.getByRole('img', { name: 'Starts at −500 ms, took 100 ms' }),
        ).toBeInTheDocument()
    })
})
