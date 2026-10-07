import { IssueLabel } from '@/components/telemetry/issue-label'
import type { IssueKind } from '@/api/types'
import type { CatalogueEntry } from '@/catalogue/types'

const kinds: IssueKind[] = [
    'rate_limited',
    'provider_overloaded',
    'provider_connection',
    'insufficient_credits',
    'tool_error',
    'exception',
    'abandoned',
]

export const catalogue: CatalogueEntry = {
    title: 'Issue label',
    specimens: kinds.map((kind) => ({
        name: kind,
        Component: () => <IssueLabel kind={kind} />,
    })),
}
