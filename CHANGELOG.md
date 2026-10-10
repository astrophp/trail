# Changelog

All notable changes to Trail are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Trail follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v0.1.0

The first release. Requires PHP 8.3 or newer, Laravel 12 or 13 and `laravel/ai` 1.1 or newer.

### Added

**Recording**

- Capture from the Laravel AI SDK's events alone: no middleware, trait or wrapper on your agents.
  Every listener is guarded, so an error inside Trail is reported and never fails an AI call.
- Agent runs, plain and streamed, with their model steps, tool calls, sub-agents (recorded under
  the tool call that started them, at any depth), embeddings (inside a tool or on their own),
  provider failover (one trace, with the failed attempt kept), and runs that pause for tool
  approval. A prompt queued with `->queue()` is recorded by the worker that runs it.
- Real timing, token usage including cache and reasoning tokens, the provider and the model that
  answered, and failure details classified as rate limited, provider overloaded, provider
  connection, insufficient credits, tool error, exception or abandoned.
- The conversation and the user of runs by agents that remember conversations. Only the user's id
  and type are stored.
- Anything Trail does not have is stored as `null` and shown as Not captured, Not reported,
  Pending, Unpriced, Partial or Incomplete, never as zero.
- One row is written when a run starts and the rest is written in one batch at a flush point: the
  end of a request, command or job, between jobs in a worker, the end of an Octane request, task or
  tick, or `Trail::flush()`.
- Runs that never reported an end are shown as Incomplete after `stale_after` seconds (`3600` by
  default).

**Payloads and control**

- Redaction of secrets by key (`redaction.keys`) and by pattern (`redaction.patterns`), with
  defaults for bearer tokens, HTTP Basic credentials, URL passwords, common provider API keys, AWS
  keys, JSON web tokens and private key blocks.
- Truncation of strings (`capture.max_length`), a switch for storing no payloads at all
  (`capture.enabled`) and one for not reading the agent's instructions (`capture.system_prompt`).
- Sampling (`trail.sampling`), `Trail::filter()` to choose runs in code and `Trail::withoutRecording()`
  to leave a block of code out.
- `php artisan trail:pause` and `trail:resume` to stop and start recording in every process that shares your default cache store.

**Cost**

- An estimated cost for each step, embedding and run, from list prices in `trail.pricing` (85
  models across seven provider drivers), found by exact id or, for dated and `-latest` variants,
  by the listed id they extend.
- Prices you save in the dashboard override the config. A cost is frozen when the run is recorded
  and is never repriced.

**Storage**

- Six tables, prefixed `trail_`, created by migrations that load from the package. The schema is
  fixed from this release: a later change to it ships as a new migration.
- SQLite, MySQL and Postgres, on your default connection or on one chosen with
  `trail.storage.connection` (`TRAIL_DB_CONNECTION`).
- Per-run summaries of the models and tools used, kept as each run is written.

**Dashboard**

- Served from your application at `/trail` (`trail.path`, `trail.domain`), with its compiled
  files inlined in the page, so there is nothing to publish or build.
- Overview: activity, error rate, latency, estimated cost and what needs attention, with the
  models ranked for the range.
- Traces: a filterable list, side-by-side comparison, bookmarks and CSV export, and an inspector
  with the execution tree, timing and the evidence for each step.
- Conversations as readable transcripts, and Agents with reliability, latency and cost per agent.
- A command palette on ⌘K or Ctrl K: go to a page, copy the link or switch the theme, or find a run,
  a conversation or an agent by text or id.
- Keyboard shortcuts: `?` lists them. `g` then a letter goes to a page; on lists `/` searches, `j`
  and `k` move between rows, `[` and `]` change the page; on a run `j`, `k` and `g` then `b` step
  and go back.
- Usage & cost: breakdowns by model, provider and agent, price management, a spend projection and
  CSV export.
- Access control with the `viewTrail` gate (open in `local`), `Trail::auth()`, an optional guard,
  configurable middleware, and switches for the dashboard (`TRAIL_DASHBOARD_ENABLED`) and for Trail
  (`TRAIL_ENABLED`).

**Commands**

- `trail:install`, `trail:prune`, `trail:sweep`, `trail:clear`, `trail:pause` and `trail:resume`.
  None is scheduled for you.

**Testing**

- `Trail::fake()`, an in-memory store with `assertRecorded()`, `assertNotRecorded()`,
  `assertSpanRecorded()`, `assertSpanNotRecorded()`, `assertRecordedCount()` and
  `assertNothingRecorded()`.

**Documentation**

- Guides for installation, configuration, access, what is recorded, payloads, cost, operations,
  testing and known limits, in `docs/`.

### Known limits

See [Known limits](docs/limits.md). In short: the SDK's title call and cached embeddings fire no
events and are not recorded; a run that resumes a tool-approval pause is a separate trace; several
SQLite writers can lose a trace; costs are estimates at base list prices.
