import { AgentIcon } from '@/components/telemetry/agent-icon'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Agent icon',
    specimens: [
        { name: 'Agent', Component: () => <AgentIcon type="agent" /> },
        { name: 'Embedding', Component: () => <AgentIcon type="embedding" /> },
    ],
}
