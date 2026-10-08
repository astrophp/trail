# Dashboard API

The dashboard reads and writes through a JSON API under `<path>/api` (by default `/trail/api`).
It is the dashboard's own API: it sits behind the same access check as the page, it is not
versioned, and it may change between releases. This page is the contract every endpoint follows.

## Requests and responses

- Every response Trail produces is JSON, whatever the request's `Accept` header says, except the
  file `GET /api/traces/export` sends. Its errors are JSON like any other.
- Keys are `snake_case`.
- A successful response is an object with the result under `data`. Anything that describes the
  result rather than being it sits next to `data`, never inside it: `pagination`, `range`, and
  whatever the endpoint adds (for example `status_counts`).
- Each entity has one shape. A trace looks the same in a list, on its own page and inside another
  resource; an endpoint never returns a cut-down variant.

## Values

| Kind | Format |
| -- | -- |
| Date and time | ISO 8601 in UTC with milliseconds: `2026-01-01T12:00:00.000Z` |
| Duration | Milliseconds as a number, possibly fractional: `duration_ms` |
| Money | US dollars as a number, as stored (up to 10 decimal places). The client formats it and never adds amounts up |
| Count | Integer. A count is the one place where `0` is a real answer |
| Enum | The stored lowercase value: `completed`, `rate_limited` |

## Values that were not captured

A value Trail does not have is `null`. It is never `0`, an empty string or a guess.

Where the reason matters, the value travels as an object with a `state` beside it, so the client
shows the reason without working it out:

- **Cost** is `{ "amount": number|null, "state": … }`. `estimated`: every span that reported usage
  was priced. `partial`: some were not, and the amount covers only the priced ones. `unpriced`:
  none were, and the amount is `null`. `pending`: the run is still running, and the amount is what
  has been recorded so far. `not_captured`: no usage was reported, so there was nothing to price.
- **Usage** is `{ "state": …, "input_tokens": …, … }`. `reported`: the provider reported at least
  one count. `pending`: the run is still running. `not_reported`: it finished without any count.
  Each count is `null` on its own when it was not reported.

A span's cost has the same states except `partial`: a span is priced whole, so it is `estimated`,
`unpriced`, `pending` or `not_captured`. Only step and embedding spans bill. An agent span and a
tool span never carry usage, so their `usage` and `cost` are `null`, not a state.

A running run's usage and cost are `pending`. They carry what has been recorded so far, which is
not a final figure and can still grow. A span that finished inside a running run reports its own
final state, and a span that is still running is `pending` itself.

A duration has no state of its own: it is `null` while the run is running and, on a finished run,
when it was not captured. The `status` beside it says which.

## Status

`status` is one of `running`, `completed`, `failed`, `incomplete`, `awaiting_approval`.

A run still marked running after `stale_after` seconds is reported as `incomplete`, with the issue
kind `abandoned`, by every endpoint: in resources, in counts and in filters. The API never returns
the stored status of such a run.

## Time range

Endpoints that read recorded runs take a time range and filter on when a run started:

- `range`: `1h`, `24h` or `7d`, ending now. The default is `24h`.
- or `from` and `to`: ISO 8601 date-times, both required, `from` before `to`. A value without an
  offset is read in the application's timezone; an offset's `+` must be percent-encoded.

The range includes `from` and excludes `to`. Sending `range` together with `from` or `to` is an
error. The response repeats the range it used:

```json
"range": { "preset": "24h", "from": "2026-01-01T12:00:00.000Z", "to": "2026-01-02T12:00:00.000Z" }
```

`preset` is `null` for an explicit range.

## Pagination

No endpoint returns an unbounded list. A list takes `page` (from 1) and `per_page` (default 25).
`per_page` is clamped to between 1 and 100 rather than rejected. A page past the end is an empty
`data` with the same totals.

```json
"pagination": { "page": 1, "per_page": 25, "total": 240, "last_page": 10 }
```

## Sorting

