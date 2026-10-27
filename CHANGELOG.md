# Changelog

All notable changes to Trail are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Trail follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v0.5.0

### Added

- Draw model answers as markdown in the dashboard: an assistant's response in a conversation, and
  the response or text of an agent run or a model step in a run's evidence. Headings, lists,
  task lists, tables, block quotes, code and links are drawn; prompts, instructions, tool
  payloads and structured output are shown as stored, as before.
- A Rendered / Raw switch beside each answer. Raw is the text exactly as stored; the choice
  applies to every answer and is remembered in the browser.
- In a conversation, the prompt and the answer each sit in a container of their own, with a
  header above the message: the prompt lightly tinted with the user's initials and name, the
  answer a white card with the agent, its model and the switch, and the turn's figures at its
  foot. The agent's tool calls sit between them as a compact line, and a tool result stored as
  JSON text can be read as a tree. The column beside the transcript is a stack of cards that
  stays in view while you scroll; its jump list comes first, as a timeline that marks the turn
  you are reading.
- The execution timeline of a run reads like a network waterfall: ticks at the quarters of the
  run, gridlines through every row, bars coloured by the kind of work (agent runs, model steps,
  tools, retrieval, media) with a legend, the start, length and end of a span on hover, and
  connectors between parents and children.

### Security

- Nothing in an answer runs or loads: raw HTML is shown as text, images are never loaded (their
  description and address are shown), and only `http`, `https` and `mailto` links are followed,
  in a new tab, with the address written beside them; any other link is marked as not linked.
  Redaction markers stay highlighted, inside code and tables too.

### Changed

- One look across the dashboard: every card is the same panel, every choice of view (Tree or Raw,
  Rendered or Raw, Volume, Duration or Cost) is the same switch, and a titled payload on the run
  page is one framed block with its switch and copy button in a header bar.
- Pages and panels no longer carry long descriptions. What keeps a figure honest (estimates,
  the time zone, partial data) is in a short line or behind an ⓘ beside the title it qualifies.
- The activity chart on the overview fills the height of the list beside it.
- The dashboard script grows by about 56 KB gzipped (to about 441 KB), mostly for the markdown
  parser.

## v0.4.2 - 2026-10-20

### Fixed

- Store no structured data for a structured-output agent's run or step that has not answered.
  A step that calls tools, an answer that does not decode (blank, prose or cut short), a run that
  pauses for tool approval and a run that the SDK's `Stop` middleware ends early were stored with
  empty structured data, which looked like an empty answer. An answer of `{}` is still stored.
  Laravel AI SDK 1.3.0 gives such runs empty structured data with every provider; earlier versions
  did so with Anthropic.

### Changed

- CI also runs the test suite on exact Laravel AI SDK 1.3.0 on Laravel 12 and 13.
- The release script recognises newer curl's wording for a missing Packagist package.

## v0.4.1

### Fixed

- Pass PHPStan at level max on PHP 8.5: the bounded maps that remember skipped and ambiguous call
  ids are trimmed with `array_slice`, and the trace id prefix query raises its last digit without
  `chr()`. Behaviour is unchanged.
- Make the UTC date test independent of the Carbon version: Carbon before 3.12.0 read dates in the
  timezone of a frozen test clock. Dates in the API were already correct.

### Changed

- CI runs static analysis on PHP 8.4 and 8.5, and the test suite with the lowest dependencies the
  package allows on Laravel 12 and 13.

## v0.4.0

### Added

- Record image generation, text-to-speech audio and transcription calls through the Laravel AI SDK's
  events, as the span types `image`, `audio` and `transcription`. A call made on its own is a trace
  of its own; a call made inside a tool is a span under that tool. Each stores its settings and
  counts (image size, quality and count, the voice and number of characters spoken, the language
  and the seconds of audio transcribed), its texts only when payloads are captured, and never
  image or audio bytes.
- Record their failures as Failed with their own error and duration from the `ImageFailed`,
  `AudioFailed` and `TranscriptionFailed` events of SDK 1.2.2 and later. On earlier versions a
  failed call is left for its caller (Incomplete) or the stale rule, as for classification.
- Filter the runs list, its CSV export and the Boost trace listing by the new root operations.

### Changed

- Image, audio and transcription calls bill: their reported tokens count in a run's totals and are
  priced from the ordinary token rates of their model. No defaults ship for these models, so they
  are Unpriced until you add a price; a call whose provider reports no tokens is Not captured.

### Upgrade

