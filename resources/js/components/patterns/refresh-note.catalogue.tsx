import { RefreshNote } from '@/components/patterns/refresh-note'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Refresh note',
    specimens: [
        {
            name: 'The last refresh failed and asking goes on',
            Component: () => (
                <RefreshNote refreshing="retrying" failed onRetry={() => {}} />
            ),
        },
        {
            name: 'The last refresh failed and nothing asks again',
            Component: () => (
                <RefreshNote refreshing="final" failed onRetry={() => {}} />
            ),
        },
        {
            name: 'Refreshing stopped after repeated failures',
            Component: () => (
                <RefreshNote refreshing="stopped" failed onRetry={() => {}} />
            ),
        },
        {
            name: 'Nothing to say (renders nothing)',
            Component: () => (
                <RefreshNote
                    refreshing="polling"
                    failed={false}
                    onRetry={() => {}}
                />
            ),
        },
    ],
}
