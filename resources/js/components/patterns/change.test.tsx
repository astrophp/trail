import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Change } from '@/components/patterns/change'

const minus = '−'

function slot(container: HTMLElement) {
    return container.querySelector('[data-slot="change"]')
}

function figure(container: HTMLElement) {
    return container.querySelector('svg')?.parentElement
}

describe('Change', () => {
    it('shows a rise as a signed percentage of the previous value, with the direction in words', () => {
        const { container } = render(
            <Change
                mode="relative"
                polarity="up-is-good"
                current={1126}
                previous={1000}
            />,
        )

        expect(screen.getByText('+12.6%')).toHaveAttribute(
            'aria-hidden',
            'true',
        )
        expect(screen.getByText('up 12.6%')).toHaveClass('sr-only')
        expect(slot(container)).toHaveAttribute('data-direction', 'up')
    })

    it('shows a fall with a real minus sign, never a hyphen', () => {
        const { container } = render(
            <Change
                mode="relative"
                polarity="up-is-good"
                current={985}
                previous={1000}
            />,
        )

        expect(screen.getByText(`${minus}1.5%`)).toBeInTheDocument()
        expect(screen.getByText('down 1.5%')).toHaveClass('sr-only')
        expect(slot(container)).toHaveAttribute('data-direction', 'down')
        expect(slot(container)?.textContent).not.toContain('-')
    })

    it('draws an arrow that is hidden from assistive technology', () => {
        const { container } = render(
            <Change
                mode="relative"
                polarity="up-is-good"
                current={1126}
                previous={1000}
            />,
        )

        const icons = container.querySelectorAll('svg')

        expect(icons).toHaveLength(1)
        expect(icons[0]).toHaveAttribute('aria-hidden', 'true')
    })

    it('says "No change" for equal values, with no arrow and a neutral tone', () => {
        const { container } = render(
            <Change
                mode="relative"
                polarity="up-is-bad"
                current={40}
                previous={40}
            />,
        )

        expect(slot(container)?.textContent).toBe('No change')
        expect(container.querySelector('svg')).toBeNull()
        expect(slot(container)).toHaveAttribute('data-tone', 'neutral')
        expect(slot(container)).not.toHaveAttribute('data-direction')
    })

    it('says there is no earlier data, with no arrow and no number, when the previous value is missing', () => {
        const { container, rerender } = render(
            <Change
                mode="relative"
                polarity="up-is-good"
                current={40}
                previous={null}
            />,
        )

        expect(slot(container)?.textContent).toBe('No earlier data')
        expect(container.querySelector('svg')).toBeNull()

        rerender(
            <Change
                mode="relative"
                polarity="up-is-good"
                current={40}
                previous={null}
                noPreviousLabel="First period"
            />,
        )

        expect(slot(container)?.textContent).toBe('First period')
    })

    it('says "from 0" with the direction when the previous value is zero, never a percentage or "No earlier data"', () => {
        const { container } = render(
            <Change
                mode="relative"
                polarity="up-is-bad"
                current={3}
                previous={0}
            />,
        )

        expect(slot(container)).toHaveAttribute('data-direction', 'up')
        expect(slot(container)).toHaveAttribute('data-tone', 'bad')
        expect(container.querySelectorAll('svg')).toHaveLength(1)
        expect(screen.getByText('up')).toHaveClass('sr-only')
        expect(slot(container)?.textContent).toBe('up from 0')
        expect(container.textContent).not.toMatch(/Infinity|NaN|%|earlier/)
    })

    it('says "down from 0" for a fall from zero', () => {
        const { container } = render(
            <Change
                mode="relative"
                polarity="up-is-bad"
                current={-3}
                previous={0}
            />,
        )

        expect(slot(container)?.textContent).toBe('down from 0')
        expect(slot(container)).toHaveAttribute('data-tone', 'good')
    })

    it('keeps its "no earlier data" words for a previous value that is null, in every mode', () => {
        const draw = () => 'x'

        for (const props of [
            { mode: 'relative' },
            { mode: 'points' },
            { mode: 'absolute', renderDifference: draw },
        ] as const) {
            const { container, unmount } = render(
                <Change
                    {...props}
                    polarity="neutral"
                    current={3}
                    previous={null}
                />,
            )

            expect(slot(container)?.textContent).toBe('No earlier data')
            expect(container.querySelector('svg')).toBeNull()
            unmount()
        }
    })

    it('draws the difference itself when the previous value is zero and it is given a way to', () => {
        const renderDifference = vi.fn((size: number) => `${size} more`)
        const { container } = render(
            <Change
                mode="relative"
                polarity="up-is-bad"
                current={3}
                previous={0}
                renderDifference={renderDifference}
            />,
        )

        expect(renderDifference).toHaveBeenCalledWith(3)
        expect(slot(container)?.textContent).toBe('up +3 more')
        expect(container.textContent).not.toMatch(/%/)
        expect(slot(container)).toHaveAttribute('data-direction', 'up')
    })

    it('uses the percentage, not renderDifference, when the previous value is not zero', () => {
        const renderDifference = vi.fn(() => 'drawn')

        render(
            <Change
                mode="relative"
                polarity="up-is-bad"
                current={1126}
                previous={1000}
                renderDifference={renderDifference}
            />,
        )

        expect(renderDifference).not.toHaveBeenCalled()
        expect(screen.getByText('+12.6%')).toBeInTheDocument()
    })

    it('says "No change" when both values are zero', () => {
        const { container } = render(
            <Change
                mode="relative"
                polarity="up-is-bad"
                current={0}
                previous={0}
                renderDifference={(size) => `${size} more`}
            />,
        )

        expect(slot(container)?.textContent).toBe('No change')
    })

    it('draws nothing at all without a current value, and something with one', () => {
        const { container, rerender } = render(
            <Change
                mode="relative"
                polarity="up-is-good"
                current={5}
                previous={4}
                caption="vs previous 24h"
            />,
        )

        expect(slot(container)).not.toBeNull()

        rerender(
            <Change
                mode="relative"
                polarity="up-is-good"
                current={null}
                previous={4}
                caption="vs previous 24h"
            />,
        )

        expect(container).toBeEmptyDOMElement()
    })

    it.each([
        ['a rise', 1000.0001, 'up', '+'],
        ['a fall', 999.9999, 'down', minus],
    ])(
        'shows %s too small to display as "<0.1%%", never as 0.0%%',
        (_name, current, direction) => {
            const { container } = render(
                <Change
                    mode="relative"
                    polarity="up-is-good"
                    current={current}
                    previous={1000}
                />,
            )

            expect(screen.getByText('<0.1%')).toBeInTheDocument()
            expect(
                screen.getByText(`${direction} by less than 0.1%`),
            ).toHaveClass('sr-only')
            expect(slot(container)).toHaveAttribute('data-direction', direction)
            expect(container.textContent).not.toContain('0.0')
        },
    )

    it('shows a difference that does round to 0.1 as a figure', () => {
        render(
            <Change
                mode="relative"
                polarity="up-is-good"
                current={1000.6}
                previous={1000}
            />,
        )

        expect(screen.getByText('+0.1%')).toBeInTheDocument()
        expect(screen.queryByText('<0.1%')).not.toBeInTheDocument()
    })

    it.each([
        ['up-is-good', 1126, 'good', 'text-success'],
        ['up-is-good', 900, 'bad', 'text-destructive'],
        ['up-is-bad', 1126, 'bad', 'text-destructive'],
        ['up-is-bad', 900, 'good', 'text-success'],
        ['neutral', 1126, 'neutral', 'text-muted-foreground'],
        ['neutral', 900, 'neutral', 'text-muted-foreground'],
    ] as const)(
        'with %s and a current value of %s the tone is %s',
        (polarity, current, tone, className) => {
            const { container } = render(
                <Change
                    mode="relative"
                    polarity={polarity}
                    current={current}
                    previous={1000}
                />,
            )

            expect(slot(container)).toHaveAttribute('data-tone', tone)
            expect(figure(container)).toHaveClass(className)
        },
    )

    it('shows percentage points for values that are fractions', () => {
        const { container } = render(
            <Change
                mode="points"
                polarity="up-is-bad"
                current={0.021}
                previous={0.036}
            />,
        )

        expect(screen.getByText(`${minus}1.5 pp`)).toBeInTheDocument()
        expect(screen.getByText('down 1.5 percentage points')).toHaveClass(
            'sr-only',
        )
        expect(slot(container)).toHaveAttribute('data-tone', 'good')
    })

    it('shows a rise in percentage points even when the previous share was zero', () => {
        render(
            <Change
                mode="points"
                polarity="up-is-bad"
                current={0.25}
                previous={0}
            />,
        )

        expect(screen.getByText('+25.0 pp')).toBeInTheDocument()
    })

    it('shows the difference as the caller draws it in absolute mode, with the sign and direction around it', () => {
        const renderDifference = vi.fn((size: number) => `$${size.toFixed(2)}`)
        const { container, rerender } = render(
            <Change
                mode="absolute"
                polarity="up-is-bad"
                current={12.4}
                previous={9.1}
                renderDifference={renderDifference}
            />,
        )

        expect(renderDifference).toHaveBeenLastCalledWith(
            expect.closeTo(3.3, 10),
        )
        expect(slot(container)?.textContent).toBe('up +$3.30')

        rerender(
            <Change
                mode="absolute"
                polarity="up-is-bad"
                current={9.1}
                previous={12.4}
                renderDifference={renderDifference}
            />,
        )

        // The caller is given the size, never a negative number.
        expect(renderDifference).toHaveBeenLastCalledWith(
            expect.closeTo(3.3, 10),
        )
        expect(slot(container)?.textContent).toBe(`down ${minus}$3.30`)
        expect(slot(container)).toHaveAttribute('data-tone', 'good')
    })

    it('says "No change" in absolute mode for equal values, without calling the renderer', () => {
        const renderDifference = vi.fn(() => 'drawn')
        const { container } = render(
            <Change
                mode="absolute"
                polarity="up-is-bad"
                current={9}
                previous={9}
                renderDifference={renderDifference}
            />,
        )

        expect(slot(container)?.textContent).toBe('No change')
        expect(renderDifference).not.toHaveBeenCalled()
    })

    it('shows the caption after a figure, after "No change", and not otherwise', () => {
        const { container, rerender } = render(
            <Change
                mode="relative"
                polarity="up-is-good"
                current={1126}
                previous={1000}
                caption="vs previous 24h"
            />,
        )

        expect(screen.getByText('vs previous 24h')).toHaveClass(
            'text-muted-foreground',
        )

        rerender(
            <Change
                mode="relative"
                polarity="up-is-good"
                current={1000}
                previous={1000}
                caption="vs previous 24h"
            />,
        )

        expect(screen.getByText('vs previous 24h')).toBeInTheDocument()

        rerender(
            <Change
                mode="relative"
                polarity="up-is-good"
                current={1000}
                previous={null}
                caption="vs previous 24h"
            />,
        )

        expect(slot(container)?.textContent).toBe('No earlier data')
    })

    it('does not break on negative values', () => {
        render(
            <Change
                mode="relative"
                polarity="neutral"
                current={-5}
                previous={-10}
            />,
        )

        expect(screen.getByText('+50.0%')).toBeInTheDocument()
    })

    it.each([NaN, Infinity])(
        'treats %s as a value that is not there',
        (value) => {
            const { container, rerender } = render(
                <Change
                    mode="relative"
                    polarity="neutral"
                    current={value}
                    previous={4}
                />,
            )

            expect(container).toBeEmptyDOMElement()

            rerender(
                <Change
                    mode="relative"
                    polarity="neutral"
                    current={4}
                    previous={value}
                />,
            )

            expect(slot(container)?.textContent).toBe('No earlier data')
        },
    )

    it('takes a class name', () => {
        const { container } = render(
            <Change
                mode="relative"
                polarity="neutral"
                current={2}
                previous={1}
                className="extra"
            />,
        )

        expect(slot(container)).toHaveClass('extra')
    })

    it.each([
        ['relative', undefined],
        ['absolute', (size: number) => `${size}`],
    ] as const)(
        'reads 0.3 against 0.1 + 0.2 as no change in %s mode',
        (mode, renderDifference) => {
            const draw = vi.fn(renderDifference)
            const { container } = render(
                <Change
                    {...({ mode, renderDifference: draw } as {
                        mode: 'relative'
                    })}
                    polarity="neutral"
                    current={0.3}
                    previous={0.1 + 0.2}
                />,
            )

            expect(slot(container)?.textContent).toBe('No change')
            expect(draw).not.toHaveBeenCalled()
        },
    )

    it('still reads a pair just outside the rounding tolerance as a change', () => {
        const draw = vi.fn((size: number) => `${size}`)
        const { container } = render(
            <Change
                mode="absolute"
                polarity="neutral"
                current={1 + 1e-11}
                previous={1}
                renderDifference={draw}
            />,
        )

        expect(slot(container)).toHaveAttribute('data-direction', 'up')
        expect(draw).toHaveBeenCalledTimes(1)

        const { container: other } = render(
            <Change
                mode="relative"
                polarity="neutral"
                current={1 + 1e-11}
                previous={1}
            />,
        )

        expect(slot(other)?.textContent).toContain('<0.1%')
    })

    it.each([
        ['0', '-0'],
        ['-0', '0'],
    ])('reads %s against %s as no change', (a, b) => {
        const { container } = render(
            <Change
                mode="relative"
                polarity="neutral"
                current={Number(a)}
                previous={Number(b)}
            />,
        )

        expect(slot(container)?.textContent).toBe('No change')
    })

    it.each([
        ['up', 500, 2, '>999%', 'up by more than 999%'],
        ['down', -5000, 2, '>999%', 'down by more than 999%'],
        ['up', 2, 5e-324, '>999%', 'up by more than 999%'],
    ])(
        'shows a ratio beyond 999.9 percent as ">999%%": %s %s from %s',
        (direction, current, previous, visible, spoken) => {
            const { container } = render(
                <Change
                    mode="relative"
                    polarity="neutral"
                    current={current}
                    previous={previous}
                />,
            )

            expect(screen.getByText(visible)).toHaveAttribute(
                'aria-hidden',
                'true',
            )
            expect(screen.getByText(spoken)).toHaveClass('sr-only')
            expect(slot(container)).toHaveAttribute('data-direction', direction)
            expect(container.textContent).not.toMatch(/∞|Infinity|NaN|\d{4}/)
        },
    )

    it('still shows 999.8 percent as a figure', () => {
        render(
            <Change
                mode="relative"
                polarity="neutral"
                current={1099.8}
                previous={100}
            />,
        )

        expect(screen.getByText('+999.8%')).toBeInTheDocument()
        expect(screen.queryByText('>999%')).not.toBeInTheDocument()
    })

    it('shows a tiny difference in points as "<0.1 pp"', () => {
        render(
            <Change
                mode="points"
                polarity="neutral"
                current={0.5004}
                previous={0.5}
            />,
        )

        expect(screen.getByText('<0.1 pp')).toBeInTheDocument()
        expect(
            screen.getByText('up by less than 0.1 percentage points'),
        ).toHaveClass('sr-only')
    })

    it('rounds at the boundary: 0.05 percent is "+0.1%", 0.049 percent is "<0.1%"', () => {
        const { unmount } = render(
            <Change
                mode="relative"
                polarity="neutral"
                current={10005}
                previous={10000}
            />,
        )

        expect(screen.getByText('+0.1%')).toBeInTheDocument()
        unmount()

        render(
            <Change
                mode="relative"
                polarity="neutral"
                current={100049}
                previous={100000}
            />,
        )

        expect(screen.getByText('<0.1%')).toBeInTheDocument()
        expect(screen.queryByText('+0.1%')).not.toBeInTheDocument()
    })

    it('formats numbers in a fixed locale, whatever the browser language is', async () => {
        vi.resetModules()
        const spy = vi.spyOn(Intl, 'NumberFormat')

        await import('@/components/patterns/change')

        expect(spy).toHaveBeenCalledWith('en-US', expect.anything())
        spy.mockRestore()
    })
})
