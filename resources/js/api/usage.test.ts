import { describe, expect, it } from 'vitest'
import { usageExportUrl, usageSpendExportUrl } from '@/api/usage'

describe('usageExportUrl', () => {
    it('is the export of the breakdown for a preset range, its grouping and its sort, with no page', () => {
        expect(
            usageExportUrl({ range: '24h', by: 'model', sort: '-cost' }),
        ).toBe('/trail/api/usage/export?range=24h&by=model&sort=-cost')
        expect(usageExportUrl({ range: '7d', by: 'agent', sort: 'name' })).toBe(
            '/trail/api/usage/export?range=7d&by=agent&sort=name',
        )
        expect(
            usageExportUrl({ range: '1h', by: 'provider', sort: '-tokens' }),
        ).toBe('/trail/api/usage/export?range=1h&by=provider&sort=-tokens')
    })

    it('is the export for an explicit range, by both ends and not by a preset', () => {
        expect(
            usageExportUrl({
                from: '2026-01-01T00:00:00.000Z',
                to: '2026-01-02T00:00:00.000Z',
                by: 'model',
                sort: 'runs',
            }),
        ).toBe(
            '/trail/api/usage/export?from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z&by=model&sort=runs',
        )
    })
})

describe('usageSpendExportUrl', () => {
    it('is the export of the estimated cost series for a preset range', () => {
        expect(usageSpendExportUrl({ range: '24h' })).toBe(
            '/trail/api/usage/spend/export?range=24h',
        )
        expect(usageSpendExportUrl({ range: '1h' })).toBe(
            '/trail/api/usage/spend/export?range=1h',
        )
        expect(usageSpendExportUrl({ range: '7d' })).toBe(
            '/trail/api/usage/spend/export?range=7d',
        )
    })

    it('is the export for an explicit range', () => {
        expect(
            usageSpendExportUrl({
                from: '2026-01-01T00:00:00.000Z',
                to: '2026-01-02T00:00:00.000Z',
            }),
        ).toBe(
            '/trail/api/usage/spend/export?from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z',
        )
    })
})
