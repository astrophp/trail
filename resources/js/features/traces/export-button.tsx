import { DownloadIcon } from 'lucide-react'
import { traceExportUrl } from '@/api/traces'
import { traceListApiParams } from '@/api/trace-list-view'
import { Button } from '@/components/ui/button'
import { useTraceList } from '@/features/traces/use-trace-list'

/**
 * A link to the CSV of the view on screen: its range, filters and sort, all the pages. It is a
 * plain download link, so the browser streams the file and nothing is built here.
 */
export function ExportButton({ className }: { className?: string }) {
    const { view } = useTraceList()

    return (
        <Button asChild variant="outline" className={className}>
            <a
                href={traceExportUrl(traceListApiParams(view))}
                download
                title="Export this view as CSV (up to 10,000 runs)"
            >
                <DownloadIcon aria-hidden="true" />
                Export
            </a>
        </Button>
    )
}
