import { StoredPayload } from '@/components/telemetry/stored-payload'
import { stepSpan } from '@/catalogue/step-span'
import type { CatalogueEntry } from '@/catalogue/types'

const span = stepSpan(null, { 'input.prompt': 12000 })

export const catalogue: CatalogueEntry = {
    title: 'Stored payload',
    specimens: [
        {
            name: 'Text',
            Component: () => (
                <StoredPayload
                    span={span}
                    path="input.system"
                    label="system"
                    value="You are a support assistant."
                />
            ),
        },
        {
            name: 'Structured',
            Component: () => (
                <StoredPayload
                    span={span}
                    path="input.options"
                    label="options"
                    value={{ temperature: 0.2, tools: ['search'] }}
                />
            ),
        },
        {
            name: 'Cut short, with its original length',
            Component: () => (
                <StoredPayload
                    span={span}
                    path="input.prompt"
                    label="prompt"
                    value="Summarise the following ticket and list the open questions for the customer. The ticket begins here and goes on"
                />
            ),
        },
        {
            name: 'Redacted',
            Component: () => (
                <StoredPayload
                    span={span}
                    path="input.card"
                    label="redacted text"
                    value="My card number is [redacted]."
                />
            ),
        },
        {
            name: 'Not captured',
            Component: () => (
                <StoredPayload
                    span={span}
                    path="input.system"
                    label="system"
                    value={undefined}
                />
            ),
        },
    ],
}
