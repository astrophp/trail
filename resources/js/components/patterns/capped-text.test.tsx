import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CappedText } from '@/components/patterns/capped-text'
import { textChunk } from '@/lib/json'

describe('CappedText', () => {
    it('shows a short text whole, with no button', () => {
        render(<CappedText text="short" redactionMarker="[redacted]" />)

        expect(screen.getByText('short')).toBeVisible()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('shows the first chunk of a long text and reveals more on request', async () => {
        const user = userEvent.setup()
        const text = 'x'.repeat(textChunk) + 'y'.repeat(10)
        const { container } = render(
            <CappedText text={text} redactionMarker="[redacted]" />,
        )

        expect(container.textContent).toContain('x'.repeat(textChunk))
        expect(container.textContent).not.toContain('y')

        await user.click(screen.getByRole('button', { name: /Show more/ }))

        expect(container.textContent).toContain('y'.repeat(10))
    })

    it('does not split a surrogate pair at the cut', () => {
        const text = 'a'.repeat(textChunk - 1) + '\u{1F600}' + 'b'

        const { container } = render(
            <CappedText text={text} redactionMarker="[redacted]" />,
        )

        // The cut falls between the two halves of the emoji, so it moves one character on.
        expect(container.firstElementChild!.firstChild!.textContent).toBe(
            'a'.repeat(textChunk - 1) + '\u{1F600}',
        )
        expect(
            screen.getByRole('button', {
                name: 'Show more (1 characters left)',
            }),
        ).toBeVisible()
    })

    it('does not cut a redaction marker in two', async () => {
        const user = userEvent.setup()
        const marker = '[redacted]'
        // The chunk boundary falls three characters into the marker.
        const text = 'a'.repeat(textChunk - 3) + marker + 'z'.repeat(50)

        const { container } = render(
            <CappedText text={text} redactionMarker={marker} />,
        )

        const marks = container.querySelectorAll('[data-slot="redaction"]')

        expect(marks).toHaveLength(1)
        expect(marks[0]).toHaveTextContent(marker)
        expect(container.textContent).not.toContain('z')
        expect(
            screen.getByRole('button', {
                name: 'Show more (50 characters left)',
            }),
        ).toBeVisible()

        await user.click(screen.getByRole('button', { name: /Show more/ }))

        expect(container.textContent).toContain('z'.repeat(50))
    })

    it('keeps a marker whole when the cut lands just before it or just after it', () => {
        const marker = '[redacted]'
        const before = render(
            <CappedText
                text={'a'.repeat(textChunk) + marker + 'z'}
                redactionMarker={marker}
            />,
        )

        expect(before.container.textContent).not.toContain('[')
        expect(
            before.container.querySelectorAll('[data-slot="redaction"]'),
        ).toHaveLength(0)

        before.unmount()

        const after = render(
            <CappedText
                text={'a'.repeat(textChunk - marker.length) + marker + 'z'}
                redactionMarker={marker}
            />,
        )

        expect(
            after.container.querySelectorAll('[data-slot="redaction"]'),
        ).toHaveLength(1)
        expect(after.container.textContent).not.toContain('z')
    })

    it('takes the size of a step from `chunk`', async () => {
        const user = userEvent.setup()
        const { container } = render(
            <CappedText
                text={'0123456789'.repeat(3)}
                redactionMarker="m"
                chunk={10}
            />,
        )
        const shown = () => container.firstElementChild!.firstChild!.textContent

        expect(shown()).toBe('0123456789')

        await user.click(
            screen.getByRole('button', {
                name: 'Show more (20 characters left)',
            }),
        )

        expect(shown()).toBe('01234567890123456789')
    })

    it('takes a class name', () => {
        const { container } = render(
            <CappedText text="x" redactionMarker="m" className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
