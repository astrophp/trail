import { useState } from 'react'
import { ErrorBoundary } from '@/components/patterns/error-boundary'
import { ErrorState } from '@/components/patterns/error-state'
import { Button } from '@/components/ui/button'
import type { CatalogueEntry } from '@/catalogue/types'

function Crash(): never {
    throw new Error('This specimen crashed on purpose.')
}

function Specimen() {
    const [crashing, setCrashing] = useState(false)

    return (
        <div className="flex flex-col gap-3">
            <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setCrashing(true)}
            >
                Crash the content below
            </Button>
            <ErrorBoundary
                // Changing the key is how a navigation recovers; here the retry does it.
                resetKey={crashing}
                fallback={(error, reset) => (
                    <ErrorState
                        error={error}
                        title="This part could not be shown"
                        onRetry={() => {
                            setCrashing(false)
                            reset()
                        }}
                    />
                )}
            >
                {crashing ? <Crash /> : <p className="text-ui">All is well.</p>}
            </ErrorBoundary>
        </div>
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Error boundary',
    specimens: [
        {
            name: 'Crash it, then try again (the rest of the page stays alive)',
            Component: Specimen,
        },
    ],
}
