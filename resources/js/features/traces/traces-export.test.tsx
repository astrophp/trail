import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { loaded, mockApi, paramsOf } from '@/test/traces-api'

const exportLink = () => screen.getByRole('link', { name: 'Export' })

describe('exporting the view', () => {
    it('is a download link to the export of the view on screen, without its page', async () => {
        mockApi()
        renderApp('/traces?range=7d&sort=-cost&page=2&agent=SupportAssistant')
        await loaded()

        const link = exportLink()
        const href = link.getAttribute('href')

        expect(href).toMatch(/^\/trail\/api\/traces\/export\?/)
        expect(link.tagName).toBe('A')
        expect(link).toHaveAttribute('download')
        expect(link).toHaveAttribute(
            'title',
            'Export this view as CSV (up to 10,000 runs)',
        )
        expect(paramsOf(href ?? '')).toEqual({
            range: '7d',
            sort: '-cost',
            agent: 'SupportAssistant',
        })
    })

    it('carries the slow filter, and drops it when the filter goes', async () => {
        mockApi()
        renderApp('/traces?slow=1')
        await loaded()

        expect(paramsOf(exportLink().getAttribute('href') ?? '')).toEqual({
            range: '24h',
            sort: '-started_at',
            slow: '1',
        })

        await userEvent.click(
            screen.getByRole('button', {
                name: /Remove filter: Slow: 95th percentile and above/,
            }),
        )

        await waitFor(() =>
            expect(paramsOf(exportLink().getAttribute('href') ?? '')).toEqual({
                range: '24h',
                sort: '-started_at',
            }),
        )
    })

    it('carries the issue kind and the flags, and drops one when its chip goes', async () => {
        mockApi()
        renderApp(
            '/traces?issue_kind=rate_limited&child_failed=1&unpriced=1&recovered=1',
        )
        await loaded()

        expect(paramsOf(exportLink().getAttribute('href') ?? '')).toEqual({
            range: '24h',
            sort: '-started_at',
            issue_kind: 'rate_limited',
            child_failed: '1',
            unpriced: '1',
            recovered: '1',
        })

        await userEvent.click(
            screen.getByRole('button', {
                name: 'Remove filter: Unpriced usage',
            }),
        )

        await waitFor(() =>
            expect(
                paramsOf(exportLink().getAttribute('href') ?? ''),
            ).not.toHaveProperty('unpriced'),
        )
    })

    it('follows the filters', async () => {
        mockApi()
        renderApp('/traces')
        await loaded()

        expect(paramsOf(exportLink().getAttribute('href') ?? '')).toEqual({
            range: '24h',
            sort: '-started_at',
        })

        await userEvent.click(screen.getByRole('tab', { name: /Failed/ }))

        await waitFor(() =>
            expect(paramsOf(exportLink().getAttribute('href') ?? '')).toEqual({
                range: '24h',
                sort: '-started_at',
                status: 'failed',
            }),
        )
    })
})
