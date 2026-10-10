import { MessageItem } from '@/components/telemetry/message-item'
import type { CatalogueEntry } from '@/catalogue/types'
import type { JsonValue } from '@/lib/json'
import type { MessageVariant } from '@/components/telemetry/message-item'

const long = Array.from(
    { length: 40 },
    (_, i) => `Sentence ${i + 1} of a long message that keeps going.`,
).join(' ')

function specimen(message: JsonValue, truncated: Record<string, number> = {}) {
    return () => (
        <ol>
            <MessageItem
                message={message}
                truncatedPaths={truncated}
                basePath="input.messages.0"
                heading="Message 1"
            />
        </ol>
    )
}

function framed(
    variant: MessageVariant,
    message: JsonValue,
    truncated: Record<string, number> = {},
) {
    return () => (
        <MessageItem
            message={message}
            truncatedPaths={truncated}
            heading="Turn 1 message"
            variant={variant}
        />
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Message item',
    specimens: [
        {
            name: 'User message',
            Component: specimen({
                role: 'user',
                content: 'Where is my order?',
            }),
        },
        {
            name: 'Assistant message with tool calls',
            Component: specimen({
                role: 'assistant',
                content: 'Let me look that up.',
                tool_calls: [
                    {
                        id: 'c1',
                        name: 'lookup_order',
                        arguments: { id: 'A-1' },
                    },
                    {
                        id: 'c2',
                        name: 'lookup_order',
                        arguments: { id: 'A-2' },
                    },
                ],
            }),
        },
        {
            name: 'Tool result',
            Component: specimen({
                role: 'tool',
                content: '',
                tool_results: [
                    {
                        id: 'c1',
                        name: 'lookup_order',
                        result: { status: 'shipped' },
                    },
                ],
            }),
        },
        {
            name: 'No role',
            Component: specimen({
                role: null,
                content: 'A message without a role',
            }),
        },
        {
            name: 'Not an object',
            Component: specimen('a bare string'),
        },
        {
            name: 'With attachments',
            Component: specimen({
                role: 'user',
                content: 'See attached.',
                attachments: [{ type: 'image', name: 'receipt.png' }],
            }),
        },
        {
            name: 'Redacted content',
            Component: specimen({
                role: 'user',
                content: 'My card is [redacted].',
            }),
        },
        {
            name: 'Cut short',
            Component: specimen(
                { role: 'user', content: 'Summarise the following ticket and' },
                { 'input.messages.0.content': 12000 },
            ),
        },
        {
            name: 'Long message',
            Component: specimen({ role: 'assistant', content: long }),
        },
        {
            name: 'Prompt bubble (transcript)',
            Component: framed('bubble', {
                role: 'user',
                content: 'Where is my order?',
            }),
        },
        {
            name: 'Prompt bubble, cut short and long',
            Component: framed(
                'bubble',
                { role: 'user', content: long },
                { content: 90000 },
            ),
        },
        {
            name: 'Response, plain (transcript)',
            Component: framed('plain', {
                role: 'assistant',
                content: 'Your order shipped on Monday.',
            }),
        },
    ],
}
