import { StepInput } from '@/components/telemetry/step-input'
import { stepSpan } from '@/catalogue/step-span'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Step input',
    specimens: [
        {
            name: 'Messages and options',
            Component: () => (
                <StepInput
                    span={stepSpan({
                        messages: [
                            { role: 'user', content: 'Where is my order?' },
                            {
                                role: 'assistant',
                                content: 'Let me look that up.',
                                tool_calls: [
                                    {
                                        id: 'c1',
                                        name: 'lookup_order',
                                        arguments: { id: 'A-1' },
                                    },
                                ],
                            },
                            {
                                role: 'tool',
                                tool_results: [
                                    {
                                        id: 'c1',
                                        name: 'lookup_order',
                                        result: { status: 'shipped' },
                                    },
                                ],
                            },
                        ],
                        options: { temperature: 0.2 },
                    })}
                />
            ),
        },
        {
            name: 'Later step (earlier messages stored elsewhere)',
            Component: () => (
                <StepInput
                    span={stepSpan({
                        messages_offset: 3,
                        messages: [
                            { role: 'user', content: 'And the refund?' },
                        ],
                    })}
                />
            ),
        },
        {
            name: 'Cut short',
            Component: () => (
                <StepInput
                    span={stepSpan(
                        { messages: [{ role: 'user', content: 'Summarise' }] },
                        { 'input.messages.0.content': 12000 },
                    )}
                />
            ),
        },
        {
            name: 'No messages stored',
            Component: () => (
                <StepInput
                    span={stepSpan({
                        messages: [],
                        options: { temperature: 0.2 },
                    })}
                />
            ),
        },
        {
            name: 'Messages not a list (as stored)',
            Component: () => <StepInput span={stepSpan({ messages: 'x' })} />,
        },
    ],
}
