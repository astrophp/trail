import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { stepSpan } from '@/catalogue/step-span'
import { MessageItem } from '@/components/telemetry/message-item'
import type { JsonValue } from '@/lib/json'

function renderMessage(message: JsonValue, number = 1) {
    render(
        <ol>
            <MessageItem
                span={stepSpan({ messages: [message] })}
                index={0}
                number={number}
                message={message}
            />
        </ol>,
    )

    return screen.getByRole('listitem', { name: `Message ${number}` })
}

describe('MessageItem', () => {
    it('shows the role and the text of a message', () => {
        const item = renderMessage({ role: 'user', content: 'Where is it?' })

        expect(within(item).getByText('user')).toBeInTheDocument()
        expect(within(item).getByText('Where is it?')).toBeInTheDocument()
    })

    it('numbers the message from its place in the whole history', () => {
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
})