`sort` names one field; a leading `-` sorts descending (`sort=-duration`). Rows without a value
for the field come last in both directions.

## Errors

An error is a JSON object with a `message`. A validation error (422) adds `errors`, a list of
messages per parameter:

```json
{ "message": "The range must be 1h, 24h or 7d.", "errors": { "range": ["The range must be 1h, 24h or 7d."] } }
```

| Status | When |
| -- | -- |
| 403 | The access check refused the request |
| 404 | No such endpoint or resource, or the dashboard is switched off |
| 419 | A write without a valid CSRF token. The application's own `web` middleware answers this one, so it is JSON only when the request accepts JSON, as the dashboard's requests do |
| 422 | A parameter is invalid. Invalid input is never a 500 |

## Users

A user is `{ "id", "type", "name", "email" }`. `id` and `type` are what was recorded; `name` and
`email` are `null` when the user can no longer be resolved, and the client falls back to the id.
A run without a user has `null` in place of the object.

## The trace

One run, as every endpoint returns it:

```json
{
  "id": "0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30",
  "type": "agent",
  "name": "SupportAssistant",
  "agent_class": "App\\Ai\\Agents\\SupportAssistant",
  "status": "completed",
  "issue_kind": null,
  "streamed": false,
  "recovered": false,
  "child_failed": false,
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "duration_ms": 1840.412,
  "usage": {
    "state": "reported",
    "input_tokens": 1200,
    "output_tokens": 310,
    "cache_read_tokens": null,
    "cache_write_tokens": null,
    "reasoning_tokens": null,
    "total_tokens": 1510
  },
  "cost": { "state": "estimated", "amount": 0.00825 },
  "span_count": 4,
  "prompt_excerpt": "Where is my order?",
  "response_excerpt": "Your order shipped on Monday.",
  "conversation_id": null,
  "user": { "id": "7", "type": "App\\Models\\User", "name": "Ada", "email": "ada@example.com" },
  "bookmarked": false,
  "started_at": "2026-01-01T12:00:00.000Z",
  "ended_at": "2026-01-01T12:00:01.840Z"
}
```

- `type` is `agent`, or `embedding` for embeddings generated outside an agent run.
- `agent_class` is `null` for an anonymous agent and for an embedding run.
- `provider` and `model` are those the run asked for on its last attempt. A run can use more.
- `input_tokens` counts everything sent, cached tokens included, and `output_tokens` includes
  reasoning tokens. `total_tokens` is the sum of whichever of the two was reported, and `null`
  when neither was.
- `issue_kind` is `rate_limited`, `provider_overloaded`, `provider_connection`,
  `insufficient_credits`, `tool_error`, `exception`, `abandoned` or `null`.

## The conversation

The runs that carry the same conversation id, as every endpoint returns them. A run in a
conversation is one of its turns. A run without a conversation id is not in any conversation.

```json
{
  "id": "conversation-1",
  "turns": { "all": 5, "completed": 3, "failed": 1, "incomplete": 0, "running": 0, "awaiting_approval": 1 },
  "agents": ["AccountAssistant", "TicketTriage"],
  "agent_count": 2,
  "users": [{ "id": "7", "type": "App\\Models\\User", "name": "Ada", "email": "ada@example.com" }],
  "user_count": 1,
  "usage": {
    "state": "reported",
    "input_tokens": 5200,
    "output_tokens": 1310,
    "cache_read_tokens": null,
    "cache_write_tokens": null,
    "reasoning_tokens": null,
    "total_tokens": 6510
  },
  "cost": { "state": "estimated", "amount": 0.0412 },
  "prompt_excerpt": "And the invoice?",
  "first_activity_at": "2026-01-01T12:00:00.000Z",
  "last_activity_at": "2026-01-02T09:30:00.000Z"
}
```

- Every figure covers all of the conversation's turns, including those outside the time range of
  the request that listed it.
- `turns` has the keys of a list's `status_counts`, counted by the status each turn shows, so a
  stale running turn is `incomplete` and is not `running`.
