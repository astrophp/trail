import { SectionLabel } from '@/components/telemetry/section-label'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Section label',
    specimens: [
        {
            name: 'Heading',
            Component: () => <SectionLabel>Messages</SectionLabel>,
        },
        {
            name: 'Inside a section that has a heading',
            Component: () => <SectionLabel as="p">Tool calls</SectionLabel>,
        },
    ],
}
