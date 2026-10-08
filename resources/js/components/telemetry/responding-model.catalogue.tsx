import { RespondingModel } from '@/components/telemetry/responding-model'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Responding model',
    specimens: [
        {
            name: 'Differs from the requested model',
            Component: () => (
                <RespondingModel
                    model="claude-sonnet-4-5"
                    responding="claude-sonnet-4-5-20250929"
                />
            ),
        },
        {
            name: 'Same as the requested model (nothing shown)',
            Component: () => (
                <RespondingModel model="gpt-4o" responding="gpt-4o" expected />
            ),
        },
        {
            name: 'Expected and not captured',
            Component: () => (
                <RespondingModel model="gpt-4o" responding={null} expected />
            ),
        },
        {
            name: 'Not expected (nothing shown)',
            Component: () => (
                <RespondingModel model="gpt-4o" responding={null} />
            ),
        },
    ],
}
