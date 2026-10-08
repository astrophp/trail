// The JSON the dashboard API returns, as docs/api.md describes it: snake_case,
// exactly as sent. api/contract.test.ts checks these types against the output
// of the PHP resources.

import type { JsonObject, JsonValue } from '@/lib/json'
import type { TimeRangePreset } from '@/lib/time-range'

export type { JsonObject, JsonValue } from '@/lib/json'

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

/**
 * One conversation, as the list returns it: the runs that carry one conversation id, whole (every
 * figure covers all of its turns, whatever time range listed it). `agents` and `users` are capped
 * (5 and 3); `agent_count` and `user_count` are the real numbers.
 */
export type Conversation = {
    id: string
    turns: StatusCounts
    agents: string[]
    agent_count: number
    users: User[]
    user_count: number
    usage: Usage
    cost: Cost
    prompt_excerpt: string | null
    first_activity_at: string
    last_activity_at: string
}

export type ConversationCounts = { all: number; failed: number }

export type ConversationListResponse = {
    data: Conversation[]
    pagination: Pagination
    range: Range
    counts: ConversationCounts
}

/** The answer to a bookmark write: the run's bookmark state after it. */
export type BookmarkResponse = {
    data: { trace_id: string; bookmarked: boolean }
}

/** The runs the list shows just before and just after a run, in the view that was asked about. */
export type TraceNeighbours = {
    previous: string | null
    next: string | null
}

export type TraceNeighboursResponse = {
    data: TraceNeighbours
}

export type SpanType = 'agent' | 'step' | 'tool' | 'embedding'

export type ErrorSource = 'step' | 'tool' | 'run'

/**
 * What one span cost. Never `partial`: a span is priced whole. `null` on the
 * spans that do not bill (agents and tools), where `Span.cost` is `null`.
 */
export type SpanCost =
    | { state: 'estimated'; amount: number }
    | { state: 'unpriced' | 'not_captured'; amount: null }
    | { state: 'pending'; amount: number | null }

/** How a run or a span failed. Each part is `null` when it was not recorded. */
export type TraceError = {
    class: string | null
    message: string | null
    source: ErrorSource | null
    http_status: number | null
}

/**
 * One span of a run, in one shape for every type. `usage` and `cost` are `null`
 * on agent and tool spans. `offset_ms` counts from the start of the run and can
 * be negative. `input`, `output` and `metadata` are as stored, and
 * `truncated_paths` maps a cut payload path to its original length.
 */
export type Span = {
    id: string
    parent_id: string | null
    type: SpanType
    name: string
    agent_class: string | null
    status: Status
    issue_kind: IssueKind | null
    attempt: number
    sequence: number
    step_number: number | null
    provider: string | null
    model: string | null
    responding_model: string | null
    duration_ms: number | null
    offset_ms: number
    started_at: string
    ended_at: string | null
    usage: Usage | null
    cost: SpanCost | null
    error: TraceError | null
    input: JsonValue
    output: JsonValue
    metadata: JsonObject | null
    redacted: boolean
    truncated: boolean
    truncated_paths: Record<string, number>
}

/** A tool call the run is waiting on. `arguments` and `reason` are `null` when not stored. */
export type PendingApproval = {
    tool_call_id: string
    tool: string
    arguments: JsonValue
    reason: string | null
}

/** What the page shows beside the run: the run itself never carries these. */
export type TraceDetail = {
    error: TraceError | null
    pending_approvals: PendingApproval[]
    resolved_tool_call_ids: string[]
}

/** One step or embedding that billed, and the agent span it belongs to. */
export type UsageRow = {
    span_id: string
    agent_span_id: string | null
    type: 'step' | 'embedding'
    name: string
    attempt: number
    step_number: number | null
    provider: string | null
    model: string | null
    usage: Usage
    cost: SpanCost
}

/** What one agent span used itself, leaving out the agents it delegated to. */
export type AgentSubtotal = {
    span_id: string
    name: string
    usage: Usage
    cost: Cost
}

/** The totals are the run's; the rows and the subtotals describe the spans returned. */
export type TraceUsageBreakdown = {
    totals: { usage: Usage; cost: Cost }
    rows: UsageRow[]
    agents: AgentSubtotal[]
}

export type CoverageState =
    'captured' | 'partial' | 'not_captured' | 'not_applicable'

export type CoverageReason =
    'unfinished' | 'not_reported' | 'streamed' | 'no_price' | 'not_stored'

/** `reason` is `null` unless something is missing. */
export type CoverageItem = {
    state: CoverageState
    captured: number
    expected: number
    reason: CoverageReason | null
}

export type Coverage = {
    timing: CoverageItem
    responding_model: CoverageItem
    usage: CoverageItem
    cost: CoverageItem
    system_prompt: CoverageItem
    payloads: CoverageItem
}

/** `truncated` is whether the run has more spans than `limit`; `total` counts them all. */
export type SpanLimit = {
    limit: number
    total: number
    truncated: boolean
}

export type TraceDetailResponse = {
    data: {
        trace: Trace
        detail: TraceDetail
        spans: Span[]
        usage: TraceUsageBreakdown
        coverage: Coverage
    }
    span_limit: SpanLimit
}