- `agents` are the distinct names of the turns, sorted by name, at most 5. `users` are the distinct
  users (a type and an id) of the turns that have one, at most 3, in the shape of
  [Users](#users). `agent_count` and `user_count` are the real numbers of distinct names and users,
  counted by the database, so they can be above the length of the list. A conversation whose turns
  have no user has `users` empty and `user_count` `0`.
- Each count of `usage` is the sum of the turns that reported it, and `null` when none did. Its
  `state` is `pending` when a turn is running, else `reported` when any count is not `null`, else
  `not_reported`. `total_tokens` follows the rule of a run's.
- `cost.amount` is the sum of the turns' cost, added by the database, and `null` when no turn has
  one. Its `state` follows a run's, from the number of spans that reported usage and could not be
  priced across the turns: `pending` when a turn is running, else `estimated`, `partial`,
  `unpriced` or `not_captured`. A `pending` amount is what has been recorded so far; it is not
  final and can still grow.
- `first_activity_at` is when the earliest turn started and `last_activity_at` when the latest one
  did. Only a turn starting counts as activity: neither is the end of a turn.
- `prompt_excerpt` is that of the turn that started last, and of the one with the greatest id when
  two started together. It is `null` when that turn has none.
- `id` is the id as stored. Ids, agent names and users are grouped, counted and ordered as the
  database compares text: MySQL by default ignores case and accents, so there ids that differ only
  so are one conversation (shown with the spelling of its latest turn), and `agent_count`,
  `user_count` and the order of `agents` follow that comparison. Elsewhere they differ.

## The span

One span of a run: an agent's prompt, a model call, a tool call or an embeddings call. Every type
has this one shape.

```json
{
  "id": "0199c2f4-6a3f-7a10-8c2e-5b7d9e0f1a23",
  "parent_id": "0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30",
  "type": "step",
  "name": "step",
  "agent_class": null,
  "status": "failed",
  "issue_kind": "rate_limited",
  "attempt": 1,
  "sequence": 4,
  "step_number": 1,
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "responding_model": null,
  "duration_ms": 1.137,
  "offset_ms": 31,
  "started_at": "2026-01-01T12:00:00.031Z",
  "ended_at": "2026-01-01T12:00:00.032Z",
  "usage": {
    "state": "not_reported",
    "input_tokens": null,
    "output_tokens": null,
    "cache_read_tokens": null,
    "cache_write_tokens": null,
    "reasoning_tokens": null,
    "total_tokens": null
  },
  "cost": { "state": "not_captured", "amount": null },
  "error": {
    "class": "Laravel\\Ai\\Exceptions\\RateLimitedException",
    "message": "Application rate limited by AI provider [anthropic].",
    "source": "step",
    "http_status": 429
  },
  "input": { "messages": [], "messages_offset": 2, "options": null },
  "output": null,
  "metadata": null,
  "redacted": false,
  "truncated": true,
  "truncated_paths": { "input.messages.0.content": 12000 }
}
```

- `type` is `agent`, `step`, `tool` or `embedding`. Steps and tools are children of their agent's
  span. An agent that another agent delegated to is the child of the tool span that started it. An
  embeddings call made inside a tool is the child of that tool span. An embeddings call made on its
  own is the whole run, and its span has no parent.
- `sequence` is the order the spans were recorded in. `attempt` is the attempt of the run the span
  belongs to (a provider failover starts the next one), and `step_number` counts a model's steps
  from 0 within an attempt, so it starts again on every attempt. It is `null` on the other types.
- `status` and `issue_kind` follow the same stale rule as a run's, span by span: an open span of an
  abandoned run is `incomplete` and `abandoned`, while a span that finished keeps its status.
- `agent_class` is set on agent spans only, and is `null` for an anonymous agent. `provider` and
  `model` are those the step or call asked for. `responding_model` is the model the provider says
  answered. It is `null` on a step that did not complete and on every step of a streamed run, which
  the SDK does not tell it for. It is never copied from `model`.
- `duration_ms` is as recorded. It is `null` while the span runs and when it was not captured, and
  is never worked out from the dates. `offset_ms` is the span's own start minus the run's start,
  in milliseconds, signed and not clamped. It is `0` for the run's own agent span, and a span whose
  start was worked out after the fact could in principle come out before the run's.
- `usage` and `cost` are `null` on agent and tool spans (see above). On a step or an embedding they
  are the same objects a run has, in the span's own state.
- `error` is `{ "class", "message", "source", "http_status" }`, each part `null` when not recorded,
  and `null` itself when the span did not fail. `source` is `step`, `tool` or `run`. A failed
  attempt of a failover keeps its error on the step that failed. A sub-agent that failed has its
  error on its own agent span and on the step, while the tool span that started it is completed,
  with a result that starts with `Agent failed:`, and the run is flagged `child_failed`.
- `input` and `output` are the payloads as capture stored them, decoded from JSON: `null` when none
  was stored (payload capture is off, or the span has none yet). They are not reshaped or scanned
  again. A payload part that was redacted or cut short is marked in place, and `redacted` and
  `truncated` say that the span has any. Which keys a type stores today:

  | Type | `input` | `output` |
  | -- | -- | -- |
  | agent | `prompt`, `system` (`null` when the system prompt is not captured), `attachments` (only when there are any) | `text`, and `structured` for a structured response |
  | step | `messages`, `messages_offset`, `options` | `text`, `tool_calls`, `finish_reason`, and `structured` for structured output |
  | tool | `arguments` | `result` |
  | embedding | `count`, `dimensions` | `count` |

  A step sends the whole history again, so it stores only the messages the previous step of its
  attempt did not send. `messages_offset` is how many messages come before the stored ones, which
  the earlier steps of the attempt already hold; `0` means `messages` is the whole history. A step
  recorded without its start event has `messages` and `options` as `null` and no
  `messages_offset`. An embeddings call stores how many inputs it had, never the texts, and
  `dimensions` is `null` for the model's own size.
- `metadata` is the rest of what capture kept about the span, or `null` when nothing is left. The
  list of cut paths is not in it: it is `truncated_paths`.
- `truncated_paths` maps the path of each cut part of a payload (`input.messages.0.content`) to its
  length in characters before it was cut. It is an object, `{}` when empty, and only the first
  paths are kept for a span with very many. `truncated` can be `true` while it is empty, when
  something was dropped that has no original length.

## Endpoints

### `GET /api/meta`

What the dashboard needs around every page. Takes a time range, which applies to `filters` only.

```json
{
  "data": {
    "app": { "name": "Laravel", "environment": "local", "timezone": "UTC" },
    "version": "0.1.0",
    "recording": "enabled",
    "stale_after": 3600,
    "traces": { "any": true, "running": 2 },
    "filters": {
      "agents": ["SupportAssistant", "TicketTriage"],
      "providers": ["anthropic", "openai"],
      "models": [{ "provider": "anthropic", "model": "claude-sonnet-4-5" }]
    }
  },
  "range": { "preset": "24h", "from": "…", "to": "…" }
}
```

- `version` is `null` when the installed version cannot be read.
- `recording` is `enabled` or `paused`, or `null` when the pause flag cannot be read.
- `traces.any` is whether any run has ever been recorded, in any range. `traces.running` is the
  number of runs in flight now, in any range, without stale ones.
- `filters` lists what was observed in the range, sorted by name, at most 100 of each. `agents`
  are the names of runs; `providers` and `models` come from every step of a run, not only the
  first, since one run can use several models.

### `GET /api/conversations`

The conversations in a time range: recorded runs grouped by their conversation id, filtered,
sorted and paginated. A run without a conversation id (or with an empty one) is not a
conversation and is never listed, not even as a group of its own.

The time range picks the conversations: one is in the view when at least one of its turns started
in the range, and a conversation none of whose turns started there is absent. Nothing else about
a conversation is bounded by the range. It is counted whole, so every figure of a row covers all
of its turns, and the filters below describe the whole conversation too: a turn outside the range
can satisfy one, so a row never contradicts the filter that selected it.

| Parameter | Keeps the conversations |
| -- | -- |
| `agent` | with a turn by a run of that name |
| `user_id`, `user_type` | with a turn of that user. `user_type` narrows `user_id` and cannot be sent alone |
| `failed` | with at least one turn that is failed or incomplete, a stale running turn included |
| `search` | whose id, or the user id or prompt excerpt of one of whose turns, contains the text (at most 200 characters), whatever its case. Outside ASCII, case is matched as the database matches it |

`failed` is a switch, as on the traces list: `1` or `true` applies it, `0`, `false` or leaving it
out does not. Filters combine with *and*.

`sort` is `last_activity`, `turns` or `cost`; the default is `-last_activity`. The sort by cost
puts conversations without one last in both directions, and a tie is broken by the conversation
id in the direction of the sort, so a page never repeats or skips a conversation.

```json
{
  "data": [{ "id": "…" }],
  "pagination": { "page": 1, "per_page": 25, "total": 12, "last_page": 1 },
  "range": { "preset": "24h", "from": "…", "to": "…" }
}
```

Each item is the conversation of [The conversation](#the-conversation). The response is read in a
fixed number of queries whatever the size of the page, plus one lookup of the users for each user
type on it.

### `GET /api/traces`

The recorded runs in a time range, filtered, sorted and paginated.

| Parameter | Keeps the runs |
| -- | -- |
| `status` | with that status |
| `agent` | with that name |
| `provider`, `model` | that used it in any step, not only the first. Sent together, one step must match both |
| `conversation` | of that conversation id |
| `user_id`, `user_type` | of that user. `user_type` narrows `user_id` and cannot be sent alone |
| `issue_kind` | with that issue kind |
| `streamed`, `recovered`, `child_failed` | with that flag set |
| `unpriced` | with at least one span that reported usage and could not be priced |
| `slow` | whose duration is at or above the 95th percentile of the runs in the time range |
| `bookmarked` | that are bookmarked |
| `search` | whose id, name, provider, model, prompt excerpt, conversation id or user id contains the text (at most 200 characters), whatever its case. Outside ASCII, case is matched as the database matches it |

`streamed`, `recovered`, `child_failed`, `unpriced`, `slow` and `bookmarked` are switches: `1` or
`true` applies the filter, `0`, `false` or leaving it out does not. Filters combine with *and*.

`sort` is `started_at`, `duration`, `cost` or `agent`; the default is `-started_at`.

```json
{
  "data": [{ "id": "…" }],
  "pagination": { "page": 1, "per_page": 25, "total": 37, "last_page": 2 },
  "range": { "preset": "24h", "from": "…", "to": "…" },
  "status_counts": { "all": 52, "completed": 37, "failed": 9, "incomplete": 3, "running": 2, "awaiting_approval": 1 },
  "slow_threshold_ms": null
}
```

- `status_counts` counts the runs that pass every filter except `status`, so the counts describe
  the same view as the rows whichever status is selected.
- `slow_threshold_ms` is the duration `slow` compared against. It is `null` when `slow` is not
  applied, and when no run in the range has a duration, in which case `slow` matches nothing.

### `GET /api/traces/export`

The runs of the list as a CSV file: the same time range, filters and sort as `GET /api/traces`,
read by the list's own query, so a run in the file is the run the list shows, in the same order.

It takes every parameter of the list except `page` and `per_page`, which it ignores, and one of
its own:

| Parameter | Keeps the runs |
| -- | -- |
| `ids` | whose id is in this list of at most 100 run ids, separated by commas with no spaces (a space would be part of an id), each at most 64 characters, none empty. Anything else is a 422. They are still limited to the range and the filters, and keep the list's order, not the order of `ids`. An id outside the view is simply absent from the file |

An invalid parameter is a 422 as for the list, decided before the first byte of the file is sent.
`ids` is not a parameter of the list.

The file has one header row, then one row for each run, in these columns:

| Column | Value |
| -- | -- |
| `id`, `name`, `type`, `agent_class` | as in the list |
| `status`, `issue_kind` | as the list shows them: a stale running run is `incomplete` and `abandoned` |
| `streamed`, `recovered`, `child_failed`, `bookmarked` | `true` or `false` |
| `provider`, `model` | as in the list |
| `duration_ms` | milliseconds, possibly fractional |
| `usage_state` | `reported`, `pending` or `not_reported` |
| `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `reasoning_tokens`, `total_tokens` | counts |
| `cost_state` | `estimated`, `partial`, `unpriced`, `pending` or `not_captured` |
| `cost_usd` | US dollars as a plain decimal, never in exponent notation: `0.0000000001`, not `1.0E-10`. For a `pending` run it is what has been recorded so far |
| `span_count` | the number of spans |
| `conversation_id` | as in the list |
| `user_id`, `user_type`, `user_name`, `user_email` | the run's user. `user_name` and `user_email` are empty when the user can no longer be resolved |
| `started_at`, `ended_at` | ISO 8601 in UTC with milliseconds, as everywhere in the API |
| `prompt_excerpt`, `response_excerpt` | as in the list |

- A value that was not captured is an **empty cell**. It is never `0`: a `0` in the file is a count
  or an amount that was recorded. `usage_state` and `cost_state` say why a figure is missing or
  not final (`pending`, `partial`, `unpriced`, `not_reported`, `not_captured`), so a reader never
  has to guess from a blank.
- A file holds at most 10,000 runs, the first ones in the list's order. The response says so in
  three headers, sent before the file: `X-Trail-Export-Rows` is the number of rows the export set
  out to write, `X-Trail-Export-Total` is the number of runs in the view, and
  `X-Trail-Export-Truncated` is `true` when the total is above the limit and `false` otherwise.
  Narrow the range or the filters to get the rest. When `ids` is sent, both counts are those of the
  selection.
- The file is streamed in chunks of 500 runs, so a large export does not need the memory of the
  file. The response is `text/csv; charset=UTF-8`, an attachment named
  `trail-traces-YYYYMMDD-HHMMSS.csv` (UTC), and carries `Cache-Control: no-store` and
  `X-Content-Type-Options: nosniff`. Streaming works only if nothing in front of PHP buffers the
  response: the endpoint sends `X-Accel-Buffering: no` and flushes each chunk.
- The encoding is UTF-8 and the file starts with a byte-order mark, so a spreadsheet reads it as
  UTF-8. Lines end with `\r\n`. A cell that holds a comma, a double quote, a carriage return or a
  line feed is wrapped in double quotes, with its own double quotes doubled (RFC 4180); a backslash
  is nothing special.
- Names, prompts and responses come from user input. A text cell that starts with `=`, `+`, `-`,
  `@`, a tab, a carriage return or a line feed, or with spaces, tabs, line breaks or no-break
  spaces followed by `=`, `+`, `-` or `@`, is prefixed with a single quote `'`, so a spreadsheet
  shows it instead of running it as a formula. The numbers, booleans and timestamps Trail writes
  are never prefixed.
- Cells are plain text. A spreadsheet may still reformat a value that looks like a number or a
  date, for example an id such as `1E10`. `total_tokens` is, as in the list, the sum of whichever
  of the input and output tokens was reported.
- An empty view is a 200 with the header row alone.
- What is guaranteed about failures: an error decided before the file starts (403, 404, 422) is
  JSON, and no part of a file is sent with it. A failure after the file has started cannot change
  the status or the headers: the connection ends early and the file is short.
- What is guaranteed about consistency: the export reads the view in chunks while runs may still be
  recorded, finish, turn stale or be pruned. A run can therefore appear twice or be missing when
  the view changes during the export. A view over a finished time range, with nothing recorded
  into it, is stable.
- The route is registered before `/api/traces/{id}`, so `export` is never read as a run's id. A
  run whose id is literally `export` cannot be opened through the detail endpoint.

### `GET /api/traces/{id}`

Everything the run's page needs in one response.

```json
{
  "data": {
    "trace": { "id": "0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30" },
    "detail": {
      "error": {
        "class": "Laravel\\Ai\\Exceptions\\RateLimitedException",
        "message": "Application rate limited by AI provider [anthropic].",
        "source": "run",
        "http_status": 429
      },
      "pending_approvals": [
        {
          "tool_call_id": "toolu_02", "tool": "refund_order",
          "arguments": { "order": 1042 }, "reason": "Moves money"
        }
      ],
      "resolved_tool_call_ids": ["toolu_01"]
    },
    "spans": [{ "id": "…" }],
    "usage": {
      "totals": {
        "usage": { "state": "reported" },
        "cost": { "state": "estimated", "amount": 0.00825 }
      },
      "rows": [
        {
          "span_id": "…", "agent_span_id": "…", "type": "step", "name": "step",
          "attempt": 1, "step_number": 0, "provider": "anthropic", "model": "claude-sonnet-4-5",
          "usage": { "state": "reported" },
          "cost": { "state": "estimated", "amount": 0.00825 }
        }
      ],
      "agents": [
        {
          "span_id": "…", "name": "SupportAssistant",
          "usage": { "state": "reported" },
          "cost": { "state": "estimated", "amount": 0.00825 }
        }
      ]
    },
    "coverage": {
      "timing": { "state": "captured", "captured": 4, "expected": 4, "reason": null },
      "responding_model": { "state": "captured", "captured": 1, "expected": 1, "reason": null },
      "usage": { "state": "captured", "captured": 1, "expected": 1, "reason": null },
      "cost": { "state": "captured", "captured": 1, "expected": 1, "reason": null },
      "system_prompt": { "state": "captured", "captured": 1, "expected": 1, "reason": null },
      "payloads": { "state": "captured", "captured": 4, "expected": 4, "reason": null }
    }
  },
  "span_limit": { "limit": 2000, "total": 4, "truncated": false }
}
```

(Abbreviated: a `usage` object and a span have the shapes above.)

- `trace` is the run exactly as the list returns it. It keeps one shape, so a row of the list never
  carries the error message, which can be 10,000 characters long, or the run's metadata. They
  travel beside the run, in `detail`.
- `detail.error` is the full error of the run, in the shape of a span's `error`, and `null` when
  the run recorded neither an error class nor a message.
- `detail.pending_approvals` lists the tool calls a run that is `awaiting_approval` waits for.
  `arguments` and `reason` are `null` when they were not stored: with payload capture off, only
  the call and the tool are kept. `detail.resolved_tool_call_ids` are the tool calls a run that
  resumed a pause settled.
  Both are read from the run's metadata and are `[]` when it holds none.
- `spans` are the spans of the run in recording order, up to the span limit.
- `usage` is summed here, so the client never adds tokens or money. `totals` are the run's own and
  equal `trace.usage` and `trace.cost`. `rows` has one row for each step and embedding span
  returned, in order, with the same `usage` and `cost` as the span. `agent_span_id` is the nearest
  ancestor that is an agent span among those returned, and `null` when there is none: an embeddings
  call made on its own has none, and neither has a span whose parents are not in the response.
  `agents` has one entry for each agent span returned, with the subtotal of the rows that belong to
  that agent. A delegated agent's rows are its own and are not added to the agent that delegated,
  so the subtotals never count a span twice and add up to the total when every row has an agent.
  A subtotal can be `partial`.
- `coverage` says how much of what a run should have recorded was recorded, counted over the spans
  returned. Each item is `{ "state", "captured", "expected", "reason" }`. `state` is `captured`
  when every expected value is there, `partial` when some are, `not_captured` when none is, and
  `not_applicable` when nothing was expected. `reason` is `null` unless something is missing.

  | Item | Expected of | Captured when | `reason` for a gap |
  | -- | -- | -- | -- |
  | `timing` | every span that is not running | `duration_ms` is not `null` | `unfinished` when every span without one stopped short (`incomplete`), else `not_reported` |
  | `responding_model` | every completed step | `responding_model` is not `null` | `streamed` for a streamed run, else `not_reported` |
  | `usage` | every completed step and embedding | the provider reported a count | `not_reported` |
  | `cost` | every step and embedding that is not running and reported usage (a running one is `pending`) | it was priced | `no_price` |
  | `system_prompt` | every agent span | a system prompt was stored | `not_stored` |
  | `payloads` | every span | an input or an output was stored | `not_stored` |

- `span_limit` describes `spans`. A response carries at most `limit` spans, the first ones in
  recording order. `truncated` is `true` when the run has more, and `total` is how many it has.
  `usage.rows`, `usage.agents` and `coverage` describe the spans returned only, while
  `usage.totals` and `trace` always describe the whole run.
  The limit counts spans, not bytes: payloads are returned whole as stored, so the size of the
  response follows `trail.capture.max_length`.
- An unknown run is a `404`, and so is an id that cannot be a run's (longer than 64 characters, or
  holding a NUL byte), which does not reach the database.
- A span that is still marked running after `stale_after` seconds is reported `incomplete` and
  `abandoned` span by span, as the run is.

### `GET /api/traces/{id}/neighbours`

The runs listed just before and just after this one in a view of the list, so the run's page can
step through a filtered list without going back to it.

Takes the same parameters as `GET /api/traces`, without `page` and `per_page`: the time range, the
filters and `sort`. Invalid input is the same `422`. `page` and `per_page` are ignored, not
validated.

```json
{ "data": { "previous": "0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30", "next": null } }
```

- `previous` is the run that `GET /api/traces` shows immediately before this one for the same
  parameters, and `next` the one immediately after. `null` means there is none: this run is the
  first or the last of the view. Stepping `next` from the first run of a view visits every run of
  it once, in the list's order, and ends with `null`; `previous` does the same backwards.
- Runs tied on the sorted value keep the list's order, by id in the direction of the sort, and
  runs without a value come last in both directions, as in the list.
- A run that exists but is not in the view (a filter leaves it out, or it started outside the time
  range) answers `{ "previous": null, "next": null }`, not an error.
- An unknown run is a `404`, and so is an id that cannot be a run's (longer than 64 characters,
  holding a NUL byte, or not valid UTF-8), which does not reach the database.
