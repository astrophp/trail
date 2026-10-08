import { MessageItem } from '@/components/telemetry/message-item'
import { stepSpan } from '@/catalogue/step-span'
import type { CatalogueEntry } from '@/catalogue/types'
import type { JsonValue } from '@/lib/json'

const long = Array.from(
    { length: 40 },
    (_, i) => `Sentence ${i + 1} of a long message that keeps going.`,
).join(' ')

function specimen(message: JsonValue, truncated: Record<string, number> = {}) {
    return () => (
        <ol>
            <MessageItem
                span={stepSpan({ messages: [message] }, truncated)}
                index={0}
                number={1}
                message={message}
            />
        </ol>
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
    ],
}
