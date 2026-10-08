import { AttemptLabel } from '@/components/telemetry/attempt-label'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Attempt label',
    specimens: [
        {
            name: 'First of two',
            Component: () => <AttemptLabel attempt={1} of={2} />,
        },
        {
            name: 'Second of two',
            Component: () => <AttemptLabel attempt={2} of={2} />,
        },
        {
            name: 'One attempt (renders nothing)',
            Component: () => (
                <div className="text-ui text-muted-foreground">
                    [<AttemptLabel attempt={1} of={1} />]
                </div>
            ),
        },
    ],
}
