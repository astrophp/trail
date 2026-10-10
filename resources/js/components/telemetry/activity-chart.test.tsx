import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActivityChart } from '@/components/telemetry/activity-chart'
import {
    seriesFixture,
    summaryFixture,
} from '@/components/telemetry/summary-fixtures'

describe('ActivityChart', () => {
    it('holds the place of the chart while there is no series, with the switch in place', () => {
        render(
            <ActivityChart
                series={undefined}
                summary={undefined}
                mode="volume"
                onModeChange={() => {}}
            />,
        )

        expect(
            screen.getByRole('heading', { name: 'Trace activity', level: 2 }),
        ).toBeVisible()
        expect(
            screen.getByRole('radiogroup', { name: 'Chart shows' }),
        ).toBeVisible()
        // The skeleton says it is loading itself; the panel's body is not the previous view's.
        expect(
            document.querySelector('[data-slot="panel-content"][aria-busy]'),
        ).toBeNull()
    })

    it('reports the mode chosen, and dims a series that is the previous view', async () => {
        const onModeChange = vi.fn()

        const { container } = render(
            <ActivityChart
                series={seriesFixture}
                summary={summaryFixture}
                mode="volume"
                onModeChange={onModeChange}
                busy
            />,
        )

        expect(
            container.querySelector(
                '[data-slot="panel-content"][aria-busy="true"]',
            ),
        ).not.toBeNull()
        expect(screen.getByRole('status')).toHaveTextContent(
            'Loading the activity chart',
        )

        await userEvent.click(screen.getByRole('radio', { name: 'Cost' }))

        expect(onModeChange).toHaveBeenCalledWith('cost')
    })

    it('is neither dimmed nor announced when the series is current', () => {
        const { container } = render(
            <ActivityChart
                series={seriesFixture}
                summary={summaryFixture}
                mode="duration"
                onModeChange={() => {}}
            />,
        )

        expect(
            container.querySelector('[data-slot="panel-content"][aria-busy]'),
        ).toBeNull()
        expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    describe('with something beside it', () => {
        const aside = <p>Beside the chart</p>

        it('places it after the chart, in the same panel, in a column of its own', () => {
            const { container } = render(
                <ActivityChart
                    series={seriesFixture}
                    summary={summaryFixture}
                    mode="volume"
                    onModeChange={() => {}}
                    aside={aside}
                />,
            )
            const content = container.querySelector(
                '[data-slot="activity-content"]',
            ) as HTMLElement
            const column = container.querySelector(
                '[data-slot="activity-aside"]',
            ) as HTMLElement
            const chart = screen.getByRole('img', {
                name: /traces started in this range/,
            })

            expect(column).toHaveTextContent('Beside the chart')
            expect(content).toContainElement(column)
            expect(content).toContainElement(chart)
            expect(column).not.toContainElement(chart)
            // Reading and tabbing order: the chart, then what is beside it.
            expect(
                chart.compareDocumentPosition(column) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy()
        })

        it('keeps the place of the chart, and the aside, while there is no series', () => {
            render(
                <ActivityChart
                    series={undefined}
                    summary={undefined}
                    mode="volume"
                    onModeChange={() => {}}
                    aside={aside}
                />,
            )

            expect(screen.getByText('Beside the chart')).toBeVisible()
            expect(
                document.querySelector('[data-slot="panel-loading"]'),
            ).not.toBeNull()
        })

        it('marks only the chart busy when it is the previous view, never what is beside it', () => {
            const { container } = render(
                <ActivityChart
                    series={seriesFixture}
                    summary={summaryFixture}
                    mode="volume"
                    onModeChange={() => {}}
                    aside={aside}
                    busy
                />,
            )
            const busy = container.querySelectorAll('[aria-busy="true"]')
            const status = screen.getByRole('status')

            expect(busy).toHaveLength(1)
            expect(busy[0]).toContainElement(
                screen.getByRole('img', {
                    name: /traces started in this range/,
                }),
            )
            expect(busy[0]).not.toContainElement(
                screen.getByText('Beside the chart'),
            )
            expect(busy[0]).not.toContainElement(status)
            expect(status).toHaveTextContent('Loading the activity chart')
        })

        it('has nothing of it when it is left out', () => {
            const { container } = render(
                <ActivityChart
                    series={seriesFixture}
                    summary={summaryFixture}
                    mode="volume"
                    onModeChange={() => {}}
                />,
            )

            expect(
                container.querySelector('[data-slot="activity-aside"]'),
            ).toBeNull()
            expect(
                container.querySelector('[data-slot="activity-content"]'),
            ).not.toBeNull()
        })
    })
})