- No new migrations or configuration. Deploy the new version to every process that reads Trail's
  tables before recording these calls: an earlier version cannot read the new span types.

## v0.3.2

### Added

- Record failed embeddings, classification and reranking calls as Failed, with their own error and
  duration, from the failure events Laravel AI SDK 1.2.2 dispatches for each failed attempt. A
  standalone call that fails is now a Failed trace instead of staying Running until the stale rule
  applies, and a call inside a tool keeps its own error instead of becoming Incomplete.

### Changed

- On SDK 1.2.2 and later, a generic provider failover event no longer closes an open embeddings
  call by guessing from its provider and model; the failure event names the call that failed.
  Earlier SDK versions keep the previous behaviour.

### Fixed

- Keep the SDK compatibility tests green on Laravel AI SDK 1.2.2 and 1.2.3, which add failure
  events and attachment support for TypeSafe and OpenRouter classification.

### Upgrade

- No new migrations or configuration. Upgrade `laravel/ai` to 1.2.2 or later to record failed
  calls, and restart long-lived processes.

## v0.3.1

### Added

- Expand the default pricing catalogue from 85 to 173 model IDs across ten providers, including
  Cohere, Jina and DeepSeek, with 14 explicitly priced rerankers. Add current and legacy text and
  embedding models, verified aliases and exact snapshot prices.
- Publish a complete source audit with official links, billing units, verification date,
  introductory-price deadlines and exclusions. Exercise Cohere, Voyage and Jina estimates in
  the offline workbench through the real SDK gateways.

### Fixed

- Correct Claude Sonnet 5.5 cache reads and Groq GPT-OSS 20B cached input rates. Update Gemini
  3.5 Flash estimates for Google's documented routing to Gemini 3.6 Flash.
- Give GPT-4o's May 2024 snapshot and Command R's August 2024 models their distinct exact rates,
  ahead of family-prefix pricing.
- Show reranking unit rates and their independent sources in the price list. Scope missing-input
  warnings and the source column to token prices, so configured rerankers are not called Unpriced.

### Upgrade

- No new migrations. Merge the refreshed `pricing` table into a published `config/trail.php`
  while preserving your own rates, rebuild configuration caches and restart long-lived processes.
  Applications without a published pricing array receive the new defaults automatically.
- Saved dashboard overrides remain in force. New calls and current spend projections use the
  refreshed rates; already recorded costs and Unpriced decisions remain frozen.
- Defaults remain estimates: DeepSeek uses peak pricing, Jina the USD $50 / one billion-token
  package, and Gemini non-audio input rates. Promotions do not expire automatically.

## v0.3.0

### Added

- Capture standalone and nested classification and reranking calls through Laravel AI SDK events.
  Classification preserves Boolean, choice and ordinal answers, probabilities and confidence.
  Reranking preserves original document indexes, provider order, relevance scores and measured usage.
- Exact six-place search-unit storage and independent usage coverage, including missing quantities,
  unknown costs, incomplete calls and historical Not assessed evidence. Tokens and units are never added.
- Explicit reranking billing by input tokens or search units, independent price editing and resets,
  root-operation filters, specialized inspectors, comparison figures, CSV columns and Boost support.
- Bounded capability payloads: 100 items, 1,000 values and 64 KiB shared across input and output,
  redaction before truncation, 1,000-character document snippets and SDK 1.2 attachment descriptors.
- Offline workbench scenarios and CI coverage for exact SDK 1.1.0 and 1.2.0 on Laravel 12 and 13.

### Changed

- Aggregate costs with confirmed missing usage or incomplete capture show Partial when a priced
  subtotal exists. Completed priced and unpriced decisions stay frozen across later writes.
- Spend projections price reranking independently from ordinary token calls, including mixed calls
  on the same model. Generic failover events cannot attribute capability failures to embeddings.

### Upgrade

- Pause recording across the fleet, drain calls, deploy, migrate, rebuild caches and restart workers
  and Octane before resuming. Both new migrations are required. Existing quantities and dollars are
  preserved; old assessment columns stay null. After new operation rows exist, downgrading to
  v0.2.0 is unsupported. Use a forward fix or restore a backup taken before the upgrade.

## v0.2.0

### Added

- Laravel Boost integration with four read-only MCP tools: list recent traces, inspect a trace,
  page through conversation turns, and summarize usage and estimated cost by model, provider or
  agent. Responses are bounded and preserve missing usage and unpriced costs.
- A Boost package guideline and `TRAIL_BOOST_ENABLED` switch. The tools appear automatically when
  Boost is installed; no separate MCP server is needed.

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
