import { useState } from 'react'
import { DecimalField } from '@/components/patterns/decimal-field'
import type { CatalogueEntry } from '@/catalogue/types'

function Specimen({
    initial,
    error,
    disabled,
    caption,
}: {
    initial: string
    error?: string
    disabled?: boolean
    caption?: string
}) {
    const [value, setValue] = useState(initial)

    return (
        <div className="max-w-xs">
            <DecimalField
                label="Input rate for anthropic claude-sonnet-4-5, US dollars per million tokens"
                caption={caption}
                value={value}
                onValueChange={setValue}
                error={error}
                disabled={disabled}
            />
        </div>
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Decimal field',
    specimens: [
        {
            name: 'With a value',
            Component: () => <Specimen initial="3.75" />,
        },
        {
            name: 'Blank (no value, not zero)',
            Component: () => <Specimen initial="" />,
        },
        {
            name: 'Zero',
            Component: () => <Specimen initial="0" />,
        },
        {
            name: 'With a visible caption',
            Component: () => <Specimen initial="15" caption="Output" />,
        },
        {
            name: 'With an error',
            Component: () => (
                <Specimen
                    initial="0.1234567"
                    error="The input rate can have at most 6 decimal places."
                />
            ),
        },
        {
            name: 'Disabled',
            Component: () => <Specimen initial="3.75" disabled />,
        },
    ],
}
