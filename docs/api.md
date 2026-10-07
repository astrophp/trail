# Dashboard API

The dashboard reads and writes through a JSON API under `<path>/api` (by default `/trail/api`).
It is the dashboard's own API: it sits behind the same access check as the page, it is not
versioned, and it may change between releases. This page is the contract every endpoint follows.

## Requests and responses

- Every response Trail produces is JSON, whatever the request's `Accept` header says.
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
