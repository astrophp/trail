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

- **Messages** of a turn come with `messages_state`. `stored`: every message the turn exchanged was
  read. `partial`: some were, and `messages_reason` says what is missing. `not_stored`: none could
  be read, because payload capture was off or nothing was recorded, and `messages` is `[]`. A turn
  that is `not_stored` is not an empty conversation.
- **History** is `history_count`, the number of earlier messages left out of a turn. It is `null`,
  never `0`, when it could not be told; `0` means the turn began with nothing before it.

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

The 422 cases of [`GET /api/conversations/transcript`](#get-apiconversationstranscript):

- `limit` is not a whole number.
- More than one of `turn`, `before` and `after` is sent, or the one sent is empty, is not text, or
  cannot be a run's id (longer than 64 characters, holding a NUL byte, or not valid UTF-8).

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

## The summary

What a set of runs adds up to, as every endpoint returns it: the runs of a time range, the runs of
the period before it, and later the runs of one agent. Only the runs that started in the set count.

```json
{
  "runs": { "all": 52, "completed": 37, "failed": 9, "incomplete": 3, "running": 2, "awaiting_approval": 1 },
  "error_rate": { "rate": 0.1836734694, "failed": 9, "finished": 49 },
  "duration": { "average_ms": 1840.412, "p95_ms": 9200, "measured": 49, "not_measured": 3, "p95_minimum": 20 },
  "usage": {
    "state": "pending",
    "input_tokens": 1, "output_tokens": 1, "cache_read_tokens": null, "cache_write_tokens": null,
    "reasoning_tokens": null, "total_tokens": 2
  },
  "usage_coverage": { "reported": 48, "not_reported": 4 },
  "cost": { "state": "pending", "amount": 11.48 },
  "cost_coverage": { "unpriced_runs": 8, "runs_without_amount": 5 }
}
```

- `runs` has the keys of a list's `status_counts`, counted by the status each run shows, so a stale
  running run is `incomplete` and is not `running`. For any range it equals the `status_counts` of
  `GET /api/traces` with no filter.
- `error_rate.finished` is `completed + failed + incomplete`, and `rate` is `failed / finished` as a
  fraction rounded to 10 places. Incomplete runs are in `finished` and not in `failed`: a run that
  stopped without an answer is not known to have failed. Running runs and runs awaiting approval
  are in neither. `rate` is `null`, never `0`, when `finished` is `0`.
- `duration` covers the runs that have a `duration_ms`, whatever their status. `measured` is how
  many have one and `not_measured` how many do not, so `measured + not_measured` is `runs.all`.
  `average_ms` is their mean, rounded to 3 decimals, and `null` when `measured` is `0`. `p95_ms` is
  the nearest-rank 95th percentile of their durations: with `measured` runs ordered by duration, the
  one at rank `ceil(0.95 * measured)`. It is `null` when `measured` is below `p95_minimum`, which is
  `20`: below that the nearest-rank percentile is simply the slowest run.
- Each count of `usage` is the sum of the runs that reported it, and `null` when none did. Its
  `state` is `pending` when `runs.running` is above `0`, else `reported` when any count is not
  `null`, else `not_reported`. `total_tokens` follows the rule of a run's.
  `usage_coverage.reported` is the number of runs with at least one count, and `not_reported` is
  `runs.all - reported`.
- `cost.amount` is the sum of the runs' cost, `null` when no run has one. Its `state` follows a
  run's, from the number of steps across the runs that reported usage and could not be priced:
  `pending` when `runs.running` is above `0` (the amount is what has been recorded so far),
  else `estimated`, `partial`, `unpriced` or `not_captured`.
  `cost_coverage.unpriced_runs` is the number of runs with at least one such step, exactly the runs
  the list keeps with `unpriced=1`, and `runs_without_amount` the number of runs whose cost is `null`.
- Money: in [`GET /api/overview`](#get-apioverview) the amount of the range is the sums of its
  buckets added as floating-point numbers and rounded to 10 decimal places. The amount of the
  previous period is one sum from the database, rounded the same way.

## The agent

An agent is a name under which something started in a time range. Agents are discovered from what
was recorded and are never created. The same shape is returned by the list and by an agent's page.

```json
{
  "name": "SupportAssistant",
  "agent_class": "App\\Ai\\Agents\\SupportAssistant",
  "type": "agent",
  "top_level": {
    "runs": { "all": 52, "completed": 37, "failed": 9, "incomplete": 3, "running": 2, "awaiting_approval": 1 },
    "error_rate": { "rate": 0.1836734694, "failed": 9, "finished": 49 },
    "duration": { "average_ms": 1840.412, "measured": 49, "not_measured": 3 },
    "usage": { "state": "pending", "input_tokens": 1, "output_tokens": 1, "cache_read_tokens": null, "cache_write_tokens": null, "reasoning_tokens": null, "total_tokens": 2 },
    "cost": { "state": "pending", "amount": 11.48 },
    "cost_coverage": { "unpriced_runs": 8, "runs_without_amount": 5 },
    "last_activity_at": "2026-01-01T12:00:00.000Z"
  },
  "delegated": { "all": 12, "failed": 1, "incomplete": 0, "last_activity_at": "2026-01-01T11:00:00.000Z" },
  "last_activity_at": "2026-01-01T12:00:00.000Z",
  "activity": [0, 3, 5, 2]
}
```

An agent is *top level* in a range when it has runs of its own there: a run is a row of the runs
list, and its name is the agent's. It is *delegated* when it has agent spans that have a parent, in
runs that started in the range: another agent started it. A delegated agent span's parent is the
tool span that started it when that span was recorded, and otherwise the span of the run that
delegated; a sub-agent of a sub-agent is delegated too. An agent span without a parent is the run's
own span and is not a delegation. A span counts when the run it is in started in the range, wherever
in the range the span started; a run before the range does not count its spans.

- `top_level` is `null` when the agent has no run of its own in the range. Otherwise its `runs`,
  `error_rate`, `usage`, `cost` and `cost_coverage` follow the rules of [The summary](#the-summary)
  over those runs, the stale rule included, and `duration` is the summary's without the percentile
  keys. `last_activity_at` is when its latest run started.
- `delegated` is `null` when the agent was not delegated to in the range. `all` is the number of its
  agent spans with a parent, `failed` those whose span shows `failed`, and `incomplete` those whose
  span shows `incomplete`: stored so, or still running after `stale_after` seconds, as a span's status
  is for every span. `last_activity_at` is when the latest of them started. A delegated run is a span
  of the run that delegated, so it has no usage, cost or whole-run status of its own, and none is
  given: the cost of a delegated agent's steps is part of the cost of the run that delegated.
- `last_activity_at` is the later of the two, and `null` when the agent has neither in the range.
- `name` is the name as the agent's latest run in the range is spelled (the greatest `started_at`,
  and the greatest id among runs that started together), or as its latest delegated span is spelled
  when it has no run of its own. `agent_class` and `type` (`agent`, or `embedding` for a run of
  embeddings) are that latest run's. For an agent that has only delegated spans, `agent_class` is the
  latest span's and `type` is `agent`.
- Names are grouped as the database compares text, so what is counted for a name is what
  [`GET /api/traces`](#get-apitraces) returns for `agent=<name>`: `top_level.runs` is exactly its
  `status_counts` over the same range. MySQL ignores case and accents by default, so there `Support`,
  `support` and `Suppört` are one agent, spelled as its latest run spells it; SQLite and Postgres
  keep them apart.
- `activity` is the number of the agent's own runs that started in each bucket of the response's
  `buckets`, `0` for a bucket without one. It is all `0` for an agent that has no run of its own in
  the range.

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

### The turn

One turn of a conversation as its transcript returns it: the run, and the messages its spans hold.

```json
{
  "trace": { "id": "…" },
  "detail": { "error": null, "pending_approvals": [], "resolved_tool_call_ids": [] },
  "root_span_id": "0199c2f4-6a3f-7a10-8c2e-5b7d9e0f1a23",
  "shown_attempt": 2,
  "attempts": [
    {
      "attempt": 1, "provider": "openai", "model": "gpt-5", "span_id": "0199c2f4-6a40-7b21-9d3f-6c8e0f1a2b34",
      "error": { "class": "Laravel\\Ai\\Exceptions\\RateLimitedException", "message": "…", "source": "step", "http_status": 429 }
    },
    { "attempt": 2, "provider": "anthropic", "model": "claude-sonnet-4-5", "span_id": "0199c2f4-6a41-7c32-8e40-7d9f1a2b3c45", "error": null }
  ],
  "messages_state": "stored",
  "messages_reason": null,
  "history_count": 4,
  "messages": [{ "part": "prompt" }],
  "span_limit": { "limit": 2000, "total": 3, "truncated": false }
}
```

- `trace` is the run exactly as the list returns it, and `detail` is that of
  [`GET /api/traces/{id}`](#get-apitracesid): the same objects, not a copy that can differ.
- `root_span_id` is the run's own agent span, the one without a parent, and `null` when none was
  read. Without it there is nothing to read: `attempts` and `messages` are `[]`, `shown_attempt` and
  `history_count` are `null`, and `messages_state` is `not_stored`.
- `shown_attempt` is the attempt the messages are read from: the one the run ended on. A provider
  failover starts another attempt that sends the conversation again, so reading all of them would
  show the prompt once for each. The earlier attempts are only listed, in `attempts`.
- `attempts` has one entry for each attempt that has a step or a tool, and the shown one, in
  ascending order. `provider` and `model` are those of the attempt's first step, else `null`.
  `span_id` is the attempt's first failed step or tool, else its first step, else `null`; `error`
  is that span's error in the shape of a span's, else `null`. The list is built from the spans
  that were read, so it is incomplete when `span_limit.truncated` is `true`.
- `messages_state` is `stored`, `partial` or `not_stored`. `messages_reason` is `null` unless the
  state is `partial`, and then the first of these that applies:

  | Reason | The messages are incomplete because |
  | -- | -- |
  | `span_limit` | the run has more spans than the limit, and the rest were not read |
  | `offset_gap` | the stored messages of a step do not start where the step before it ended, or the first step does not start at the beginning of the history, or a step's list was cut and nothing says where, so messages may be missing or where the turn began is not known |
  | `history_rewritten` | a step sent its history again whole, shorter or different from the one before, so only its tail is added to what was read |
  | `history_boundary_unknown` | the first step's last message is neither the user's nor a tool result, so where the turn began is not known and none of that step's messages are returned; or the first step's list of messages was cut and nothing says where, so its last message may not be where the turn began; or the first step was recorded without its messages and the agent has no prompt of its own to say where the turn began |
  | `step_input_missing` | a step was recorded without the messages it sent, and no later step covers them, so a tool result between two steps may be missing; or no step stored anything and the prompt is the agent's own |

- `history_count` is the number of leading messages of the first stored step that were left out
  because they came before this turn: the earlier turns of a remembered conversation, and any
  history given to the agent by hand. It is `null` when it is not known, and `0` when the prompt
  was the first message.
- `span_limit` has the meaning it has on the run's endpoint: `limit`, `total` and `truncated`.

A turn reads its own spans and nothing else. It never refers to another turn: a turn whose first
message is a tool result has no prompt of its own, and nothing in it names any other turn.

## The message

One message of a turn, in the order it was exchanged. Every message has these keys, and a key the
stored message does not have is `null`.

```json
{
  "part": "activity",
  "role": "assistant",
  "content": "Let me check.",
  "structured": null,
  "attachments": null,
  "tool_calls": [
    {
      "id": "toolu_01", "name": "lookup_order", "arguments": { "order": 1042 },
      "link": "linked",
      "span": { "id": "0199c2f4-6a50-7d43-9f51-8e0a2b3c4d56", "status": "completed", "issue_kind": null, "duration_ms": 120.5 },
      "agent": null
    }
  ],
  "tool_results": null,
  "source": { "span_id": "0199c2f4-6a5f-7e54-8062-9f1b3c4d5e67", "path": "input.messages.0", "redacted": false, "truncated": true },
  "truncated_paths": {}
}
```

- `part` is `prompt` (what started the turn), `response` (the answer that ended it) or `activity`
  (everything else the turn exchanged). A turn has a `response` only when it completed and its
  last output asked for no tool: a failed, running or waiting turn ends in `activity`.
- `role` is the stored role string (`user`, `assistant`, `tool_result`), and `null` when the stored
  message has none. A message built from a step's output is `assistant`, and a prompt built from the
  agent's own span is `user`.
- `content`, `structured`, `attachments`, `tool_calls` and `tool_results` are the stored values,
  and `null` when the stored message has no such key. A stored `""` or `[]` stays as stored:
  nothing is trimmed, defaulted or parsed again. A stored message without a role passes through
  with its `content`. For a message built from a step's output, `content` is the output's `text`
  and `finish_reason` is not returned.
- `source` says where the message is stored. `span_id` is the span and `path` the place in it:
  `input.messages.2` is the third of that step's stored messages, which are the ones its attempt
  had not sent yet and not the whole history; `output` is the step's output; `input` is the agent's
  own prompt, used when no step stored the start of the turn. `redacted` and `truncated` are the
  span's own flags: they say that the span has any, not that this message does.
- `truncated_paths` maps each cut part of this message to its length before it was cut, and is
  `{}` when nothing in it was cut. It is the span's own `truncated_paths` for the entries under
  this message, with the path made relative to it. A path matches whole segments, so
  `input.messages.1` never takes the paths of `input.messages.10`. `truncated` can be `true`
  while this is empty, when the span was cut somewhere else or with no length to report.

  | Path in the span | In the message |
  | -- | -- |
  | `input.messages.K.x` | `x` |
  | `output.text` | `content` |
  | `output.tool_calls.i…` | `tool_calls.i…` |
  | `output.structured…` | `structured…` |
  | `input.prompt` (the agent's) | `content` |
  | `input.attachments…` (the agent's) | `attachments…` |

### The tool call

Each entry of a message's `tool_calls`. `id`, `name` and `arguments` are as stored, `null` for a key
the entry does not have. An entry that is not an object is returned as `arguments`, with `id` and
`name` `null`, and is `unlinked`.

- `link` says what became of the call, the first that applies. `linked`: the tool span that ran it
  is known. `awaiting_approval`: the turn is waiting for approval and the call is one of
  `detail.pending_approvals`. `not_started`: the turn is still running and the call is in the model's latest request. `unlinked`: none of these.
- `span` is `{ id, status, issue_kind, duration_ms }` of the tool span, else `null`. Its status is
  the one the API shows, so a tool that was still running when its run was given up on is
  `incomplete`.
- `agent` is the first agent span (by recording order) that the tool span started, else `null`:
  the agent a call delegated to. It has `span_id`, `name`, `agent_class`, `status`, `issue_kind`,
  `provider`, `model`, `duration_ms`, and its own `pending_approvals` and
  `resolved_tool_call_ids`, read as the run's `detail` reads them. A sub-agent that failed has the
  status `failed` here, while the tool span that started it is `completed`. An agent started
  directly by the run, and not by a tool, belongs to no call.

A call is linked to a tool span only when the arguments confirm it, because the SDK records no
call id on a tool span. A tool span is a candidate for a call when it is a direct child of the run,
of the attempt shown, and recorded after the step that asked and before the next step started. For
each tool name, in the order the step asked:

1. The k-th call of that name takes the k-th candidate of that name, if the span stored
   `arguments`, the call has `arguments`, and the two are the same JSON value.
2. A call left over, with `arguments`, takes the one candidate of its name that no call has taken
   and whose arguments are equal. None, or more than one, gives no link.

There is no third rule: a call whose arguments were cut or redacted, or whose tool recorded no
input, is not linked. Nor is a call on a span that was cut somewhere it does not say: one flagged
`truncated` that lists no cut path, or lists as many as the span keeps. Neither is one that only
the order would suggest. The tools of a
delegated agent and those of an earlier attempt are never candidates. Same JSON value means keys
in any order, lists in order, an int equal to the float of the same value (`1` and `1.0`), an empty
object equal to an empty list, `null` different from an absent key, and nothing else coerced.

A call that appears in a stored message takes the link its own request got, by call id, if the id
is a string that occurs in one call only among the turn's steps. A turn whose first message is a
tool result also links the calls it settles, which sit in the history it did not return, to the tools it ran before
its first step: by the same two rules, among the calls whose ids `detail.resolved_tool_call_ids`
names.

### The tool result

Each entry of a message's `tool_results` is `{ id, name, result, span_id }`: the first three as
stored, and `span_id` the span linked to the call with the same id, else `null`.

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

## The price

A price is what a model costs per million tokens, as Trail would estimate a run with it, and where
that comes from. Models are never created: the list holds those named by `trail.pricing`, by a
saved price, and by a step or an embedding that was recorded. The same shape is returned by the
list and by both writes.

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "rates": { "input": 3, "output": 15, "cache_read": 0.3, "cache_write": 3.75 },
  "source": "prefix",
  "via": { "model": "claude-sonnet-4-5", "saved": false },
  "default": {
    "source": "prefix",
    "via": { "model": "claude-sonnet-4-5", "saved": false },
    "rates": { "input": 3, "output": 15, "cache_read": 0.3, "cache_write": 3.75 }
  },
  "observed": true,
  "saved_at": null
}
```

- `rates` is what a run with this model is priced at now, in US dollars per million tokens. All four
  keys are always there, each a number or `null`. `null` is unknown, never free: usage with tokens
  of a kind that has no rate is given no cost at all. `0` is a real rate, a free one.
- `source` says where `rates` comes from. `saved`: a saved price of exactly this provider and model.
  `config`: the `trail.pricing` entry of exactly this id. `prefix`: this id extends a shorter listed
  id with a version suffix (`-latest`, a date, a build number), and the shorter id's rates apply.
  `none`: nothing applies, and all four rates are `null`.
- `via` is `null` unless `source` is `prefix`. Then `model` is the listed id the rates come through
  and `saved` says whether that id's rates are a saved price (`true`) or its config entry (`false`).
- `default` is what would apply if this model's own saved price were removed, which is what a reset
  returns to and what an editor can start from: `source` (`config`, `prefix` or `none`), `via` and
  `rates` as above. The saved prices of other models still count, since a version can resolve through
  one. For a model that is not `saved` it is the same as the price's own `source`, `via` and `rates`.
- A saved price replaces the config entry as a whole. A rate left blank in it is unknown; it does not
  fall back to the config value.
- `observed` is whether a step or an embedding was recorded with exactly this provider and model, as the per-run summary the store keeps when it writes a run has it. A model that only an agent span asked for is not observed, and neither is one used only in a run recorded before that summary existed.
- `saved_at` is when the saved price was last written, as every time in this API, and `null` when the
  model has none.
- Trail is not a billing system: a cost is an estimate, frozen when the run is recorded. Saving or
  resetting a price changes what later runs are priced at and never a cost already recorded. Nothing
  is repriced.

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

### `GET /api/overview`

The summary of a time range, the same summary of the period just before it, and the range cut into
buckets. It takes a time range and nothing else: any other parameter is ignored.

```json
{
  "data": {
    "summary": { "runs": { "all": 52 } },
    "previous": null,
    "series": {
      "bucket": "hour",
      "buckets": [
        {
          "from": "2026-01-01T12:23:00.000Z", "to": "2026-01-01T13:00:00.000Z",
          "full": false, "in_progress": false,
          "runs": { "all": 0, "completed": 0, "failed": 0, "incomplete": 0, "running": 0, "awaiting_approval": 0 },
          "duration": { "average_ms": null, "measured": 0 },
          "cost": { "state": "not_captured", "amount": null },
          "unpriced_runs": 0
        }
      ]
    }
  },
  "range": { "preset": "24h", "from": "…", "to": "…" },
  "previous_range": { "from": "…", "to": "…" }
}
```

- `summary` is [The summary](#the-summary) of the runs that started in the range.
- `previous_range` is the window of the same length that ends where the range starts, `from`
  included and `to` excluded. It has no `preset` and is always present. `previous` is the summary
  of its runs, and `null` when it holds no runs at all, so that nothing is compared with nothing. A
  run that starts exactly where the range starts is in the range, not in the previous window.
- `series.bucket` is the length of a bucket: `5m`, `hour` or `day`. For a preset it is `5m` for
  `1h`, `hour` for `24h` and `day` for `7d`. For an explicit range it follows the range's length:

  | Range | `bucket` | Buckets at most |
  | -- | -- | -- |
  | up to 2 hours | `5m` | 25 |
  | up to 48 hours | `hour` | 49 |
  | up to 92 days | `day` | 94 |

  A longer range is a 422 on `from`: "The range is too long: at most 92 days."
- Buckets follow the clock of the application's timezone (`app.timezone`): a `5m` bucket starts at
  a multiple of 5 minutes, an `hour` bucket on the hour and a `day` bucket at midnight. A `day`
  bucket is a calendar day, so across a clock change one is 23 or 25 hours long, and a range of
  92 times 24 hours that begins late on the day before the clock goes forward touches 94 days.
- The application stores local times, so in the hour a clock is set back two instants share one
  stored time. That hour is a single bucket whatever the unit, longer than its unit: for `5m` and
  `hour` buckets it runs from the start of the first pass to the end of the second, and its runs are
  every run stored with a time in that hour. A range, or a previous window, whose boundary falls
  inside that hour splits its runs by their stored time, as every time range of this API does. When
  the clock skips an hour, `hour` buckets have no bucket for it.
- Every bucket of the range is present, in order and without gaps. `from` and `to` are the part of
  the clock bucket inside the range, `from` included and `to` excluded: the first bucket is cut at
  the range's start and the last at its end. They are the bounds its runs were counted over, so
  `GET /api/traces` with `from` and `to` set to them has the bucket's `runs` as its `status_counts`.
  A range that ends exactly on a bucket edge has no bucket after it, so a `24h` range read on the
  hour has 24 buckets and otherwise 25; a `1h` range has 12 or 13 and a `7d` range 7 or 8.
- `full` is `false` for a bucket cut at either end. `in_progress` is `true` when the current time
  is inside the bucket's clock span, from its start to its end before the range cut it. At most
  one bucket is in progress. It is the last bucket of a range that ends now, no bucket of a range
  that ended before the current clock bucket began, and no bucket of a range that starts in the
  future; the last bucket of a range that ended a few minutes ago can still be in progress, and so
  can one in the middle of a range that ends in the future.
- A bucket has `runs` (the keys of a list's `status_counts`, the stale rule applied), `duration`
  (`average_ms`, `null` when `measured` is `0`, and `measured`), `cost` (the cost of
  [The summary](#the-summary) over the bucket's runs, `pending` when one of them is running) and
  `unpriced_runs`. A bucket without runs has every count `0`, `average_ms` `null` and a `cost` that
  is `not_captured`. There is no percentile and no token count per bucket.
- The `runs` of all the buckets add up to `summary.runs`.
- It is read in one grouped query over the runs, plus one read for each period that has a
  percentile (at most two), whatever the range.

### `GET /api/overview/attention`

The short list of what in a time range someone should look at, each item pointing at its evidence
on the runs list. It takes a time range and nothing else: any other parameter is ignored.

```json
{
  "data": [
    {
      "kind": "failed",
      "count": 13,
      "latest_at": "2026-01-01T12:00:00.000Z",
      "filters": { "status": "failed" },
      "breakdown": [
        { "issue_kind": "rate_limited", "count": 9, "latest_at": "2026-01-01T12:00:00.000Z", "filters": { "status": "failed", "issue_kind": "rate_limited" } }
      ]
    },
    { "kind": "incomplete", "count": 3, "latest_at": "2026-01-01T11:20:00.000Z", "filters": { "status": "incomplete" }, "breakdown": [] }
  ],
  "range": { "preset": "24h", "from": "…", "to": "…" }
}
```

There are six kinds. Each is in `data` at most once, and `data` lists them in this order, most
pressing first. A kind with no run in the range is absent, so a range with nothing to look at is
`"data": []`, which is an answer and not an error.

| `kind` | Counts the runs of the range that | `filters` |
| -- | -- | -- |
| `failed` | show the status `failed` | `{ "status": "failed" }` |
| `incomplete` | show the status `incomplete`, a stale running run included | `{ "status": "incomplete" }` |
| `awaiting_approval` | show the status `awaiting_approval` | `{ "status": "awaiting_approval" }` |
| `child_failed` | completed although a sub-agent failed | `{ "status": "completed", "child_failed": "1" }` |
| `unpriced` | have at least one step that reported usage and could not be priced | `{ "unpriced": "1" }` |
| `recovered` | were recovered by a provider failover | `{ "recovered": "1" }` |

- `count` is a number of runs, and it is never `0`: an item exists only for a count above `0`.
  `GET /api/traces` with the item's `filters` and the same time range has exactly `count` as its
  `pagination.total`. That holds for every item and every breakdown row.
- `filters` maps parameter names of `GET /api/traces` to the strings to send. It is never a URL:
  the client adds the time range.
- The kinds overlap, and a run is counted in each kind it is of. A run that failed and could not be
  priced is in `failed` and in `unpriced`; a run that failed and was recovered by a failover first
  is in `failed` and in `recovered`. A run that failed with a sub-agent that failed is `failed` and
  not `child_failed`, which counts only runs that completed. A running run that is not stale is in
  none of `failed`, `incomplete`, `awaiting_approval` and `child_failed`, and can be in `unpriced`
  or `recovered`, whose counts can therefore still grow while a run is running.
- The stale rule of [Status](#status) applies to every count as the list applies it: a run still
  marked running after `stale_after` seconds is in `incomplete`, and its issue kind is `abandoned`.
  It is not in `failed`.
- `latest_at` is when the latest of those runs started, the greatest `started_at` among them, so a
  run outside the range never moves it. It is `null` only when the stored start time of those runs
  could not be read; the item is still there with its `count`.
- `breakdown` is `[]` for every kind except `failed`. For `failed` it has a row for each issue kind
  that at least one failed run has, ordered by `count` descending and, among equal counts, in the
  order of the issue kinds in [The trace](#the-trace). A row is `{ issue_kind, count, latest_at,
  filters }`, its `filters` those of the item with `issue_kind` added. A failed run without an
  issue kind is in the item's `count` and in no row, since the list has no filter for a missing
  issue kind: the rows can add up to less than `count`, and `failed` can have a `count` and a
  `breakdown` of `[]`.
- It is read in one query over the runs, whatever the range, and no span is read.

### `GET /api/agents`

The agents of a time range: a name under which a run started, or under which an agent span with a
parent started inside a run that did. Takes a time range, `search`, `sort` and pagination.

```json
{
  "data": [ { "name": "SupportAssistant" } ],
  "pagination": { "page": 1, "per_page": 25, "total": 14, "last_page": 1 },
  "range": { "preset": "24h", "from": "…", "to": "…" },
  "buckets": { "bucket": "hour", "edges": [ { "from": "…", "to": "…", "full": true, "in_progress": false } ] },
  "agent_limit": { "limit": 1000, "truncated": false }
}
```

Each item is [The agent](#the-agent).

- `search` keeps the agents whose name contains the text (at most 200 characters), whatever its case,
  as the other lists search. A `%` or `_` in the text is taken literally. The text is matched against
  the names of the runs and of the delegated spans before they are grouped, so on a database whose
  `LIKE` tells apart spellings that its `=` takes for one agent (MySQL: a trailing space, `ß` and `ss`)
  the figures of an agent cover only the spellings that match, and can change with the search term.
- `sort` is `runs` (the agent's `top_level.runs.all`), `name`, `error_rate`, `duration` (the average),
  `cost` (the amount) or `last_activity`, with a leading `-` for descending; the default is `-runs`.
  An agent without the value comes last in both directions: an agent that was only delegated to has
  no top-level figures, an agent with no finished run has no error rate and one with no duration or
  cost has no average or amount. A tie is ordered by `name` in the direction of the sort, so a page
  never repeats or skips an agent. `name` is ordered by the application's own case-insensitive
  comparison of one stored spelling of the agent, which can differ from the database's order that
  `GET /api/traces?sort=agent` uses.
- `buckets` describes the buckets of every agent's `activity`: `bucket` and the edges mean what they
  mean in the series of [`GET /api/overview`](#get-apioverview), and a range over 92 days is the same
  422.
- It is read in four queries whatever the page: the runs of the range grouped by name, the delegated
  agent spans of the range matched to those groups by the database, the latest spelling, class and
  type of the agents on the page, and their runs in each bucket. Merging, sorting and paging are done
  over the grouped rows, of which at most `agent_limit.limit` are read for each of the first two: the
  agents with most runs, and the delegated agents with most spans, a delegated agent whose name has no
  group among the runs read included. `truncated` is `true` when there were more groups than the
  limit in either read, and then `pagination.total` is the number of agents read, not of all that
  exist. It goes wrong in both directions: an agent whose own runs were not read can be listed as one
  that was only delegated to (`top_level` `null`), and an agent whose delegated group was not read has
  `delegated` `null` although it was delegated to.

### `GET /api/agents/show`

One agent for a time range, its summary and series, and what needs a look among its runs.

```json
{
  "data": {
    "agent": { "name": "SupportAssistant" },
    "summary": { "runs": { "all": 52 } },
    "previous": null,
    "series": { "bucket": "hour", "buckets": [] },
    "attention": [ { "kind": "failed", "count": 9, "filters": { "agent": "SupportAssistant", "status": "failed" } } ]
  },
  "range": { "preset": "24h", "from": "…", "to": "…" },
  "previous_range": { "from": "…", "to": "…" }
}
```

- The name travels in the query as `name`, read from the raw query string and not trimmed, since a
  name can start or end with a space and hold a slash, a percent sign or a plus sign (send it
  percent-encoded: a literal `+` is read as a space). A missing name, an empty one, a list, one over
  255 characters, one holding a NUL byte or one that is not valid UTF-8 is a 404 that is answered
  without reading the database, before the range is checked.
- `agent` is the agent for the range, in the shape of [The agent](#the-agent). An agent recorded at
  any time but with nothing in this range is not a 404: it has `top_level` and `delegated` `null`,
  `last_activity_at` `null`, an all-zero `activity`, and the spelling and class of its latest run ever
  (else of its latest delegated span). A name that was never recorded is a 404. Whether it was is
  looked up by its latest run, then by its latest delegated span, which the index on a span's type and
  name finds. Looking up a name that has nothing in the range reads the runs by name without an
  index.
- `summary`, `previous` and `series` are those of [`GET /api/overview`](#get-apioverview) over the
  agent's own runs, with the 95th percentile of its durations: delegated spans are no part of them,
  and `summary.runs` is `agent.top_level.runs`.
- `attention` is that of [`GET /api/overview/attention`](#get-apioverviewattention) over the agent's
  own runs. The `filters` of every item and row carry `agent`, set to the name as `agent` spells it,
  so [`GET /api/traces`](#get-apitraces) with them and the same range returns exactly the item's or
  row's `count`.
- It is read in up to four queries for the agent, one for the overview (and one more for each period
  that has enough runs for a percentile) and one for what needs a look. When the agent has nothing in
  the range, the first two queries find nothing and the lookup of the name adds one or two.

### `GET /api/agents/breakdown`

The models and tools of an agent for a time range. It is its own request because it reads the spans
of every run of the agent. It takes `name` as [`GET /api/agents/show`](#get-apiagentsshow) does, and
the same time range.

```json
{
  "data": {
    "models": [
      {
        "provider": "anthropic", "model": "claude-sonnet-4-5", "steps": 310, "runs": 120,
        "usage": { "state": "reported" }, "cost": { "state": "estimated", "amount": 4.1 },
        "filters": { "agent": "SupportAssistant", "provider": "anthropic", "model": "claude-sonnet-4-5" }
      }
    ],
    "tools": [ { "name": "lookup_order", "calls": 412, "failed": 3, "runs": 180, "filters": { "agent": "SupportAssistant", "tool": "lookup_order" } } ],
    "delegated": { "models": [], "tools": [] }
  },
  "range": { "preset": "24h", "from": "…", "to": "…" },
  "limits": {
    "models": { "limit": 20, "total": 3 },
    "tools": { "limit": 20, "total": 7 },
    "delegated": { "models": { "limit": 20, "total": 0 }, "tools": { "limit": 20, "total": 0 } }
  }
}
```

- `models` and `tools` are read over every span of the agent's own runs that started in the range,
  those of agents it delegated to included. A model's `runs` is the number of distinct runs that have
  any span with that provider and model, an agent span (the run's own or a delegated agent's, which
  record the model they asked for) included, as the runs list's `provider` and `model` filters keep
  them. A span missing either its provider or its model is in no row. `steps` counts the spans that
  called the model: model steps and embeddings calls, the only spans that carry usage. A model that
  only agent spans asked for is still a row, with `steps` `0`, a `usage` that is `not_reported` and a
  `cost` that is `not_captured`. A tool's `calls` counts tool spans, `failed` those that failed, and
  `runs` the distinct runs that called it.
- `GET /api/traces` with a row's `filters` and the same range returns exactly the row's `runs`.
- A model's `usage` and `cost` are sums over its step and embeddings spans, shaped as a run's are:
  `cost` is `partial` when some of those spans reported usage and could not be priced, and `pending`
  while one of them is running (a span still running after `stale_after` seconds is not).
- `delegated.models` and `delegated.tools` are read over the steps, embeddings calls and tools that
  are children of the agent's delegated agent spans, so an embeddings call made by a tool of a
  delegated agent is not in them, nor are the agents that agent delegated to. A delegated model's
  `runs` is the number of distinct runs with such a span: an agent span that asked for the model and
  called it nowhere is not counted. They carry no `filters`: the list cannot filter on what happened
  inside a delegated run, so none of their counts can be reproduced there.
- Models are ordered by `runs`, most first, then by provider, then by model; tools by `runs`, then by
  name. Each list holds at most the `limit` of 20 rows; `limits` says how many there are.
- An agent recorded but with nothing in the range has empty lists and totals of `0`. A name that was
  never recorded is a 404.
- It is read in the lookup of the agent's name (one or two queries when it has something in the
  range) and four queries, one for each list; an agent with nothing in the range is not read for
  models and tools at all. Looking up a name that has nothing in the range reads the runs by name
  without an index.

### `GET /api/usage`

The tokens and money of a time range: the summary of its runs, and how much of what was used could
be counted and priced. It takes a time range and nothing else: any other parameter is ignored.

```json
{
  "data": {
    "summary": { "runs": { "all": 52 } },
    "coverage": { "steps": 1310, "reported_steps": 1290, "unpriced_steps": 11, "unpriced_tokens": 24800 }
  },
  "range": { "preset": "24h", "from": "…", "to": "…" }
}
```

- `summary` is [The summary](#the-summary) of the runs that started in the range, read as
  [`GET /api/overview`](#get-apioverview) reads it: for any range it is exactly the overview's
  `data.summary`, and a range over 92 days is the same 422.
- `coverage` counts the steps of those runs, in the models of the per-run summary. `steps` is the
  steps and embeddings calls recorded, `reported_steps` those that reported any token count, and
  `unpriced_steps` those that reported usage and could not be priced. `unpriced_tokens` is the input
  and output tokens of the unpriced steps added up. Every step counts, one recorded without its
  provider or its model included. Coverage is counted in steps and tokens and never as a share of money.
- The three step counts are `0` for a range with no step. `unpriced_tokens` is `0` when there is no
  unpriced step, and `null`, never `0`, when there are unpriced steps and none of them reported input
  or output tokens (cache and reasoning tokens are not counted in it).
- Usage is read from a per-run summary the store keeps when it writes a run, so a run recorded before
  that summary existed has no steps in `coverage`.
- It is read in the overview's queries and one more: the overview's grouped read, its percentile
  reads when it makes them, and one read of the summaries of the runs of the range.

### `GET /api/usage/breakdown`

What the runs of a time range used, by model, by provider or by agent. Takes a time range, `by`,
`sort` and pagination.

```json
{
  "data": [
    {
      "provider": "anthropic", "model": "claude-sonnet-4-5", "steps": 310, "runs": 120,
      "usage": { "state": "reported", "input_tokens": 650500, "output_tokens": 136500, "cache_read_tokens": 90000, "cache_write_tokens": null, "reasoning_tokens": null, "total_tokens": 787000 },
      "cost": { "state": "partial", "amount": 3.7603 },
      "coverage": { "reported_steps": 300, "unpriced_steps": 4, "unpriced_tokens": 9100 },
      "filters": { "provider": "anthropic", "model": "claude-sonnet-4-5" }
    }
  ],
  "by": "model",
  "pagination": { "page": 1, "per_page": 25, "total": 7, "last_page": 1 },
  "row_limit": { "limit": 1000, "truncated": false },
  "range": { "preset": "24h", "from": "…", "to": "…" }
}
```

- `by` is `model` (the default), `provider` or `agent`; anything else is a 422 on `by`. A row of
  `model` has `provider` and `model`, a row of `provider` has `provider` and no `model`, and a row of
  `agent` has `agent` and neither. Every row has `steps`, `runs`, `usage`, `cost`, `coverage` and
  `filters`.
- `steps` counts the steps and embeddings calls, the only spans that carry usage. `usage` and `cost`
  are their sums, shaped as a run's are: a count nobody reported is `null`, `cost` is `partial` when
  some steps that reported usage could not be priced (the amount covers the others), `unpriced` with
  an amount of `null`, never `0`, when none could be, and `not_captured` when no usage was reported.
  A rate of `0` is a price: the amount is `0` and the state `estimated`.
  `coverage` is `reported_steps`, `unpriced_steps` and `unpriced_tokens` of the row, the last by the
  rule of [`GET /api/usage`](#get-apiusage).
- A row is `pending` in `usage` and `cost` while one of its steps is still running (the amount is
  what has been recorded so far). A step still running after `stale_after` seconds is not running,
  and a run that long is `incomplete` and not pending, as everywhere in the API.
- `by=model` has a row for each provider and model that a step, an embeddings call or an agent span
  recorded, as [`GET /api/agents/breakdown`](#get-apiagentsbreakdown) has them for every agent. A
  model that only an agent span asked for is a row with `steps` `0`, a `usage` that is `not_reported`
  and a `cost` that is `not_captured`. A step recorded without its provider or its model is in no
  `model` row, and a step without a provider is in no `provider` row; the totals of
  [`GET /api/usage`](#get-apiusage) still count it. `by=provider` has a row for each provider, a step
  without a model included.
- `by=agent` has a row for each name under which a run started in the range, grouped as the database
  compares text, and spelled as one of the spellings of the group (on MySQL, where `Support` and
  `support` are one agent, that need not be the spelling [`GET /api/agents`](#get-apiagents) gives).
  Its `runs`, `usage` and `cost` are that agent's `top_level.runs.all`, `top_level.usage` and `top_level.cost` there, and
  its `steps` and `coverage` are those of the steps of its runs, the delegated agents' included. An
  agent whose runs have no step has `steps` `0` and a coverage of zeros. A sub-agent's steps count in
  the agent that delegated.
- `runs` is the number of distinct runs that have a span recorded with the row's provider and model
  (an agent span included), with the row's provider, or under the row's name, so
  [`GET /api/traces`](#get-apitraces) with the row's `filters` and the same range returns exactly
  the row's `runs`, for every row of every view. A database that compares text loosely (MySQL) takes
  `gpt-5` and `GPT-5`, or `Support` and `support`, for one row, and the list takes them for one too.
- `sort` is `cost` (the amount), `tokens` (`usage.total_tokens`), `runs` or `name` (provider and then
  model for `by=model`), with a leading `-` for descending; the default is `-cost`, and anything else
  is a 422 on `sort`. A row without the value comes last in both directions, and a tie is ordered by
  the row's name in the direction of the sort, so a page never repeats or skips a row.
- Sorting and paging are done over the grouped rows, of which at most `row_limit.limit` are read:
  those in most runs. `truncated` is `true` when there were more, and then `pagination.total` is the
  number of rows read, not of all that exist.
- Usage is read from a per-run summary the store keeps when it writes a run, so a run recorded before
  that summary existed is in no `model` or `provider` row and adds no steps to its agent's row.
- It is read in one grouped query whatever the view, the sort and the page.

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
  "range": { "preset": "24h", "from": "…", "to": "…" },
  "counts": { "all": 12, "failed": 3 }
}
```

- `counts` counts the conversations that pass the range and every filter except `failed`, so the
  numbers describe the same view as the rows whichever tab is selected. `failed` is how many of
  them have at least one failed or incomplete turn, a stale running turn included: the conversations
  the `failed` filter keeps. `pagination.total` is one of them, `counts.failed` when `failed` is
  applied and `counts.all` otherwise. Both are integers, `0` for an empty view.

Each item is the conversation of [The conversation](#the-conversation). The response is read in a
fixed number of queries whatever the size of the page, plus one lookup of the users for each user
type on it.

### `GET /api/conversations/transcript`

The messages of one conversation: a window of its turns, oldest first, each with the messages its
spans hold. It is for reading a conversation as the dialogue it was, where the list shows it as a
row and the run's own page shows one run's spans.

| Parameter | Meaning |
| -- | -- |
| `id` | Required. The conversation's id |
| `limit` | How many turns. The default and the most is 10; a whole number outside 1 to 10, however large, is clamped; an empty `limit` is the default; anything else that is not a whole number is a 422 |
| `turn` | A run's id. The window ends at that turn, which it includes: the turn and up to `limit - 1` older ones |
| `before` | A run's id. Up to `limit` turns that started before it, the nearest ones |
| `after` | A run's id. Up to `limit` turns that started after it, the nearest ones |

At most one of `turn`, `before` and `after` is sent, and with none the response is the newest
`limit` turns. A turn is placed by when it started and then by id, and `data.turns` is always in
that order, oldest first, whichever parameter chose the window. A time range, the filters of
`GET /api/traces`, `page` and `per_page` are not parameters of this endpoint and are ignored, as
is any parameter it does not know. Its window is the conversation's own, whole: a turn does not
need to have started in any range.

```json
{
  "data": {
    "conversation": { "id": "support/ada 1042" },
    "turns": [{ "trace": { "id": "…" }, "messages": [{ "part": "prompt" }] }]
  },
  "turn_limit": { "limit": 10, "total": 3, "truncated": false },
  "window": { "older": 0, "newer": 0, "anchor": null }
}
```

- `data.conversation` is the conversation of [The conversation](#the-conversation), over all of its
  turns, as `GET /api/conversations` returns it. Each item of `data.turns` is a turn of
  [The turn](#the-turn), whose `trace` and `detail` are those of the run's own endpoint.
- **The id is in the query, not the path.** A conversation id is whatever the application chose and
  can hold a slash, a dot, a space, a percent sign or any other character, which a path cannot
  carry through every proxy and router. Send it as `encodeURIComponent` encodes it. It is read from
  the raw query string, because the framework's middleware trims the edges of a value and turns an
  empty one into `null`, and a conversation id may start or end with a space. An id that is missing
  or empty, sent more than once as a list, longer than 255 characters, holding a NUL byte or not
  valid UTF-8 is a `404` that does not reach the database, and so is an id with no turns.
  The database matches the id itself: MySQL by default ignores case, so there `Case-Id` finds a
  conversation stored as `case-id`, and `data.conversation.id` is the spelling of its latest turn.
  Use the id the response returns.
- `turn_limit` is `{ limit, total, truncated }`. `limit` is the limit that was applied, `total` is
  the number of turns the conversation has (`data.conversation.turns.all`), and `truncated` is
  `true` when `window.older` or `window.newer` is above zero.
- `window` is `{ older, newer, anchor }`. `older` is how many turns started before the first turn
  returned and `newer` how many started after the last, both counted by the database. When the
  window is empty, which only `before` and `after` can make, `before` has `older` `0` and `newer`
  the total, and `after` the reverse.
- `anchor` is `null`, or `{ param, id, found }`: the parameter that was sent, the id it named and
  whether it is a turn of this conversation. An anchor that is not one (a turn that was pruned, or
  one of another conversation) is not an error: the response is the newest window, and `found` is
  `false`, so a page that opened a turn the retention has since deleted shows the latest turns
  and can say so.
- To follow a turn that is still running, ask for `turn=<its id>&limit=1`: the response has the turn
  as it is now, and the conversation's figures around it, which is what to merge by `trace.id`.
- **What a turn leaves out.** The earlier history of the conversation, which the SDK sends the model
  again on every turn and which belongs to the turns that exchanged it; the earlier attempts of a
  provider failover, which only `attempts` lists; and the inner steps of a sub-agent, which are
  those of its own agent span (on the run's endpoint) and appear here only as the `agent` of the
  call that started it. A tool that a sub-agent ran is not linked to any call of this turn.
- **A turn that starts at a tool result** has no prompt: its first message is the tool result it was
  given, and `history_count` counts what came before. The calls that result settles are linked to
  the tools the turn ran when its `detail.resolved_tool_call_ids` names them. No turn is linked to
  another by anything in this response.
- The response is read in a fixed number of queries whatever the number of turns: eight, plus one
  lookup of the users for each user type, resolved once for the header and the turns together. An
  anchor adds one, and so does a turn with more spans than the limit, to count them. Each turn
  carries at most `span_limit.limit` spans; a turn over it is `partial` with the reason
  `span_limit`, the spans being the first ones in recording order.

Errors: a `404` as above, and a `422` for a `limit` that is not a whole number and for anchors that
are more than one, empty, or cannot be a run's id.

### `GET /api/traces`

The recorded runs in a time range, filtered, sorted and paginated.

| Parameter | Keeps the runs |
| -- | -- |
| `status` | with that status |
| `agent` | with that name |
| `provider`, `model` | that used it in any step, not only the first. Sent together, one step must match both |
| `tool` | that called the tool, by its name: a tool span of that name anywhere in the run, those of agents it delegated to included. Compared as the database compares text |
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

#### `within=conversation`

Takes the turns of the run's own conversation instead of a view of the list, so a page opened
from a conversation's transcript steps through that conversation. The response has the same
shape.

- `previous` is the turn of the conversation that started just before this run and `next` the
  one that started just after it, in the order of the transcript: `started_at` ascending, turns
  that started together by id ascending. `next` is therefore the later turn. Stepping `next` from
  the first turn visits every turn of the conversation once, as `GET /api/conversations/transcript`
  lists them, and ends with `null`; `previous` does the same backwards.
- The conversation is whole. The time range, every filter and `sort` are ignored, not validated:
  a link built for the list may carry them and they change nothing, even when they would leave
  the run out of that view. The conversation is the run's own `conversation_id`; none is sent.
- A run without a conversation answers `{ "previous": null, "next": null }`, as does the only
  turn of a conversation. Runs of other conversations and runs without one are never neighbours.
- Any other value of `within` is a `422` for `within`, in the shape of every validation error.
  An unknown run, and an id that cannot be a run's, are a `404` as without it.
- Three reads at most whatever the length of the conversation: the run, then one row for each
  neighbour. A run without a conversation, or an unknown run, takes one.

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

### `GET /api/prices`

Every model Trail knows and what it is priced at. Takes no time range and no parameters; ones it
does not know are ignored.

```json
{
  "data": [ { "provider": "anthropic", "model": "claude-sonnet-4-5-20250929", "source": "prefix" } ],
  "limit": { "limit": 500, "total": 41, "truncated": false }
}
```

Each item is [The price](#the-price).

- The models are those of `trail.pricing`, the saved prices, and the steps and embeddings recorded.
  Observed models that nothing prices (`source` `none`) come first, then the other observed models,
  then the rest; each group is ordered by provider and then model, compared byte by byte.
- At most `limit.limit` (500) are sent; `total` is how many there are and `truncated` is `true` when
  some are left out.
- It is read in two queries whatever the number of models: the saved prices and the observed models.
  The saved prices are read from the table on every request, not from the copy a long-lived process
  keeps for a minute, so a save made by another worker shows at once.
- If the observed models cannot be read the error is reported and the list is the config models and
  the saved ones. If the saved prices cannot be read the error is reported and config applies: no
  model is `saved`.
- A database that compares text loosely (MySQL) lists one spelling of what it takes for one model:
  models observed as `gpt-5` and `GPT-5` appear once, and the other spelling cannot be priced.

### `PUT /api/prices?provider=…&model=…`

Saves a model's price. The body is a JSON object, sent with a JSON content type, with any of the
four rates, in US dollars per million tokens, and answers `200` with the price as it now resolves
(`source` `saved`):

```json
{ "input": 3.5, "output": 16, "cache_read": "0.35" }
```

```json
{ "data": { "provider": "anthropic", "model": "claude-sonnet-4-5-20250929", "source": "saved" } }
```

- `provider` and `model` travel in the query, read from the raw query string and not trimmed, since a
  model id can start or end with a space and hold a slash, a colon, a percent sign or a plus sign
  (send them percent-encoded: a literal `+` is read as a space). A missing one, an empty one, a list,
  one over 255 characters, one holding a NUL byte or one that is not valid UTF-8 is a 404 that is
  answered without reading the database.
- Only a model in [the list](#get-apiprices) can be saved: no model is ever created. A provider and
  model that are not listed, compared exactly and case-sensitively, are a 404 and write nothing. The
  price is saved with the spelling of the list.
- A body that is not a JSON object (invalid JSON, no content, a list, a string, a number, `null`, or
  a content type that is not JSON) is a 422 with `errors.body`, and nothing is written. `{}` is valid:
  every rate is blank.
- The models are looked up in the saved prices as they are in the table now, not in a copy: a model
  that is listed only through a saved price another worker has since reset is a 404.
- All four rates are written every time: a rate that is absent, `null` or `""` is saved as `NULL`
  (unknown), it does not keep its previous value. All four `NULL` is a valid save, a model that is
  deliberately unpriced. `0` is saved as a free rate.
- A rate is a JSON number that is finite and `0` or more, or text in plain decimal notation
  (`3.75`, not `1e3`, `-1`, `.5` or `+1`); whitespace around a text is ignored, and a text of nothing
  else is blank. Any other value (a boolean, a list, text) is a 422 with
  `errors` keyed by the field, all the invalid fields together, and nothing is written.
- The columns hold six decimal places and nothing above `999999.999999`. A value beyond that is a
  422 on its field, never rounded or cut: what is saved is what was sent.
- A saved price replaces the model's row as a whole, and `saved_at` is the time of every save,
  including one that sends the same rates.
- A database that compares text loosely (MySQL ignores case) can take two spellings the list holds
  for one model. When a price is already saved under another spelling, the write is a 422 on `model`
  that names the saved spelling, and that row is not touched. Where the two spellings are two
  models (SQLite, Postgres) they have a price each.
- Runs that were recorded keep their cost; the next run is priced with the saved price. The process
  that answers the request uses it at once. Another long-lived process (a queue worker) reads saved
  prices again when the ones it holds are more than `PriceBook::REFRESH_SECONDS` (60) seconds old,
  so it can price runs with the previous price for up to a minute.
- The access check and the request-forgery protection are those of the bookmark endpoints: a denied
  request is a `403`, one without a valid token a `419`.

### `DELETE /api/prices?provider=…&model=…`

Removes a model's saved price, and answers `200` with the price as it now resolves: its `default`.

- `provider` and `model` are read, and refused with a 404, as in `PUT`.
- A listed model that has no saved price is a `200` with its price unchanged, so it is idempotent.
- Only the row of exactly that spelling is removed; a row that MySQL takes for the same model under
  another spelling stays.
- Recorded costs and the other processes' copies of the prices are as for `PUT`: a long-lived
  process that prices runs reads the table again when its copy is more than 60 seconds old.
- Access and the request-forgery protection are as for `PUT`.
