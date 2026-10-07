// The JSON the dashboard API returns, as docs/api.md describes it: snake_case,
// exactly as sent. api/contract.test.ts checks these types against the output
// of the PHP resources.

import type { TimeRangePreset } from '@/lib/time-range'

export type Status =
    'running' | 'completed' | 'failed' | 'incomplete' | 'awaiting_approval'

export type IssueKind =
    | 'rate_limited'
    | 'provider_overloaded'
    | 'provider_connection'
    | 'insufficient_credits'
    | 'tool_error'
    | 'exception'
    | 'abandoned'

export type CostState =
    'estimated' | 'partial' | 'unpriced' | 'pending' | 'not_captured'

export type UsageState = 'reported' | 'pending' | 'not_reported'

/**
 * What a run cost, and why. The amount is a number when something was priced,
 * `null` when nothing was, and either while the run is still running.
 */
export type Cost =
    | { state: 'estimated' | 'partial'; amount: number }
    | { state: 'unpriced' | 'not_captured'; amount: null }
    | { state: 'pending'; amount: number | null }

/** Each count is `null` on its own when it was not reported. */
export type Usage = {
    state: UsageState
    input_tokens: number | null
    output_tokens: number | null
    cache_read_tokens: number | null
    cache_write_tokens: number | null
    reasoning_tokens: number | null
    total_tokens: number | null
}

/** `name` and `email` are `null` when the user can no longer be resolved. */
export type User = {
    id: string
    type: string
    name: string | null
    email: string | null
}

/** One run, as every endpoint returns it. Dates are ISO 8601 in UTC. */
export type Trace = {
    id: string
    type: 'agent' | 'embedding'
    name: string
    agent_class: string | null
    status: Status
    issue_kind: IssueKind | null
    streamed: boolean
    recovered: boolean
    child_failed: boolean
    provider: string | null
    model: string | null
    duration_ms: number | null
    usage: Usage
    cost: Cost
    span_count: number
    prompt_excerpt: string | null
    response_excerpt: string | null
    conversation_id: string | null
    user: User | null
    bookmarked: boolean
    started_at: string
    ended_at: string | null
}

export type { TimeRangePreset }

/** The range a response used; `preset` is `null` for an explicit one. */
export type Range = {
    preset: TimeRangePreset | null
    from: string
    to: string
}

export type Pagination = {
    page: number
    per_page: number
    total: number
    last_page: number
}

export type StatusCounts = Record<'all' | Status, number>

export type Meta = {
    app: { name: string; environment: string; timezone: string }
    version: string | null
    recording: 'enabled' | 'paused' | 'disabled' | null
    stale_after: number
    traces: { any: boolean; running: number }
    filters: {
        agents: string[]
        providers: string[]
        models: { provider: string; model: string }[]
    }
}

export type MetaResponse = {
    data: Meta
    range: Range
}

export type TraceListResponse = {
    data: Trace[]
    pagination: Pagination
    range: Range
    status_counts: StatusCounts
    slow_threshold_ms: number | null
}
