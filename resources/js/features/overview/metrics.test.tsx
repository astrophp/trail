import { render, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { Cost, Summary } from '@/api/types'
import { MetricStrip } from '@/components/patterns/metric-strip'
import { CostMetric } from '@/features/overview/cost-metric'
import { DurationMetric } from '@/features/overview/duration-metric'
import { ErrorRateMetric } from '@/features/overview/error-rate-metric'
import type { MetricProps } from '@/features/overview/metric-props'
import { TracesMetric } from '@/features/overview/traces-metric'
import { overviewFixture, runs } from '@/test/overview-api'
import type { TimeRangePreset } from '@/lib/time-range'

const current = overviewFixture.data.summary
const earlier = overviewFixture.data.previous as Summary

type Props = Partial<MetricProps>

const props = (over: Props = {}): MetricProps => ({
    summary: current,
    previous: earlier,
    range: '24h',
    ...over,
})

/** Draws one metric and returns its element. */
function draw(
    label: string,
    metric: (props: MetricProps) => ReactElement,
    over: Props = {},
) {
    // Each call has a container of its own, so a test may draw several.
    const { container } = render(
        <MemoryRouter>
            <MetricStrip>{metric(props(over))}</MetricStrip>
        </MemoryRouter>,
    )

    const found = [...container.querySelectorAll('[data-slot="metric"]')].find(
        (element) => element.querySelector('dt')?.textContent === label,
    )

    if (!(found instanceof HTMLElement)) {
        throw new Error(`No metric called ${label}.`)
    }

    return {
        within: within(found),
        /** The figure itself: the first `dd`, before the change and the detail. */
        value: found.querySelector('dd')?.textContent,
        change: found.querySelector('[data-slot="change"]'),
        href: found.querySelector('a')?.getAttribute('href') ?? null,
        text: found.textContent,
    }
}

const traces = (over?: Props) =>
    draw('Traces', (p) => <TracesMetric {...p} />, over)
const errorRate = (over?: Props) =>
    draw('Error rate', (p) => <ErrorRateMetric {...p} />, over)
const p95 = (over?: Props) =>
    draw('p95 duration', (p) => <DurationMetric {...p} />, over)
const average = (over?: Props) =>
    draw('Avg duration', (p) => <DurationMetric {...p} />, over)
const cost = (over?: Props) =>
    draw('Estimated cost', (p) => <CostMetric {...p} />, over)

const withRuns = (counts: Partial<Summary['runs']>): Summary => ({
    ...current,
    runs: runs(counts),
})
const withDuration = (duration: Partial<Summary['duration']>): Summary => ({
    ...current,
    duration: { ...current.duration, ...duration },
})
const withCost = (amount: Cost, unpriced = 0): Summary => ({
    ...current,
    cost: amount,
    cost_coverage: { ...current.cost_coverage, unpriced_runs: unpriced },
})

describe('the Traces metric', () => {
    it('counts the runs of the range', () => {
        expect(traces().value).toBe('32')
        expect(traces({ summary: withRuns({ completed: 9_432 }) }).value).toBe(
            '9,432',
        )
    })

    it('shows a count of 0 as 0', () => {
        expect(traces({ summary: withRuns({}), previous: null }).value).toBe(
            '0',
        )
    })

    it('shows the change against the previous period with its caption', () => {
        const metric = traces({
            summary: withRuns({ completed: 32 }),
            previous: withRuns({ completed: 20 }),
        })

        expect(metric.within.getByText('+60.0%')).toBeInTheDocument()
        expect(
            metric.within.getByText('vs previous 24 hours'),
        ).toBeInTheDocument()
        expect(metric.change).toHaveAttribute('data-tone', 'neutral')
    })

    it('says there is no earlier data when the previous period had no runs', () => {
        const metric = traces({ previous: null })

        expect(metric.change).toBeNull()
        expect(metric.text).toBe('Traces32')
        expect(traces().change).not.toBeNull()
    })

    it.each<[TimeRangePreset, string, string]>([
        ['1h', 'vs previous hour', '/traces?range=1h'],
        ['24h', 'vs previous 24 hours', '/traces'],
        ['7d', 'vs previous 7 days', '/traces?range=7d'],
    ])('for %s says "%s" and links to %s', (range, caption, href) => {
        const metric = traces({ range, previous: withRuns({ completed: 20 }) })

        expect(metric.within.getByText(caption)).toBeInTheDocument()
        expect(metric.href).toBe(href)
    })
})

describe('the Error rate metric', () => {
    it('shows the rate as a percentage with its failed and incomplete runs', () => {
        const metric = errorRate()

        expect(metric.value).toBe('3.6%')
        expect(metric.within.getByText('1 failed')).toBeInTheDocument()
        expect(metric.within.getByText('· 2 incomplete')).toBeInTheDocument()
    })

    it('never adds the failed and the incomplete runs together', () => {
        const metric = errorRate()

        // The whole detail, so a sum glued to another figure cannot hide in it.
        expect(
            metric.within.getByText('1 failed').parentElement?.textContent,
        ).toBe('1 failed · 2 incomplete')
    })

    it('leaves out the incomplete runs when there are none', () => {
        const metric = errorRate({ summary: withRuns({ completed: 3 }) })

        expect(metric.within.getByText('1 failed')).toBeInTheDocument()
        expect(metric.text).not.toMatch(/incomplete/)
    })

    it('says there are no finished runs, and not 0%, when only running ones exist', () => {
        const summary: Summary = {
            ...withRuns({ running: 2 }),
            error_rate: { rate: null, failed: 0, finished: 0 },
        }
        const metric = errorRate({ summary })

        expect(metric.value).toBe('No finished runs')
        expect(metric.text).not.toMatch(/0%|failed/)
        expect(metric.change).toBeNull()
    })

    it('shows 0.0% when runs finished and none failed', () => {
        const summary: Summary = {
            ...withRuns({ completed: 10 }),
            error_rate: { rate: 0, failed: 0, finished: 10 },
        }
        const metric = errorRate({ summary })

        expect(metric.value).toBe('0.0%')
        expect(metric.within.getByText('0 failed')).toBeInTheDocument()
    })

    it('shows the change in percentage points, up being bad', () => {
        const worse = errorRate({
            summary: {
                ...current,
                error_rate: { rate: 0.2, failed: 2, finished: 10 },
            },
            previous: {
                ...earlier,
                error_rate: { rate: 0.1, failed: 1, finished: 10 },
            },
        })

        expect(worse.within.getByText('+10.0 pp')).toBeInTheDocument()
        expect(worse.change).toHaveAttribute('data-tone', 'bad')

        const better = errorRate()

        expect(better.within.getByText('−46.4 pp')).toBeInTheDocument()
        expect(better.change).toHaveAttribute('data-tone', 'good')
    })

    it('says which figure is missing when the previous period has runs but no rate', () => {
        const metric = errorRate({
            previous: {
                ...earlier,
                error_rate: { rate: null, failed: 0, finished: 0 },
            },
        })

        expect(metric.within.getByText('No earlier rate')).toBeInTheDocument()
        expect(errorRate({ previous: null }).change).toBeNull()
    })

    it('links to the failed runs of the range', () => {
        expect(errorRate({ range: '7d' }).href).toBe(
            '/traces?range=7d&status=failed',
        )
        expect(errorRate().href).toBe('/traces?status=failed')
    })
})

describe('the p95 duration metric', () => {
    it('shows the percentile with the average beside it', () => {
        const metric = p95()

        expect(metric.value).toBe('1.90s')
        expect(metric.within.getByText('avg')).toBeInTheDocument()
        expect(metric.within.getByText('981 ms')).toBeInTheDocument()
    })

    it('shows the change in time, up being bad', () => {
        const metric = p95({
            previous: withDuration({ p95_ms: 1_000 }),
        })

        expect(metric.within.getByText('900 ms')).toBeInTheDocument()
        expect(metric.change).toHaveAttribute('data-tone', 'bad')
        expect(
            p95({ previous: withDuration({ p95_ms: 3_000 }) }).change,
        ).toHaveAttribute('data-tone', 'good')
    })

    it('says there is no earlier p95 when the previous period had too few measured runs', () => {
        expect(p95().within.getByText('No earlier p95')).toBeInTheDocument()
        expect(p95({ previous: null }).change).toBeNull()
    })

    it('links to the slow runs of the range', () => {
        expect(p95({ range: '7d' }).href).toBe('/traces?range=7d&slow=1')
        expect(p95().href).toBe('/traces?slow=1')
    })

    describe('with fewer measured runs than a percentile needs', () => {
        const few = withDuration({ p95_ms: null, measured: 5 })

        it('shows the average under its own name, never as a percentile', () => {
            const metric = average({ summary: few })

            expect(metric.value).toBe('981 ms')
            expect(metric.text).not.toMatch(/p95 duration/)
            expect(metric.within.getByText(/p95 needs/)).toHaveTextContent(
                'p95 needs 20 measured runs · 5 so far',
            )
        })

        it('has no link, because the slow filter needs a percentile', () => {
            expect(average({ summary: few }).href).toBeNull()
            expect(p95().href).not.toBeNull()
        })

        it('compares averages', () => {
            const metric = average({
                summary: withDuration({
                    p95_ms: null,
                    measured: 5,
                    average_ms: 400,
                }),
                previous: withDuration({ average_ms: 300 }),
            })

            expect(metric.within.getByText('100 ms')).toBeInTheDocument()
            expect(metric.change).toHaveAttribute('data-tone', 'bad')
        })

        it('with no measured run shows the missing state and no change', () => {
            const metric = average({
                summary: withDuration({
                    p95_ms: null,
                    average_ms: null,
                    measured: 0,
                }),
            })

            expect(metric.value).toBe('No measured runs')
            expect(metric.change).toBeNull()
            expect(metric.within.getByText(/p95 needs/)).toHaveTextContent(
                'p95 needs 20 measured runs · 0 so far',
            )
        })
    })
})

describe('the Estimated cost metric', () => {
    it('shows an estimated amount', () => {
        expect(
            cost({ summary: withCost({ state: 'estimated', amount: 0.0466 }) })
                .value,
        ).toBe('$0.0466')
    })

    it('shows a partial amount as partial', () => {
        const metric = cost({
            summary: withCost({ state: 'partial', amount: 0.0466 }),
        })

        expect(metric.within.getByText('$0.0466')).toBeInTheDocument()
        expect(metric.within.getByText('Partial')).toBeInTheDocument()
    })

    it.each<[Cost, string]>([
        [{ state: 'pending', amount: null }, 'Pending'],
        [{ state: 'unpriced', amount: null }, 'Unpriced'],
        [{ state: 'not_captured', amount: null }, 'Not captured'],
    ])('shows %j in words, with no amount', (state, words) => {
        const metric = cost({ summary: withCost(state) })

        expect(metric.value).toBe(words)
        expect(metric.text).not.toMatch(/\$/)
    })

    it('shows the amount so far of a range with runs still running, tagged So far', () => {
        const metric = cost({
            summary: withCost({ state: 'pending', amount: 0.033452 }),
        })

        expect(metric.within.getByText('$0.0335')).toBeInTheDocument()
        expect(metric.within.getByText(/^So far/)).toBeInTheDocument()
        expect(metric.text).not.toMatch(/Pending/)
    })

    it('counts the unpriced runs, in the singular for one', () => {
        expect(cost().within.getByText('2 unpriced runs')).toBeInTheDocument()
        expect(
            cost({
                summary: withCost({ state: 'partial', amount: 1 }, 1),
            }).within.getByText('1 unpriced run'),
        ).toBeInTheDocument()
    })

    it('says nothing about unpriced runs when there are none', () => {
        const metric = cost({
            summary: withCost({ state: 'estimated', amount: 1 }),
        })

        expect(metric.text).not.toMatch(/unpriced/)
    })

    it('shows the change when both amounts are estimated', () => {
        const metric = cost({
            summary: withCost({ state: 'estimated', amount: 0.06 }),
            previous: withCost({ state: 'estimated', amount: 0.05 }),
        })

        expect(metric.within.getByText('+20.0%')).toBeInTheDocument()
        expect(metric.change).toHaveAttribute('data-tone', 'neutral')
    })

    it('shows the size of the difference when the previous amount was 0', () => {
        const metric = cost({
            summary: withCost({ state: 'estimated', amount: 0.06 }),
            previous: withCost({ state: 'estimated', amount: 0 }),
        })

        expect(
            within(metric.change as HTMLElement).getByText('$0.0600'),
        ).toBeInTheDocument()
        expect(metric.text).not.toMatch(/%/)
    })

    it.each<[string, Cost]>([
        ['pending', { state: 'pending', amount: 0.033452 }],
        ['unpriced', { state: 'unpriced', amount: null }],
        ['not captured', { state: 'not_captured', amount: null }],
    ])('has no change when the cost is %s', (_name, state) => {
        expect(cost({ summary: withCost(state) }).change).toBeNull()
    })

    it.each<[string, Cost, Cost]>([
        [
            'a partial amount before',
            { state: 'estimated', amount: 0.06 },
            { state: 'partial', amount: 0.05 },
        ],
        [
            'a partial amount now',
            { state: 'partial', amount: 0.06 },
            { state: 'estimated', amount: 0.05 },
        ],
        [
            'a pending amount before',
            { state: 'estimated', amount: 0.06 },
            { state: 'pending', amount: 0.05 },
        ],
        [
            'an unpriced cost before',
            { state: 'estimated', amount: 0.06 },
            { state: 'unpriced', amount: null },
        ],
    ])(
        'draws no change, and no missing-data line, with %s',
        (_name, now, before) => {
            const metric = cost({
                summary: withCost(now),
                previous: withCost(before),
            })

            expect(metric.change).toBeNull()
            expect(metric.text).not.toMatch(/%|No earlier|vs previous/)
        },
    )

    it('draws no change when there is no previous period', () => {
        const metric = cost({
            summary: withCost({ state: 'estimated', amount: 0.06 }),
            previous: null,
        })

        expect(metric.change).toBeNull()
    })

    it('links to the runs sorted by cost, most expensive first', () => {
        expect(cost({ range: '7d' }).href).toBe('/traces?range=7d&sort=-cost')
        expect(cost().href).toBe('/traces?sort=-cost')
    })
})
