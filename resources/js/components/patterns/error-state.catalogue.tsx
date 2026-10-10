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
            name: 'Explained by the caller, with its own button label',
            Component: () => (
                <ErrorState
                    title="Your session has ended"
                    error={null}
                    description="Reload the page to sign in again."
                    retryLabel="Reload"
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
