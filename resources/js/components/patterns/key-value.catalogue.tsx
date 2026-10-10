import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Key-value',
    specimens: [
        {
            name: 'Value',
            Component: () => (
                <KeyValueList>
                    <KeyValue label="Model">gpt-5</KeyValue>
                </KeyValueList>
            ),
        },
        {
            name: 'Value with copy',
            Component: () => (
                <KeyValueList>
                    <KeyValue label="Trace id" copy="019a3f2c-7d10">
                        019a3f2c-7d10
                    </KeyValue>
                </KeyValueList>
            ),
        },
        {
            name: 'Missing',
            Component: () => (
                <KeyValueList>
                    <KeyValue label="Model" />
                    <KeyValue label="Cost" missing="Unpriced" />
                </KeyValueList>
            ),
        },
    ],
}
