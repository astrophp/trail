import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { stepSpan } from '@/catalogue/step-span'
import { MessageItem } from '@/components/telemetry/message-item'
import { StepInput } from '@/components/telemetry/step-input'
import type { JsonValue } from '@/lib/json'

function renderMessage(message: JsonValue, number = 1) {
    render(
        <ol>
            <MessageItem
                message={message}
                truncatedPaths={{}}
                basePath="input.messages.0"
                heading={`Message ${number}`}
            />
        </ol>,
    )

    return screen.getByRole('listitem', { name: `Message ${number}` })
}

/** The elements of a tree by their tag, slot, role and label: the markup without its styling. */
function skeleton(element: Element, depth = 0): string[] {
    const attributes = ['data-slot', 'role', 'aria-label']
        .map((name) => [name, element.getAttribute(name)] as const)
        .filter(([, value]) => value !== null)
        .map(([name, value]) => `${name}="${value}"`)
    const own =
        `${'  '.repeat(depth)}${element.tagName.toLowerCase()} ${attributes.join(' ')}`.trimEnd()

    return [
        own,
        ...[...element.children]
            .filter((child) => child.tagName.toLowerCase() !== 'svg')
            .flatMap((child) => skeleton(child, depth + 1)),
    ]
}

describe('MessageItem', () => {
    it('shows the role and the text of a message', () => {
        const item = renderMessage({ role: 'user', content: 'Where is it?' })

        expect(within(item).getByText('user')).toBeInTheDocument()
        expect(within(item).getByText('Where is it?')).toBeInTheDocument()
    })

    it('is headed as it is told to be', () => {
        const item = renderMessage({ role: 'user', content: 'Hi' }, 4)

        expect(within(item).getByText('Message 4')).toBeInTheDocument()
    })

    it('shows tool calls and results under their labels, by tool name', () => {
        const item = renderMessage({
            role: 'assistant',
            tool_calls: [{ name: 'search', arguments: { q: 'a' } }],
            tool_results: [{ name: 'lookup', result: { ok: true } }],
        })

        expect(within(item).getByText('Tool calls')).toBeInTheDocument()
        expect(within(item).getByText('search')).toBeInTheDocument()
        expect(within(item).getByText('Tool results')).toBeInTheDocument()
        expect(within(item).getByText('lookup')).toBeInTheDocument()
    })

    it('says Unknown role when the role is null', () => {
        expect(
            within(renderMessage({ role: null, content: 'x' })).getByText(
                'Unknown role',
            ),
        ).toBeInTheDocument()
    })

    it('shows a structured output in a transcript frame', () => {
        render(
            <MessageItem
                variant="plain"
                message={{
                    role: 'assistant',
                    content: null,
                    structured: { answer: 42 },
                }}
                truncatedPaths={{}}
                heading="Turn 1 response"
            />,
        )

        expect(
            screen.getByRole('group', {
                name: 'turn 1 response structured output',
            }),
        ).toBeInTheDocument()
        expect(screen.queryByText('No text')).toBeNull()
    })

    it('leaves a structured output out of the run page’s section, as it always did', () => {
        const item = renderMessage({
            role: 'assistant',
            content: 'x',
            structured: { answer: 42 },
        })

        expect(
            within(item).queryByRole('group', {
                name: 'message 1 structured output',
            }),
        ).toBeNull()
    })

    describe('a prompt or response with no text', () => {
        function renderPlain(message: JsonValue) {
            render(
                <MessageItem
                    variant="bubble"
                    message={message}
                    truncatedPaths={{}}
                    heading="Turn 1 prompt"
                />,
            )
        }

        it('says the text is empty when it was stored as an empty string', () => {
            renderPlain({ role: 'user', content: '' })

            expect(screen.getByText('Empty text')).toBeVisible()
        })

        it('says there is no text when the content is null', () => {
            renderPlain({ role: 'user', content: null })

            expect(screen.getByText('No text')).toBeVisible()
        })

        it('says nothing extra when the message has tool calls', () => {
            renderPlain({
                role: 'assistant',
                content: '',
                tool_calls: [{ name: 'search', arguments: { q: 1 } }],
            })

            expect(screen.queryByText(/^(No|Empty) text$/)).toBeNull()
        })

        it('does not touch the run page’s section', () => {
            const item = renderMessage({ role: 'user', content: null })

            expect(within(item).queryByText(/^(No|Empty) text$/)).toBeNull()
        })
    })

    describe('marks of what was cut short', () => {
        it('reads the cut paths with the message’s place in them', () => {
            render(
                <ol>
                    <MessageItem
                        message={{ role: 'user', content: 'Summarise' }}
                        truncatedPaths={{ 'input.messages.3.content': 12000 }}
                        basePath="input.messages.3"
                        heading="Message 4"
                    />
                </ol>,
            )

            expect(
                screen.getByText(
                    'This value was cut short when it was stored.',
                ),
            ).toBeInTheDocument()
            expect(screen.getByText('It was 12,000 characters.')).toBeVisible()
        })

        it('does not take the cuts of another message', () => {
            render(
                <ol>
                    <MessageItem
                        message={{ role: 'user', content: 'Summarise' }}
                        truncatedPaths={{ 'input.messages.10.content': 5 }}
                        basePath="input.messages.1"
                        heading="Message 2"
                    />
                </ol>,
            )

            expect(screen.queryByText(/cut short/)).not.toBeInTheDocument()
        })

        it('reads cut paths that are already relative to the message', () => {
            render(
                <MessageItem
                    variant="bubble"
                    message={{
                        role: 'user',
                        content: 'Summarise',
                        tool_results: [{ name: 'lookup', result: 'x' }],
                    }}
                    truncatedPaths={{
                        content: 900,
                        'tool_results.0.result': 77,
                    }}
                    heading="Turn 2 prompt"
                />,
            )

            expect(screen.getByText('It was 900 characters.')).toBeVisible()
            expect(screen.getByText('It was 77 characters.')).toBeVisible()
        })

        it('marks a redaction in the text', () => {
            const item = renderMessage({
                role: 'user',
                content: 'My card is [redacted].',
            })

            expect(
                within(item).getByText(/redacted before it was stored/),
            ).toBeInTheDocument()
        })
    })

    describe('the bubble and plain frames', () => {
        it('has no role, no heading text and no list item', () => {
            render(
                <MessageItem
                    variant="bubble"
                    message={{ role: 'user', content: 'Where is it?' }}
                    truncatedPaths={{}}
                    heading="Turn 1 prompt"
                />,
            )

            expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
            expect(screen.queryByText('user')).not.toBeInTheDocument()
            expect(screen.queryByText('Turn 1 prompt')).not.toBeInTheDocument()
            expect(
                screen.getByRole('group', { name: 'turn 1 prompt text' }),
            ).toHaveTextContent('Where is it?')
        })

        it('shows a text with no box or copy button, still capped', async () => {
            const long = 'word '.repeat(2000)

            render(
                <MessageItem
                    variant="plain"
                    message={{ role: 'assistant', content: long }}
                    truncatedPaths={{}}
                    heading="Turn 1 response"
                />,
            )

            expect(
                screen.queryByRole('button', { name: /^Copy/ }),
            ).not.toBeInTheDocument()

            const group = screen.getByRole('group', {
                name: 'turn 1 response text',
            })
            const before = group.textContent?.length ?? 0

            await userEvent.click(
                within(group).getByRole('button', { name: /Show more/ }),
            )

            expect(group.textContent?.length).toBeGreaterThan(before)
        })

        it('frames only the bubble', () => {
            const { container, rerender } = render(
                <MessageItem
                    variant="bubble"
                    message={{ content: 'a' }}
                    truncatedPaths={{}}
                />,
            )

            expect(container.firstElementChild).toHaveClass(
                'border',
                'bg-muted',
            )

            rerender(
                <MessageItem
                    variant="plain"
                    message={{ content: 'a' }}
                    truncatedPaths={{}}
                />,
            )

            expect(container.firstElementChild).not.toHaveClass('border')
        })
    })
})

