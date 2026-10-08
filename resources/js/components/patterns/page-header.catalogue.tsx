import { PageHeader } from '@/components/patterns/page-header'
import { BotIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Page header',
    specimens: [
        { name: 'Title', Component: () => <PageHeader title="Traces" /> },
        {
            name: 'With description',
            Component: () => (
                <PageHeader
                    title="Traces"
                    description="Every recorded run, newest first."
                />
            ),
        },
        {
            name: 'With an icon',
            Component: () => (
                <PageHeader
                    title="SupportAssistant"
                    icon={<BotIcon aria-hidden="true" className="size-5" />}
                />
            ),
        },
        {
            name: 'With actions',
            Component: () => (
                <PageHeader
                    title="Agents"
                    description="What each agent has done."
                >
                    <Button variant="outline">Export</Button>
                </PageHeader>
            ),
        },
    ],
}
