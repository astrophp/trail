import type { Summary } from '@/api/types'
import type { TracesLinker } from '@/api/traces-link'
import type { TimeRangePreset } from '@/lib/time-range'

/** What each figure of the strip is drawn from. */
export type MetricProps = {
    summary: Summary
    /** The previous period's summary; `null` when it holds no runs. */
    previous: Summary | null
    /** The range the summary answers for, which the figure's caption and link follow. */
    range: TimeRangePreset
    /**
     * Builds the link to the traces list for the figure: the range and the figure's own filters,
     * plus whatever the page adds to every link (the agent a page is about).
     */
    link: TracesLinker
}
