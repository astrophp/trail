# Roadmap

This page lists what the first release contains and what is planned after it. What comes after is
not a commitment to dates. For the detail of a release, see the [changelog](CHANGELOG.md); for what
Trail does not do today, see [Known limits](docs/limits.md).

## v0.1.0 — first release

**Recording**

- Zero-setup capture of Laravel AI SDK runs: agents, model steps, tool calls, sub-agents,
  embeddings and provider failover.
- Real timing, token usage (including cache and reasoning tokens) and failure details for
  every step.
- Estimated cost from a configurable per-model price table.
- Redaction and truncation of captured payloads, sampling, and a filter callback.
- Storage in your application's database: SQLite, MySQL or Postgres.

**Dashboard**

- Overview: activity, error rate, latency, estimated cost, and what needs attention.
- Traces: filterable list, side-by-side comparison, bookmarks and export.
- Trace inspector: the execution tree with timing, and the evidence for each step.
- Conversations: multi-turn sessions as a readable transcript.
- Agents: reliability, latency and cost per agent.
- Usage & cost: breakdowns by model, provider and agent, price management, and a spend
  projection.
- Command palette: ⌘K to jump to a page or find a run, a conversation or an agent.

**Operations**

- Access control through a gate, like Horizon and Telescope, with an optional auth guard.
- Switches to turn off recording or the dashboard.
- Artisan commands to install, prune, sweep, clear, pause and resume.

**Testing and documentation**

- `Trail::fake()` and its assertions for your own tests.
- User documentation in `docs/`.

## After v0.1.0

These are ideas, not promises.

- More run types: classification, images, audio, transcription and reranking.
- Linking runs that pause for tool approval to the run that resumes them, which are separate
  traces today.
- Saved views shared between dashboard users.
- Additional storage drivers and OpenTelemetry export.

Ideas and feedback are welcome in [issues](https://github.com/astrophp/trail/issues).
