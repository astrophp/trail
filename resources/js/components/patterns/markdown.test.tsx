import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from '@/components/patterns/markdown'

const marker = '[redacted]'

function show(text: string) {
    return render(<Markdown text={text} redactionMarker={marker} />).container
}

describe('Markdown', () => {
    it('sets headings below the heading the answer sits under', () => {
        show('# Title\n\n### Smaller\n\n###### Deepest\n\nBody')

        expect(
            screen.getByRole('heading', { name: 'Title', level: 3 }),
        ).toBeVisible()
        expect(
            screen.getByRole('heading', { name: 'Smaller', level: 5 }),
        ).toBeVisible()
        expect(
            screen.getByRole('heading', { name: 'Deepest', level: 6 }),
        ).toBeVisible()
    })

    it('starts the headings at the level it is given', () => {
        render(
            <Markdown
                text="# Title"
                redactionMarker={marker}
                headingLevel={4}
            />,
        )

        expect(
            screen.getByRole('heading', { name: 'Title', level: 4 }),
        ).toBeVisible()
    })

    it('draws lists, emphasis and strikethrough', () => {
        const container = show('- one\n- **two**\n\n1. first\n2. ~~second~~')

        expect(container.querySelectorAll('ul > li')).toHaveLength(2)
        expect(container.querySelectorAll('ol > li')).toHaveLength(2)
        expect(screen.getByText('two').tagName).toBe('STRONG')
        expect(screen.getByText('second').tagName).toBe('DEL')
    })

    it('draws a task list with marks that cannot be changed', () => {
        const container = show('- [x] done\n- [ ] open')

        expect(screen.queryByRole('checkbox')).toBeNull()
        expect(
            container.querySelectorAll('[data-slot="markdown-task"]'),
        ).toHaveLength(2)
        expect(container.querySelectorAll('li')[0]).toHaveTextContent(
            'Done: done',
        )
        expect(container.querySelectorAll('li')[1]).toHaveTextContent(
            'Not done: open',
        )
    })

    it('draws a table with the table primitives', () => {
        const container = show('| a | b |\n| :-- | --: |\n| 1 | 2 |')

        expect(container.querySelector('[data-slot="table"]')).not.toBeNull()
        expect(screen.getByRole('columnheader', { name: 'a' })).toBeVisible()
        expect(screen.getByRole('cell', { name: '2' })).toHaveStyle({
            textAlign: 'right',
        })
    })

    it('draws a fence as a code block with its language and a copy button', () => {
        const container = show('```php\necho 1;\n```')
        const block = container.querySelector('[data-slot="markdown-code"]')!

        expect(within(block as HTMLElement).getByText('php')).toBeVisible()
        // Lines are kept as written: a long one scrolls inside the block.
        expect(block.querySelector('pre')).toHaveClass('overflow-x-auto')
        expect(
            block.querySelector('[data-slot="code"][data-variant="block"]'),
        ).toHaveTextContent('echo 1;')
        expect(
            screen.getByRole('button', { name: 'Copy php code' }),
        ).toBeVisible()
    })

    it('leaves a plain-text fence without a language label', () => {
        const container = show('```text\nRETURN 1\n```')

        expect(
            container.querySelector('[data-slot="markdown-code"]'),
        ).not.toHaveTextContent(/^text/)
        expect(
            screen.getByRole('button', { name: 'Copy text code' }),
        ).toBeVisible()
    })

    it('draws inline code as a code span', () => {
        const container = show('Run `composer test` now.')

        expect(
            container.querySelector(
                '[data-slot="code"][data-variant="inline"]',
            ),
        ).toHaveTextContent('composer test')
    })

    it.each([
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '<iframe src="https://example.com"></iframe>',
        '<a href="javascript:alert(1)">x</a>',
        '| a |\n| - |\n| <img src=x onerror=alert(1)> |',
        'text <b onmouseover=alert(1)>bold</b>',
    ])('keeps raw HTML as text: %j', (html) => {
        const container = show(html)

        expect(container.querySelector('script, iframe, img, b')).toBeNull()
        expect(container.querySelector('a[href^="javascript"]')).toBeNull()
        for (const element of container.querySelectorAll('*')) {
            for (const attribute of element.getAttributeNames()) {
                expect(attribute).not.toMatch(/^on/i)
            }
        }
        expect(container.textContent).toContain('<')
    })

    it.each([
        '[click](javascript:alert(1))',
        '[click](JAVASCRIPT:alert(1))',
        '[click](java&#x09;script:alert(1))',
        '[click](vbscript:msgbox)',
        '[click](data:text/html,hi)',
        '<javascript:alert(1)>',
    ])('does not link an unsafe address: %j', (text) => {
        const container = show(text)

        expect(container.querySelector('a')).toBeNull()
        expect(container.textContent).toMatch(/script|data/i)
        expect(container.textContent).toContain('not linked')
    })

    it('opens a link in a new tab and says where it goes', () => {
        show('See [the docs](https://example.com/docs).')

        const link = screen.getByRole('link', { name: 'the docs' })

        expect(link).toHaveAttribute('href', 'https://example.com/docs')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow')
        expect(screen.getByText('(https://example.com/docs)')).toBeVisible()
    })

    it('does not repeat the address of a link that is its own text', () => {
        const container = show('Go to https://example.com now.')

        expect(screen.getByRole('link')).toHaveTextContent(
            'https://example.com',
        )
        expect(container.textContent).toBe('Go to https://example.com now.')
    })

    it('never loads an image and names it instead', () => {
        const container = show('![A chart](https://example.com/chart.png)')

        expect(container.querySelector('img')).toBeNull()
        expect(container.textContent).toContain('Image not loaded:')
        expect(container.textContent).toContain('A chart')
        expect(
            screen.getByRole('link', { name: 'https://example.com/chart.png' }),
        ).toBeVisible()
    })

    it('summarises inline image data rather than writing it out', () => {
        const data = 'data:image/png;base64,' + 'A'.repeat(5000)
        const container = show(`![pixel](${data})`)

        expect(container.querySelector('img, a')).toBeNull()
        expect(container.textContent).toContain('image/png')
        expect(container.textContent).not.toContain('AAAA')
    })

    it('does not link an image with an unsafe address', () => {
        const container = show('![x](javascript:alert(1))')

        expect(container.querySelector('a, img')).toBeNull()
    })

    describe('redaction markers', () => {
        const marks = (container: HTMLElement) =>
            container.querySelectorAll('[data-slot="redaction"]')

        it('marks a marker in a paragraph', () => {
            const container = show('The key is [redacted].')

            expect(marks(container)).toHaveLength(1)
            expect(container.textContent).toContain('[redacted]')
        })

        it('marks a marker in a code span and a fence', () => {
            const container = show(
                'Use `KEY=[redacted]`.\n\n```\nTOKEN=[redacted]\n```',
            )

            expect(
                container.querySelectorAll('code [data-slot="redaction"]'),
            ).toHaveLength(2)
        })

        it('marks a marker in a table cell and in link text', () => {
            const container = show(
                '| key |\n| - |\n| [redacted] |\n\n[token [redacted]](https://example.com)',
            )

            expect(
                container.querySelector('td [data-slot="redaction"]'),
            ).not.toBeNull()
            expect(
                container.querySelector('a [data-slot="redaction"]'),
            ).not.toBeNull()
        })

        it('does not link an address with a marker in it', () => {
            const container = show(
                '[login](https://user:[redacted]@example.com)',
            )

            expect(container.querySelector('a')).toBeNull()
            expect(marks(container)).toHaveLength(1)
        })

        it('marks a marker in an image description', () => {
            const container = show(
                '![photo of [redacted]](https://example.com/a.png)',
            )

            expect(
                container.querySelector(
                    '[data-slot="markdown-image"] [data-slot="redaction"]',
                ),
            ).not.toBeNull()
        })

        it('is not turned into a link by a definition of the same name', () => {
            const container = show(
                'Value: [redacted]\n\n[redacted]: https://evil.example',
            )

            expect(
                container.querySelector('a [data-slot="redaction"]'),
            ).toBeNull()
            expect(
                container.querySelector('a[href="https://evil.example"]'),
            ).toHaveTextContent('https://evil.example')
            expect(marks(container)).toHaveLength(2)
        })

        it('copies a fence with its markers as stored', () => {
            show('```\nTOKEN=[redacted]\n```')

            expect(
                screen.getByRole('button', { name: 'Copy code' }),
            ).toBeVisible()
        })
    })
})
