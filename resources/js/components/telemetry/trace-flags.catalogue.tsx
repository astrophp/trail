import { TraceFlags } from '@/components/telemetry/trace-flags'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Trace flags',
    specimens: [
        {
            name: 'Recovered',
            Component: () => (
                <TraceFlags trace={{ recovered: true, child_failed: false }} />
            ),
        },
        {
            name: 'Child failed',
            Component: () => (
                <TraceFlags trace={{ recovered: false, child_failed: true }} />
            ),
        },
        {
            name: 'Both',
            Component: () => (
                <TraceFlags trace={{ recovered: true, child_failed: true }} />
            ),
        },
        {
            name: 'Neither (renders nothing)',
            Component: () => (
                <div className="text-ui text-muted-foreground">
                    [
                    <TraceFlags
                        trace={{ recovered: false, child_failed: false }}
                    />
                    ]
                </div>
            ),
        },
    ],
}
