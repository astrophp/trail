import { traceSorts } from '@/api/traces'
import { defaultTraceSort } from '@/features/traces/trace-sort'
import { enumParam, intParam } from '@/lib/url-state'

/** What the list keeps in the URL besides the time range. */
export const traceListParams = {
    sort: enumParam(traceSorts, defaultTraceSort),
    page: intParam(1, { min: 1 }),
}
