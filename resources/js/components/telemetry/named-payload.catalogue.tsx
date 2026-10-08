import { NamedPayload } from '@/components/telemetry/named-payload'
import { Button } from '@/components/ui/button'
import { stepSpan } from '@/catalogue/step-span'
import type { CatalogueEntry } from '@/catalogue/types'

const span = stepSpan(null, { 'output.tool_calls.1.arguments': 4000 })

export const catalogue: CatalogueEntry = {
    title: 'Named payload',
    specimens: [
        {
            name: 'Arguments',
            Component: () => (
                <NamedPayload
                    span={span}
                    path="output.tool_calls.0.arguments"
                    name="search"
                    label="search arguments"
                    value={{ query: 'refund policy' }}
                />
            ),
        },
        {
            name: 'With an action beside the name',
            Component: () => (
                <NamedPayload
                    span={span}
                    path="output.tool_calls.0.arguments"
                    name="search"
                    label="search arguments"
                    value={{ query: 'refund policy' }}
                >
                    <Button type="button" variant="outline" size="xs">
                        Open tool span
                    </Button>
                </NamedPayload>
            ),
        },
        {
            name: 'Cut short',
            Component: () => (
                <NamedPayload
                    span={span}
                    path="output.tool_calls.1.arguments"
                    name="lookup_order"
                    label="lookup_order arguments"
                    value={{
                        order: 'A-1001',
                        note: 'A long note that was cut',
                    }}
                />
            ),
        },
        {
            name: 'No value stored',
            Component: () => (
                <NamedPayload
                    span={span}
                    path="output.tool_calls.2.arguments"
                    name="ping"
                    label="ping arguments"
                    value={undefined}
                />
            ),
        },
    ],
}
