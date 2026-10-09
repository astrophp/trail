import { traceExportUrl } from '@/api/traces'
import { traceListApiParams } from '@/api/trace-list-view'
import { ExportLinkButton } from '@/components/patterns/export-link-button'
import { useTraceList } from '@/features/traces/use-trace-list'

/** A link to the CSV of the view on screen: its range, filters and sort, all the pages. */
export function ExportButton({ className }: { className?: string }) {
    const { view } = useTraceList()

    return (
        <ExportLinkButton
            href={traceExportUrl(traceListApiParams(view))}
            title="Export this view as CSV (up to 10,000 runs)"
            className={className}
        >
            Export
        </ExportLinkButton>
    )
}
