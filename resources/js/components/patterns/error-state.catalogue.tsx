import { ErrorState } from '@/components/patterns/error-state'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Error state',
    specimens: [
        {
            name: 'A failed request: its message and status, and a retry',
            Component: () => (
                <ErrorState
                    title="The list could not be loaded"
                    error={{
                        message: 'The database is unavailable.',
                        status: 500,
                    }}
                    onRetry={() => {}}
                />
            ),
        },
        {
            name: 'The network failed: no response came back',
            Component: () => (
                <ErrorState
                    error={{
                        message: 'The server could not be reached.',
                        status: null,
                    }}
                    onRetry={() => {}}
                />
            ),
        },
        {
            name: 'Anything else that was thrown, without a retry',
            Component: () => <ErrorState error={new Error('boom')} />,
        },
    ],
}
