import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { conversationPath } from '@/lib/conversation-path'
import { appReady, renderApp } from '@/test/render-app'
import { mockTranscript } from '@/test/transcript-api'

beforeEach(() => {
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'csrf-1',
    }
    mockTranscript()
})

afterEach(() => {
    delete window.Trail
})

const trail = () =>
    within(screen.getByRole('navigation', { name: 'breadcrumb' }))

describe('the breadcrumb', () => {
    it('shortens each item with an ellipsis within the room it has, so a long one never runs over its separator', async () => {
        renderApp(conversationPath('support/ada 1042'))
        await appReady()
        await screen.findAllByRole('article', { name: /^Turn / })

        const parent = trail().getByRole('link', { name: 'Conversations' })
        const current = trail().getByText(/^Conversation support/)

        // `truncate` is hidden overflow, one line and an ellipsis; `min-w-0` lets the item shrink to it.
        expect(parent).toHaveClass('truncate', 'block')
        expect(current).toHaveClass('truncate')

        for (const item of [parent, current]) {
            expect(item.closest('[data-slot="breadcrumb-item"]')).toHaveClass(
                'min-w-0',
            )
        }

        expect(trail().getByRole('list').className).toContain('flex-nowrap')
    })

    it('still leads the parent to its page', async () => {
        renderApp(conversationPath('support/ada 1042'))
        await appReady()

        expect(
            trail().getByRole('link', { name: 'Conversations' }),
        ).toHaveAttribute('href', '/trail/conversations')
    })
})
