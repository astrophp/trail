import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MarkdownText } from '@/components/patterns/markdown-text'

const marker = '[redacted]'

describe('MarkdownText', () => {
    it('shows a short text whole, with no button', () => {
        render(<MarkdownText text="**short**" redactionMarker={marker} />)

        expect(screen.getByText('short').tagName).toBe('STRONG')
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('shows the first part and reveals the rest in steps', async () => {
        const user = userEvent.setup()
        const paragraphs = Array.from(
            { length: 30 },
            (_, index) => `Paragraph ${index} ` + 'word '.repeat(10),
        )
        const text = paragraphs.join('\n\n')
        const { container } = render(
            <MarkdownText text={text} redactionMarker={marker} chunk={200} />,
        )

        expect(container.textContent).toContain('Paragraph 0')
        expect(container.textContent).not.toContain('Paragraph 29')

        const button = screen.getByRole('button', { name: /Show more/ })
        const before = container.querySelectorAll('p').length

        await user.click(button)

        expect(container.querySelectorAll('p').length).toBeGreaterThan(before)
        // Every part ends between paragraphs: no paragraph is drawn in two pieces.
        for (const paragraph of container.querySelectorAll('p')) {
            expect(paragraph.textContent).toMatch(
                /^Paragraph \d+ (word ){9}word$/,
            )
        }
    })

    it('says how many characters are left', () => {
        const text = 'a'.repeat(150) + '\n\n' + 'b'.repeat(150)

        render(
            <MarkdownText text={text} redactionMarker={marker} chunk={200} />,
        )

        expect(
            screen.getByRole('button', {
                name: 'Show more (150 characters left)',
            }),
        ).toBeVisible()
    })

    it('keeps a code fence that spans the cut in one piece', () => {
        const fence = '```\n' + 'line\n\n'.repeat(60) + '```'
        const text = 'Intro\n\n' + fence + '\n\nAfter'
        const { container } = render(
            <MarkdownText text={text} redactionMarker={marker} chunk={100} />,
        )
        const blocks = container.querySelectorAll('pre')

        expect(blocks).toHaveLength(1)
        expect(blocks[0].textContent?.match(/line/g)).toHaveLength(60)
        expect(container.textContent).not.toContain('After')
    })

    it('links a reference whose definition is in a later part', () => {
        const text =
            'See [the docs][docs].\n\n' +
            'Filler paragraph. '.repeat(20) +
            '\n\n[docs]: https://example.com/docs'

        render(
            <MarkdownText text={text} redactionMarker={marker} chunk={100} />,
        )

        expect(screen.getByRole('link', { name: 'the docs' })).toHaveAttribute(
            'href',
            'https://example.com/docs',
        )
    })

    it('shows a part nested too deeply as plain text', () => {
        const text = '> '.repeat(2000) + 'deep [redacted]'
        const { container } = render(
            <MarkdownText
                text={text}
                redactionMarker={marker}
                chunk={10_000}
            />,
        )

        expect(container.querySelector('blockquote')).toBeNull()
        expect(
            container.querySelector('[data-slot="markdown-fallback"]'),
        ).toHaveTextContent('deep [redacted]')
        expect(
            container.querySelector('[data-slot="redaction"]'),
        ).not.toBeNull()
    })

    it.each([
        ['emphasis', '*'.repeat(2000) + 'x' + '*'.repeat(2000)],
        ['stars', '*'.repeat(4000)],
        ['brackets', '['.repeat(4000)],
        ['links', '['.repeat(800) + 'x' + '](a)'.repeat(800)],
        ['backticks', '`'.repeat(4000)],
        ['a wide table', '|a'.repeat(1300) + '|\n' + '|-'.repeat(1300) + '|'],
    ])('draws a part of adversarial %s', (_, text) => {
        const { container } = render(
            <MarkdownText text={text} redactionMarker={marker} />,
        )

        expect(container.querySelector('[data-slot="markdown"]')).not.toBeNull()
    })
})