describe('the run page’s message markup', () => {
    // The structure the run page's step input has always drawn for a message, pinned so that
    // narrowing MessageItem's inputs cannot change it.
    it('is a labelled list item with a role badge, the text and a tool call', () => {
        render(
            <StepInput
                span={stepSpan(
                    {
                        messages: [
                            {
                                role: 'assistant',
                                content: 'Let me look.',
                                tool_calls: [
                                    { id: 'c', name: 'search', arguments: 1 },
                                ],
                            },
                        ],
                    },
                    { 'input.messages.0.content': 30 },
                )}
            />,
        )

        const item = screen.getByRole('listitem', { name: 'Message 1' })

        expect(item.className).toBe('flex min-w-0 flex-col gap-3 border-s ps-4')
        expect(item.getAttribute('data-slot')).toBe('message-item')
        expect(item.parentElement?.tagName).toBe('OL')
        expect(skeleton(item).join('\n')).toBe(
            [
                'li data-slot="message-item" aria-label="Message 1"',
                '  div',
                '    span data-slot="badge"',
                '    span',
                '  div data-slot="payload-viewer" role="group" aria-label="message 1 text"',
                '    div data-slot="notice" role="status"',
                '      div data-slot="alert-title"',
                '      div data-slot="alert-description"',
                '    div',
                '      div',
                '        span data-slot="capped-text"',
                '      button data-slot="copy-button" aria-label="Copy message 1 text"',
                '  div',
                '    p data-slot="section-label"',
                '    div data-slot="named-payload"',
                '      div',
                '        span',
                '      div data-slot="payload-viewer" role="group" aria-label="message 1 search arguments"',
                '        div',
                '          div',
                '            div data-slot="payload-node"',
                '              span',
                '          button data-slot="copy-button" aria-label="Copy message 1 search arguments"',
            ].join('\n'),
        )
    })

    it('keeps the markup of a message with no role, of one that is not an object, and of one with a structured output', () => {
        const markup = (message: JsonValue) => {
            const { unmount } = render(
                <ol>
                    <MessageItem
                        message={message}
                        truncatedPaths={{}}
                        basePath="input.messages.0"
                        heading="Message 1"
                    />
                </ol>,
            )
            const item = screen.getByRole('listitem', { name: 'Message 1' })
            const text = skeleton(item).join('\n')

            unmount()

            return text
        }

        expect(markup({ role: null, content: 'x' })).toBe(
            [
                'li data-slot="message-item" aria-label="Message 1"',
                '  div',
                '    span data-slot="badge"',
                '    span',
                '  div data-slot="payload-viewer" role="group" aria-label="message 1 text"',
                '    div',
                '      div',
                '        span data-slot="capped-text"',
                '      button data-slot="copy-button" aria-label="Copy message 1 text"',
            ].join('\n'),
        )
        expect(markup('just a string')).toContain('span data-slot="badge"')
        expect(
            markup({ role: 'user', content: 'x', structured: { a: 1 } }),
        ).toBe(markup({ role: 'user', content: 'x' }))
    })
})
