import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PayloadViewer } from '@/components/patterns/payload-viewer'
import { textChunk, type JsonValue } from '@/lib/json'

const notifyMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/components/patterns/notify', () => ({ notify: notifyMock }))

beforeEach(() => {
    vi.clearAllMocks()
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

const viewer = (value: JsonValue | undefined, extra = {}) =>
    render(<PayloadViewer value={value} label="arguments" {...extra} />)

describe('PayloadViewer', () => {
    describe('text', () => {
        it('shows a string as text with no tree or raw switch', () => {
            viewer('Hello there')

            expect(screen.getByText('Hello there')).toBeVisible()
            expect(screen.queryByRole('tab')).not.toBeInTheDocument()
        })

        it('keeps a string that holds JSON as a string', () => {
            const json = '{"a":1,"b":[2]}'

            viewer(json)

            expect(screen.getByText(json)).toBeVisible()
            expect(screen.queryByRole('tab')).not.toBeInTheDocument()
            expect(
                screen.queryByRole('button', { name: /\{/ }),
            ).not.toBeInTheDocument()
        })

        it('says so for an empty string, with its notices when flagged', () => {
            viewer('', { redacted: true })

            expect(screen.getByText('Empty text')).toBeVisible()
            expect(screen.getByText('Empty text')).toHaveClass(
                'text-muted-foreground',
            )
            expect(
                screen.getByText(
                    'Parts of this value were redacted before it was stored.',
                ),
            ).toBeVisible()
        })

        it('shows a number at the top level', () => {
            viewer(42)

            expect(screen.getByText('42')).toBeVisible()
        })
    })

    describe('not captured', () => {
        it.each([undefined, null])('says so for %s', (value) => {
            const { container } = viewer(value)

            expect(screen.getByText('Not captured')).toBeVisible()
            expect(container).toHaveTextContent(/^Not captured$/)
            expect(screen.queryByRole('button')).not.toBeInTheDocument()
        })

        it('still shows the notices that were flagged, above the words', () => {
            const { container } = viewer(undefined, {
                redacted: true,
                truncated: true,
                originalLength: 500,
            })

            const redacted = screen.getByText(
                'Parts of this value were redacted before it was stored.',
            )
            const truncated = screen.getByText(
                'This value was cut short when it was stored.',
            )
            const words = screen.getByText('Not captured')

            expect(screen.getByText('It was 500 characters.')).toBeVisible()
            expect(
                redacted.compareDocumentPosition(words) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy()
            expect(
                truncated.compareDocumentPosition(words) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy()
            expect(
                container.querySelector('[data-state="missing"]'),
            ).not.toBeNull()
        })

        it('adds the reason it was given', () => {
            viewer(undefined, { missingReason: 'The tool has not run yet.' })

            expect(screen.getByText('Not captured')).toBeVisible()
            expect(screen.getByText(/The tool has not run yet\./)).toBeVisible()
        })
    })

    describe('tree', () => {
        it('shows the keys and values of an object with the count', () => {
            viewer({ city: 'Oslo', days: 3, ok: true, none: null })

            expect(screen.getByText('city')).toBeVisible()
            expect(screen.getByText('Oslo')).toBeVisible()
            expect(screen.getByText('3')).toBeVisible()
            expect(screen.getByText('true')).toBeVisible()
            expect(screen.getByText('null')).toBeVisible()
            expect(
                screen.getByRole('button', {
                    name: 'arguments, object with 4 entries',
                }),
            ).toHaveAttribute('aria-expanded', 'true')
        })

        it('shows an array with its length', () => {
            viewer(['a', 'b', 'c'])

            expect(
                screen.getByRole('button', {
                    name: 'arguments, array with 3 items',
                }),
            ).toBeVisible()
            expect(screen.getByText('b')).toBeVisible()
        })

        it('closes and opens a container', async () => {
            const user = userEvent.setup()

            viewer({ inner: { deep: 'x' } })

            const inner = screen.getByRole('button', { name: /inner/ })

            expect(screen.getByText('x')).toBeVisible()

            await user.click(inner)

            expect(inner).toHaveAttribute('aria-expanded', 'false')
            expect(screen.queryByText('x')).not.toBeInTheDocument()

            await user.click(inner)

            expect(screen.getByText('x')).toBeVisible()
        })

        it('starts nesting deeper than two levels collapsed, and opens it on demand', async () => {
            const user = userEvent.setup()

            viewer({ a: { b: { c: { d: 'bottom' } } } })

            expect(screen.getByRole('button', { name: /^a:/ })).toBeVisible()
            expect(screen.getByRole('button', { name: /^b:/ })).toHaveAttribute(
                'aria-expanded',
                'false',
            )
            expect(screen.queryByText('c')).not.toBeInTheDocument()

            await user.click(screen.getByRole('button', { name: /^b:/ }))
            await user.click(screen.getByRole('button', { name: /^c:/ }))

            expect(screen.getByText('bottom')).toBeVisible()
        })

        it('shows empty containers as they are', () => {
            viewer({ list: [], map: {} })

            expect(screen.getByText('[]')).toBeVisible()
            expect(screen.getByText('{}')).toBeVisible()
        })
    })

    describe('raw', () => {
        it('shows the same value pretty-printed', async () => {
            const user = userEvent.setup()
            const value = { a: 1, b: ['x'] }

            viewer(value)
            await user.click(screen.getByRole('tab', { name: 'Raw' }))

            const raw = screen.getByRole('tabpanel')

            expect(raw.textContent).toBe(JSON.stringify(value, null, 2))
            expect(screen.getByRole('tab', { name: 'Raw' })).toHaveAttribute(
                'aria-selected',
                'true',
            )

            await user.click(screen.getByRole('tab', { name: 'Tree' }))

            expect(screen.getByText('a')).toBeVisible()
            expect(
                screen.getByRole('button', { name: /object with 2 entries/ }),
            ).toBeVisible()
        })
    })

    describe('large values', () => {
        it('puts only the first chunk of a long string in the page, then the next one on request', async () => {
            const user = userEvent.setup()
            // Every ten characters are different, so a wrong cut cannot look right.
            const text = Array.from(
                { length: 1000 },
                (_, i) => `${String(i).padStart(8, '0')}, `,
            ).join('')

            expect(text).toHaveLength(10_000)

            const { container } = viewer(text)
            const shown = () =>
                container.querySelector('[data-slot="capped-text"]')!
                    .firstChild!.textContent

            expect(shown()).toBe(text.slice(0, textChunk))

            await user.click(
                screen.getByRole('button', {
                    name: 'Show more (6,000 characters left)',
                }),
            )

            expect(shown()).toBe(text.slice(0, 2 * textChunk))

            await user.click(
                screen.getByRole('button', {
                    name: 'Show more (2,000 characters left)',
                }),
            )

            expect(shown()).toBe(text)
            expect(
                screen.queryByRole('button', { name: /Show more/ }),
            ).not.toBeInTheDocument()
        })

        it('renders a bounded amount of a huge value on first paint', () => {
            const row = () =>
                Object.fromEntries(
                    Array.from({ length: 100 }, (_, i) => [
                        `key-${i}`,
                        'x'.repeat(5000),
                    ]),
                )
            const value = Array.from({ length: 100 }, row)

            const { container } = viewer(value)

            // The hundred rows are there, each closed; none of their 10,000 strings is.
            expect(
                screen.getAllByRole('button', { name: /^\d+:/ }),
            ).toHaveLength(100)
            expect(container.textContent.length).toBeLessThan(5000)
            expect(
                container.querySelectorAll('[data-slot="payload-node"]').length,
            ).toBeLessThan(150)
            expect(container.textContent).not.toContain('xxxxx')
        })

        it('cuts a string inside a tree much shorter than a top-level one', () => {
            const { container } = viewer({ note: 'y'.repeat(2000) })

            expect(container.textContent).toContain('y'.repeat(500))
            expect(container.textContent).not.toContain('y'.repeat(501))
            expect(
                screen.getByRole('button', {
                    name: 'Show more (1,500 characters left)',
                }),
            ).toBeVisible()
        })

        it('starts a container with more than twenty children collapsed, whatever its depth', async () => {
            const user = userEvent.setup()
            const wide = Array.from({ length: 21 }, (_, i) => `w-${i}`)
            const narrow = Array.from({ length: 20 }, (_, i) => `n-${i}`)

            viewer({ wide, narrow })

            expect(
                screen.getByRole('button', { name: /^wide:/ }),
            ).toHaveAttribute('aria-expanded', 'false')
            expect(screen.queryByText('w-0')).not.toBeInTheDocument()
            expect(
                screen.getByRole('button', { name: /^narrow:/ }),
            ).toHaveAttribute('aria-expanded', 'true')
            expect(screen.getByText('n-0')).toBeVisible()

            await user.click(screen.getByRole('button', { name: /^wide:/ }))

            expect(screen.getByText('w-0')).toBeVisible()
        })

        it('keeps the top level open however many children it has', () => {
            viewer(Array.from({ length: 30 }, (_, i) => `t-${i}`))

            expect(
                screen.getByRole('button', { name: /array with 30 items/ }),
            ).toHaveAttribute('aria-expanded', 'true')
            expect(screen.getByText('t-0')).toBeVisible()
        })

        it('cuts an object key after 200 characters and keeps the whole key in the tooltip', () => {
            const key = 'k'.repeat(300)

            viewer({ [key]: 'v' })

            const label = document.querySelector('[data-slot="payload-key"]')!

            expect(label).toHaveAttribute('title', key)
            expect(label.textContent).toBe(`${'k'.repeat(200)}…:`)
        })

        it('gives a short key no tooltip', () => {
            viewer({ short: 'v' })

            expect(screen.getByText('short')).toBeVisible()
            expect(
                document.querySelector('[data-slot="payload-key"]'),
            ).not.toHaveAttribute('title')
        })

        it('mounts a value nested five thousand levels deep, and the tree is usable', async () => {
            const user = userEvent.setup()
            let value: JsonValue = 'bottom'

            for (let i = 0; i < 5000; i++) {
                value = { n: value }
            }

            const { container } = viewer(value)

            // Levels 0 and 1 are open, level 2 and deeper are not rendered at all.
            const buttons = screen.getAllByRole('button', { name: /object/ })

            expect(buttons).toHaveLength(1)
            expect(
                container.querySelectorAll('[data-slot="payload-node"]').length,
            ).toBeLessThan(10)

            const levels = screen.getAllByRole('button', { name: /^n:/ })

            expect(levels).toHaveLength(2)
            expect(levels[0]).toHaveAttribute('aria-expanded', 'true')
            expect(levels[1]).toHaveAttribute('aria-expanded', 'false')

            await user.click(levels[1])

            expect(
                container.querySelectorAll('[data-slot="payload-node"]').length,
            ).toBeLessThan(10)

            await user.click(screen.getByRole('tab', { name: 'Raw' }))

            const raw = screen.getByRole('tabpanel')

            expect(raw.textContent).toMatch(
                /^\{\s+"n": |This value is too large or too deeply nested to show as raw JSON\./,
            )
        })

        it('puts only the first hundred items of a long array in the page', async () => {
            const user = userEvent.setup()
            const items = Array.from({ length: 5000 }, (_, i) => `item-${i}`)

            viewer(items)

            expect(screen.getByText('item-99')).toBeVisible()
            expect(screen.queryByText('item-100')).not.toBeInTheDocument()
            expect(
                document.querySelectorAll('[data-slot="payload-node"]').length,
            ).toBeLessThan(150)

            await user.click(
                screen.getByRole('button', {
                    name: 'Show 100 more (4,900 left)',
                }),
            )

            expect(screen.getByText('item-100')).toBeVisible()
            expect(screen.getByText('item-199')).toBeVisible()
            expect(screen.queryByText('item-200')).not.toBeInTheDocument()
        })

        it('caps the raw view like a string', async () => {
            const user = userEvent.setup()
            const items = Array.from({ length: 5000 }, (_, i) => i)

            viewer(items)
            await user.click(screen.getByRole('tab', { name: 'Raw' }))

            const raw = screen.getByRole('tabpanel')

            expect(
                within(raw).getByRole('button', { name: /Show more/ }),
            ).toBeVisible()
            expect(raw.textContent?.length).toBeLessThan(5000)
        })
    })

    describe('redaction', () => {
        it('has no notice unless the value was redacted', () => {
            viewer('plain')

            expect(screen.getByText('plain')).toBeVisible()
            expect(screen.queryByRole('status')).not.toBeInTheDocument()
        })

        it('says parts were redacted', () => {
            viewer('plain', { redacted: true })

            expect(
                screen.getByText(
                    'Parts of this value were redacted before it was stored.',
                ),
            ).toBeVisible()
        })

        it('marks the marker inside a string and in a tree', () => {
            const { container } = viewer({
                token: '[redacted]',
                note: 'a [redacted] b',
            })

            const marks = container.querySelectorAll('[data-slot="redaction"]')

            expect(marks).toHaveLength(2)
            expect(marks[0]).toHaveTextContent('[redacted]')
            expect(marks[0]).toHaveTextContent('redacted before it was stored')
            expect(marks[1]).toHaveAttribute(
                'title',
                'Redacted before it was stored',
            )
        })

        it('marks the marker inside an object key', () => {
            const { container } = viewer({ 'secret-[redacted]': 'v' })

            const key = container.querySelector('[data-slot="payload-key"]')!
            const mark = key.querySelector('[data-slot="redaction"]')

            expect(key).toHaveTextContent('secret-[redacted]')
            expect(mark).not.toBeNull()
            expect(mark).toHaveTextContent('[redacted]')
        })

        it('uses the marker it is given', () => {
            const { container } = viewer('key=***', { redactionMarker: '***' })

            const mark = container.querySelector('[data-slot="redaction"]')

            expect(mark).not.toBeNull()
            expect(mark).toHaveTextContent('***')
        })
    })

    describe('truncation', () => {
        it('says the value was cut short, with its original length', () => {
            viewer('abc', { truncated: true, originalLength: 12000 })

            expect(
                screen.getByText(
                    'This value was cut short when it was stored.',
                ),
            ).toBeVisible()
            expect(screen.getByText('It was 12,000 characters.')).toBeVisible()
        })

        it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
            'does not mention a length of %s',
            (length) => {
                viewer('abc', { truncated: true, originalLength: length })

                expect(
                    screen.getByText(
                        'This value was cut short when it was stored.',
                    ),
                ).toBeVisible()
                expect(screen.queryByText(/It was/)).not.toBeInTheDocument()
            },
        )

        it('says it without a length when none is known', () => {
            viewer('abc', { truncated: true, originalLength: null })

            expect(
                screen.getByText(
                    'This value was cut short when it was stored.',
                ),
            ).toBeVisible()
            expect(screen.queryByText(/It was/)).not.toBeInTheDocument()
        })
    })

    describe('copy', () => {
        it('copies a string as it is', async () => {
            const user = userEvent.setup()
            const writeText = vi.fn().mockResolvedValue(undefined)

            setClipboard({ writeText })
            viewer('{"a":1}')
            await user.click(
                screen.getByRole('button', { name: 'Copy arguments' }),
            )

            expect(writeText).toHaveBeenCalledWith('{"a":1}')
            expect(notifyMock.success).toHaveBeenCalledWith('Copied arguments')
        })

        it('copies structured values as pretty JSON', async () => {
            const user = userEvent.setup()
            const writeText = vi.fn().mockResolvedValue(undefined)

            setClipboard({ writeText })
            viewer({ a: [1] })
            await user.click(
                screen.getByRole('button', { name: 'Copy arguments' }),
            )

            expect(writeText).toHaveBeenCalledWith('{\n  "a": [\n    1\n  ]\n}')
        })

        it('reports a value that cannot be written out', async () => {
            const user = userEvent.setup()
            const writeText = vi.fn().mockResolvedValue(undefined)
            const real = JSON.stringify.bind(JSON)

            setClipboard({ writeText })
            viewer({ a: 1 })
            vi.spyOn(JSON, 'stringify').mockImplementation(
                (value, replacer, indent) => {
                    if (indent === 2) {
                        throw new RangeError('Maximum call stack size exceeded')
                    }

                    return real(value, replacer as never, indent)
                },
            )
            await user.click(
                screen.getByRole('button', { name: 'Copy arguments' }),
            )

            expect(writeText).not.toHaveBeenCalled()
            expect(notifyMock.error).toHaveBeenCalledWith(
                'Could not copy arguments',
            )
        })

        it('reports a clipboard that refuses', async () => {
            const user = userEvent.setup()

            setClipboard({
                writeText: vi.fn().mockRejectedValue(new Error('x')),
            })
            viewer('abc')
            await user.click(
                screen.getByRole('button', { name: 'Copy arguments' }),
            )

            expect(notifyMock.error).toHaveBeenCalledWith(
                'Could not copy arguments',
            )
            expect(notifyMock.success).not.toHaveBeenCalled()
        })

        it('reports a browser with no clipboard', async () => {
            const user = userEvent.setup()

            setClipboard(undefined)
            viewer('abc')
            await user.click(
                screen.getByRole('button', { name: 'Copy arguments' }),
            )

            expect(notifyMock.error).toHaveBeenCalledWith(
                'Could not copy arguments',
            )
        })
    })

    describe('views', () => {
        it('keeps what was opened when going to Raw and back to Tree', async () => {
            const user = userEvent.setup()
            const value = {
                list: Array.from({ length: 150 }, (_, i) => `item-${i}`),
            }

            viewer(value)

            const list = () => screen.getByRole('button', { name: /^list:/ })

            // A list of more than twenty starts closed; open it and ask for the rest of it.
            expect(list()).toHaveAttribute('aria-expanded', 'false')
            await user.click(list())
            expect(screen.getByText('item-99')).toBeVisible()
            expect(screen.queryByText('item-100')).not.toBeInTheDocument()
            await user.click(
                screen.getByRole('button', { name: 'Show 50 more (50 left)' }),
            )
            expect(screen.getByText('item-149')).toBeVisible()

            await user.click(screen.getByRole('tab', { name: 'Raw' }))
            expect(screen.getByText('item-149')).not.toBeVisible()
            expect(screen.getByRole('tabpanel').textContent).toContain('"list"')

            await user.click(screen.getByRole('tab', { name: 'Tree' }))

            expect(screen.getByText('item-149')).toBeVisible()
            expect(list()).toHaveAttribute('aria-expanded', 'true')
            expect(
                screen.queryByRole('button', { name: /Show 50 more/ }),
            ).not.toBeInTheDocument()
        })

        it('does not pretty-print the value until Raw is shown', async () => {
            const user = userEvent.setup()
            const stringify = vi.spyOn(JSON, 'stringify')

            const { container } = viewer({ a: 1 })

            expect(
                stringify.mock.calls.filter(([, , indent]) => indent === 2),
            ).toHaveLength(0)
            expect(
                container.querySelectorAll('[role="tabpanel"]')[1].textContent,
            ).toBe('')

            await user.click(screen.getByRole('tab', { name: 'Raw' }))

            expect(screen.getByRole('tabpanel').textContent).toBe(
                '{\n  "a": 1\n}',
            )
            expect(
                stringify.mock.calls.filter(([, , indent]) => indent === 2),
            ).toHaveLength(1)
        })

        it('says so when the value cannot be shown as raw JSON, and the tree still works', async () => {
            const user = userEvent.setup()
            const real = JSON.stringify.bind(JSON)

            vi.spyOn(JSON, 'stringify').mockImplementation(
                (value, replacer, indent) => {
                    if (indent === 2) {
                        throw new RangeError('Maximum call stack size exceeded')
                    }

                    return real(value, replacer as never, indent)
                },
            )

            viewer({ a: 1 })
            await user.click(screen.getByRole('tab', { name: 'Raw' }))

            expect(
                screen.getByText(
                    'This value is too large or too deeply nested to show as raw JSON.',
                ),
            ).toBeVisible()

            await user.click(screen.getByRole('tab', { name: 'Tree' }))

            expect(screen.getByText('a')).toBeVisible()
        })
    })

    describe('safety', () => {
        it('renders HTML-looking keys and values as text', async () => {
            const user = userEvent.setup()
            const img = '<img src=x onerror=alert(1)>'
            const script = '<script>alert(2)</script>'

            const { container } = viewer({
                [img]: script,
                plain: `${img} tail`,
            })

            expect(screen.getByText(img)).toBeVisible()
            expect(screen.getByText(script)).toBeVisible()
            expect(container.querySelector('img')).toBeNull()
            expect(container.querySelector('script')).toBeNull()

            await user.click(screen.getByRole('tab', { name: 'Raw' }))

            expect(container.querySelector('img')).toBeNull()
            expect(container.querySelector('script')).toBeNull()
            expect(screen.getByRole('tabpanel').textContent).toContain(
                '<script>alert(2)</script>',
            )
        })

        it('renders an HTML string at the top level as text', () => {
            const { container } = viewer('<b>bold</b><script>x()</script>')

            expect(
                screen.getByText('<b>bold</b><script>x()</script>'),
            ).toBeVisible()
            expect(container.querySelector('b')).toBeNull()
            expect(container.querySelector('script')).toBeNull()
        })
    })

    it('names the payload for assistive technology and takes a class name', () => {
        viewer('x', { className: 'extra' })

        expect(screen.getByRole('group', { name: 'arguments' })).toHaveClass(
            'extra',
        )
    })
})
