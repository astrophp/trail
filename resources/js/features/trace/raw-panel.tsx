import type { Span } from '@/api/types'
import { Notice } from '@/components/patterns/notice'
import { PayloadViewer } from '@/components/patterns/payload-viewer'

type RawPanelProps = { span: Span }

/**
 * The span exactly as the API returned it. When parts of it were cut short, one notice says so; the
 * paths are in the JSON below it.
 */
export function RawPanel({ span }: RawPanelProps) {
    const cut = span.truncated || Object.keys(span.truncated_paths).length > 0

    return (
        <div className="flex flex-col gap-3">
            {cut ? (
                <Notice
                    tone="warning"
                    title="Some values in this span were cut short when stored"
                />
            ) : null}
            <PayloadViewer value={span} label="span" />
        </div>
    )
}
