import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { Timestamp } from '@/components/telemetry/timestamp'
import { BootContext } from '@/hooks/use-boot'
import { parseBoot } from '@/lib/boot'
import { formatClockTime } from '@/lib/format'

const now = new Date('2026-10-07T21:05:22Z')

const inZone = (timezone: string | null, children: ReactNode) => (
    <BootContext.Provider value={parseBoot({ timezone })}>
        {children}
    </BootContext.Provider>
)

describe('Timestamp', () => {
    it('shows how long ago, and the clock time under it', () => {
        render(
            inZone(
                'Asia/Tokyo',
                <Timestamp at="2026-10-07T21:03:22Z" now={now} />,
            ),
        )

        expect(screen.getByText('2m ago')).toBeInTheDocument()
        expect(screen.getByText('06:03:22')).toBeInTheDocument()
    })

    it('puts the day before the clock time when it is not the same day', () => {
        render(inZone('UTC', <Timestamp at="2026-10-05T09:00:00Z" now={now} />))

        expect(screen.getByText('2d ago')).toBeInTheDocument()
        expect(screen.getByText('Oct 5 · 09:00:00')).toBeInTheDocument()
    })

    it('compares the day in the application zone', () => {
        // 21:03 UTC is already the next day in Tokyo, where `now` is on the same day.
        render(
            inZone(
                'Asia/Tokyo',
                <Timestamp at="2026-10-07T21:03:22Z" now={now} />,
            ),
        )

        expect(screen.queryByText(/·/)).not.toBeInTheDocument()
    })

    it('is a time element carrying the instant, with the full date and zone in its title and text', () => {
        const { container } = render(
            inZone(
                'Europe/Istanbul',
                <Timestamp at="2026-10-07T21:03:22Z" now={now} />,
            ),
        )
        const time = container.querySelector('time')!

        expect(time).toHaveAttribute('datetime', '2026-10-07T21:03:22Z')
        expect(time).toHaveAttribute('title', 'Oct 8, 2026, 00:03:22 GMT+3')
        expect(screen.getByText('Oct 8, 2026, 00:03:22 GMT+3')).toHaveClass(
            'sr-only',
        )
    })

    it('uses the zone from the boot object', () => {
        const { container } = render(
            inZone('UTC', <Timestamp at="2026-10-07T21:03:22Z" now={now} />),
        )

        expect(container.querySelector('time')).toHaveAttribute(
            'title',
            'Oct 7, 2026, 21:03:22 GMT',
        )
    })

    it('falls back to the browser zone when the boot object has none', () => {
        render(inZone(null, <Timestamp at="2026-10-07T21:03:22Z" now={now} />))

        expect(
            screen.getByText(
                formatClockTime(new Date('2026-10-07T21:03:22Z'), undefined),
            ),
        ).toBeInTheDocument()
    })

    it('falls back to the browser zone for a zone it does not know', () => {
        render(
            inZone(
                'Not/AZone',
                <Timestamp at="2026-10-07T21:03:22Z" now={now} />,
            ),
        )

        expect(
            screen.getByText(
                formatClockTime(new Date('2026-10-07T21:03:22Z'), undefined),
            ),
        ).toBeInTheDocument()
    })

    it('says just now for a time ahead of now', () => {
        render(<Timestamp at="2026-10-07T21:05:30Z" now={now} />)

        expect(screen.getByText('just now')).toBeInTheDocument()
    })

    it('says Not captured rather than throwing for a date it cannot read', () => {
        render(<Timestamp at="soon" now={now} />)

        expect(screen.getByText('Not captured')).toBeInTheDocument()
    })

    it('shows the day and the clock time on one line, even on the same day, when inline', () => {
        const { container } = render(
            inZone(
                'UTC',
                <Timestamp
                    at="2026-10-07T21:03:22Z"
                    now={now}
                    layout="inline"
                />,
            ),
        )

        expect(screen.getByText('Oct 7 \u00b7 21:03:22')).toBeInTheDocument()
        expect(screen.queryByText('2m ago')).not.toBeInTheDocument()
        expect(container.querySelector('time')).toHaveAttribute(
            'title',
            'Oct 7, 2026, 21:03:22 GMT',
        )
        expect(screen.getByText('Oct 7, 2026, 21:03:22 GMT')).toHaveClass(
            'sr-only',
        )
    })

    it('accepts a className', () => {
        const { container } = render(
            <Timestamp at="2026-10-07T21:03:22Z" now={now} className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
