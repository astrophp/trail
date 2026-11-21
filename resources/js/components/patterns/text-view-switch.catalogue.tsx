import { TextViewSwitch } from '@/components/patterns/text-view-switch'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Text view switch',
    specimens: [
        {
            name: 'Rendered or Raw',
            Component: () => <TextViewSwitch label="Turn 1 response" />,
        },
    ],
}
