import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PayloadViewer } from '@/components/patterns/payload-viewer'
import { resetTextView } from '@/hooks/use-text-view'

const notifyMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/components/patterns/notify', () => ({ notify: notifyMock }))

const answer = '## Hello\n\n- one\n- **two** [redacted]'

beforeEach(() => {
    localStorage.clear()
    resetTextView()
})

afterEach(() => {
    vi.restoreAllMocks()
})

function setClipboard(value: unknown) {
    Object.defineProperty(navigator, 'clipboard', {
        value,
        configurable: true,
    })
}

describe('PayloadViewer with markdown', () => {
    it.each([
        ['under a heading', { heading: 'Response' }],
        ['as plain text', { plain: true }],
    ])('draws the text as markdown by default %s', (_, extra) => {
        const { container } = render(
            <PayloadViewer
                value={answer}
                label="response"
                format="markdown"
                {...extra}
            />,
        )

        expect(screen.getByRole('radio', { name: 'Rendered' })).toBeChecked()
        expect(screen.getByText('two').tagName).toBe('STRONG')
        expect(
            container.querySelector('[data-slot="redaction"]'),
        ).not.toBeNull()
    })

    it('shows the text exactly as stored in Raw', async () => {
        const user = userEvent.setup()
        const { container } = render(
            <PayloadViewer
                value={answer}
                label="response"
                heading="Response"
                format="markdown"
            />,
        )

        await user.click(screen.getByRole('radio', { name: 'Raw' }))

        const raw = container.querySelector('[data-slot="capped-text"]')!

        expect(raw.textContent).toBe(
            answer.replace(
                '[redacted]',
                '[redacted] (redacted before it was stored)',
            ),
        )
        expect(
            container.querySelector('[data-slot="markdown"]'),
        ).not.toBeVisible()
        expect(localStorage.getItem('trail-text-view')).toBe('raw')
    })

    it('switches from the keyboard', async () => {
        const user = userEvent.setup()

        render(
            <PayloadViewer
                value={answer}
                label="response"
                plain
                format="markdown"
            />,
        )

        await user.tab()
        expect(screen.getByRole('radio', { name: 'Rendered' })).toHaveFocus()

        await user.keyboard('{ArrowRight}')
        expect(screen.getByRole('radio', { name: 'Raw' })).toHaveFocus()

        await user.keyboard(' ')
        expect(screen.getByRole('radio', { name: 'Raw' })).toBeChecked()
    })

    it('keeps what was revealed when switching back', async () => {
        const user = userEvent.setup()
        const long = Array.from(
            { length: 400 },
            (_, index) => `Paragraph ${index} with some words.`,
        ).join('\n\n')

        render(
            <PayloadViewer
                value={long}
                label="response"
                heading="Response"
                format="markdown"
            />,
        )

        await user.click(screen.getByRole('button', { name: /Show more/ }))
        expect(screen.getByText('Paragraph 150 with some words.')).toBeVisible()

        await user.click(screen.getByRole('radio', { name: 'Raw' }))
        await user.click(screen.getByRole('radio', { name: 'Rendered' }))

        expect(screen.getByText('Paragraph 150 with some words.')).toBeVisible()
    })

    it('can leave its switch to the caller', () => {
        render(
            <PayloadViewer
                value={answer}
                label="response"
                plain
                format="markdown"
                viewSwitch={false}
            />,
        )

        expect(screen.queryByRole('radiogroup')).toBeNull()
        expect(screen.getByText('two').tagName).toBe('STRONG')
    })

    it('opens in the view stored before', () => {
        localStorage.setItem('trail-text-view', 'raw')

        const { container } = render(
            <PayloadViewer
                value={answer}
                label="response"
                plain
                format="markdown"
            />,
        )

        expect(
            container.querySelector('[data-slot="capped-text"]'),
        ).not.toBeNull()
    })

    it('copies the stored text in either view', async () => {
        const user = userEvent.setup()
        const writeText = vi.fn().mockResolvedValue(undefined)

        setClipboard({ writeText })
        render(
            <PayloadViewer
                value={answer}
                label="response"
                heading="Response"
                format="markdown"
            />,
        )

        await user.click(screen.getByRole('button', { name: 'Copy response' }))
        expect(writeText).toHaveBeenLastCalledWith(answer)

        await user.click(screen.getByRole('radio', { name: 'Raw' }))
        await user.click(screen.getByRole('button', { name: 'Copy response' }))
        expect(writeText).toHaveBeenLastCalledWith(answer)
    })

    it('leaves a text alone without the format', () => {
        const { container } = render(
            <PayloadViewer value={answer} label="response" plain />,
        )

        expect(screen.queryByRole('radiogroup')).toBeNull()
        expect(container.querySelector('[data-slot="markdown"]')).toBeNull()
    })

    it('leaves a structured value in the tree', () => {
        render(
            <PayloadViewer
                value={{ a: 1 }}
                label="response"
                heading="Response"
                format="markdown"
            />,
        )

        expect(screen.getByRole('radio', { name: 'Tree' })).toBeVisible()
        expect(screen.queryByRole('radio', { name: 'Rendered' })).toBeNull()
    })

    it('says an empty text is empty', () => {
        render(
            <PayloadViewer value="" label="response" plain format="markdown" />,
        )

        expect(screen.getByText('Empty text')).toBeVisible()
        expect(screen.queryByRole('radiogroup')).toBeNull()
    })
})
