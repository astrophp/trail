import { StatusBadge } from '@/components/telemetry/status-badge'
import type { Status } from '@/api/types'
import type { CatalogueEntry } from '@/catalogue/types'

const statuses: Status[] = [
    'completed',
    'failed',
    'running',
    'incomplete',
    'awaiting_approval',
]

export const catalogue: CatalogueEntry = {
    title: 'Status badge',
    specimens: statuses.map((status) => ({
        name: status,
        Component: () => <StatusBadge status={status} />,
    })),
}
