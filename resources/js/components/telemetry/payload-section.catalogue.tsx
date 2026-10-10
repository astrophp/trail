import { PayloadSection } from '@/components/telemetry/payload-section'
import { stepSpan } from '@/catalogue/step-span'
import type { CatalogueEntry } from '@/catalogue/types'

const span = stepSpan(null, { 'input.prompt': 9000 })

export const catalogue: CatalogueEntry = {
    title: 'Payload section',
    specimens: [
        {
            name: 'Text under a heading',
            Component: () => (
                <PayloadSection
                    span={span}
                    path="input.system"
                    heading="System prompt"
                    value="You are a support assistant."
                />
            ),
        },
        {
            name: 'Cut short',
            Component: () => (
                <PayloadSection
                    span={span}
                    path="input.prompt"
                    heading="Prompt"
                    value="Summarise the following ticket and list the open questions"
                />
            ),
        },
        {
            name: 'Not captured',
            Component: () => (
                <PayloadSection
                    span={span}
                    path="input.messages"
                    heading="Messages"
                    value={undefined}
                />
            ),
        },
    ],
}
