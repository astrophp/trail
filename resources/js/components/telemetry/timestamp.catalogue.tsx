import { Timestamp } from '@/components/telemetry/timestamp'
import { BootContext } from '@/hooks/use-boot'
import { parseBoot } from '@/lib/boot'
import type { CatalogueEntry } from '@/catalogue/types'

const now = new Date('2026-10-07T12:00:00Z')

const ago = (seconds: number) =>
    new Date(now.getTime() - seconds * 1000).toISOString()

const times: [string, string][] = [
    ['Seconds ago', ago(43)],
    ['Minutes ago', ago(5 * 60)],
    ['Hours ago', ago(3 * 3600)],
    ['Days ago, with the day', ago(2 * 86_400)],
    ['Ahead of now (clock skew)', ago(-5)],
]

export const catalogue: CatalogueEntry = {
    title: 'Timestamp',
    specimens: [
        ...times.map(([name, at]) => ({
            name,
            Component: () => <Timestamp at={at} now={now} />,
        })),
        {
            name: 'On one line',
            Component: () => (
                <Timestamp at={ago(5 * 60)} now={now} layout="inline" />
            ),
        },
        {
            name: 'Only how long ago, the date and time on hover',
            Component: () => (
                <Timestamp at={ago(43)} now={now} layout="relative" />
            ),
        },
        {
            name: 'Full date and time on one line',
            Component: () => (
                <Timestamp at={ago(5 * 60)} now={now} layout="full" />
            ),
        },
        {
            name: 'In the application timezone (Europe/Istanbul)',
            Component: () => (
                <BootContext.Provider
                    value={parseBoot({ timezone: 'Europe/Istanbul' })}
                >
                    <Timestamp at={ago(5 * 60)} now={now} />
                </BootContext.Provider>
            ),
        },
    ],
}