- It never loads the list or counts a position: one read learns whether the run is in the view and
  one read finds each neighbour, three in all whatever the number of runs. A run that is not in the
  view, or an unknown run, takes two. The `slow` filter adds the two reads the list makes for its
  threshold.

### `PUT /api/traces/{id}/bookmark`, `DELETE /api/traces/{id}/bookmark`

Bookmarks the run, or removes its bookmark. These are the API's first writes. Both are
idempotent and answer `200` with the run's bookmark state:

```json
{ "data": { "trace_id": "0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30", "bookmarked": true } }
```

`bookmarked` is `true` after a `PUT` and `false` after a `DELETE`, whether or not the bookmark
was there before.

- An unknown run is a `404` for both methods.
- Bookmarks are shared: a run has at most one, and every dashboard user sees it. Anyone with
  access to the dashboard can remove it, not only the user who added it.
- A bookmark records who added it: the id and type of the authenticated user on the dashboard's
  guard (`trail.guard`), in the form capture stores a run's user, or nulls when nobody is signed
  in, as in the `local` environment without a login. Bookmarking a run that is already bookmarked
  changes nothing: the first bookmark and its user stay.
- A write passes the same access check as a read, so a denied request is a `403` like any other
  endpoint's.
- A write goes through the `web` middleware's request-forgery protection. Send the token in the
  `X-CSRF-TOKEN` header (`csrfToken` in `window.Trail`). A request that protection refuses is a
  `419`.
