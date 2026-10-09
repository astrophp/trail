import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { tracesLinkFor } from '@/api/traces-link'
import type { AttentionItem } from '@/api/types'
import { AttentionSection } from '@/components/telemetry/attention-section'
import { attentionFixture } from '@/components/telemetry/summary-fixtures'

function draw(
    items: AttentionItem[] | undefined,
    over: Partial<Parameters<typeof AttentionSection>[0]> = {},
) {
    return render(
        <MemoryRouter>
            <AttentionSection
                items={items}
                range="24h"
                linkFor={tracesLinkFor}
                {...over}
            />
        </MemoryRouter>,
    )
}

describe('AttentionSection', () => {
    it('counts the items in its header and links each of them', () => {
        const { container } = draw(attentionFixture)
        const header = container.querySelector<HTMLElement>(
            '[data-slot="panel-header"]',
        )

        expect(
            screen.getByRole('heading', { name: 'Needs attention', level: 2 }),
        ).toBeVisible()
        expect(within(header!).getByText('2')).toBeVisible()
        expect(within(header!).getByText('items')).toBeInTheDocument()
        expect(
            screen.getByRole('link', { name: 'Failed runs' }),
        ).toHaveAttribute('href', '/traces?status=failed')
    })

    it('says nothing needs attention for an empty answer, with no count', () => {
        draw([])

        expect(
            screen.getByText('Nothing needs attention in this range'),
        ).toBeVisible()
        expect(screen.queryByText('items')).not.toBeInTheDocument()
    })

    it('shows the loading state, not the empty one, while there is no answer', () => {
        draw(undefined)

        expect(screen.getByText('Loading')).toBeInTheDocument()
        expect(
            screen.queryByText('Nothing needs attention in this range'),
        ).not.toBeInTheDocument()
    })

    it('does not read "nothing" from the previous view’s empty list', () => {
        draw([], { busy: true })

        expect(
            screen.queryByText('Nothing needs attention in this range'),
        ).not.toBeInTheDocument()
        expect(screen.getByText('Loading')).toBeInTheDocument()
    })

    it('dims the previous view’s items, announces it, and does not count them', () => {
        const { container } = draw(attentionFixture, { busy: true })

        expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
        expect(
            screen.getByText('Loading what needs attention', {
                selector: '[role="status"]',
            }),
        ).toBeInTheDocument()
        expect(screen.queryByText('items')).not.toBeInTheDocument()
    })

    it('says it failed, with the way to try again, and draws nothing else', async () => {
        const onRetry = vi.fn()

        draw(undefined, { failure: { message: 'Down.', onRetry } })

        expect(screen.getByRole('alert')).toHaveTextContent('Down.')

        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        expect(onRetry).toHaveBeenCalledOnce()
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('draws the note above the list', () => {
        draw(attentionFixture, { note: <p>The last refresh failed.</p> })

        expect(screen.getByText('The last refresh failed.')).toBeVisible()
    })
})
