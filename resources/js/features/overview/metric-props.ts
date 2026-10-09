import type { Summary } from '@/api/types'
import type { TimeRangePreset } from '@/lib/time-range'

/** What each figure of the strip is drawn from. */
export type MetricProps = {
    summary: Summary
    /** The previous period's summary; `null` when it holds no runs. */
    previous: Summary | null
    /** The range the summary answers for, which the figure's caption and link follow. */
    range: TimeRangePreset
}
