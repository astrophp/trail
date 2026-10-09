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
})
