import { InboxIcon, SearchXIcon, FileQuestionIcon } from 'lucide-react'
import { EmptyState } from '@/components/patterns/empty-state'
import { Button } from '@/components/ui/button'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Empty state',
    specimens: [
        {
            name: 'Nothing yet, with the way to start',
            Component: () => (
                <EmptyState
                    icon={InboxIcon}
                    title="No messages yet"
                    description="Messages you receive show up here."
                >
                    <Button variant="outline" size="sm">
                        Write a message
                    </Button>
                </EmptyState>
            ),
        },
        {
            name: 'No match for the filters',
            Component: () => (
                <EmptyState
                    icon={SearchXIcon}
                    title="No results"
                    description="Nothing matches these filters. Try fewer or broader ones."
                >
                    <Button variant="outline" size="sm">
                        Clear filters
                    </Button>
                </EmptyState>
            ),
        },
        {
            name: 'Title only',
            Component: () => (
                <EmptyState icon={FileQuestionIcon} title="Not found" />
            ),
        },
    ],
}
