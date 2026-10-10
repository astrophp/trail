# Trail

[![tests](https://github.com/astrophp/trail/actions/workflows/tests.yml/badge.svg)](https://github.com/astrophp/trail/actions/workflows/tests.yml)

Trail records what your [Laravel AI SDK](https://github.com/laravel/ai) agents did (runs, model
steps, tool calls, sub-agents, tokens and estimated cost) into your application's own database.
It serves a dashboard for those runs from your application, in the way Horizon and Telescope do. It
is a package, not a hosted service: Trail stores recorded runs in your database and sends them to no
service. Errors inside Trail go to your application's exception handler.

## Requirements

- PHP 8.3 or newer
- Laravel 12 or 13
- `laravel/ai` 1.1 or newer
- SQLite, MySQL or Postgres

## Install

```bash
composer require astrophp/trail
php artisan migrate
```

That is all. Trail listens to the SDK's events, so your agents and tools need no change. Run an
agent as you already do, then open `/trail` in your application. In the `local` environment anyone
can open the dashboard.

To try it without calling a provider, use the SDK's own fake. In `php artisan tinker`, with
`App\Ai\Agents\SupportAgent` standing in for one of your agents:

<!-- sample: readme.fake -->
```php
App\Ai\Agents\SupportAgent::fake(['Hello from a fake provider.']);
(new App\Ai\Agents\SupportAgent)->prompt('Hi');
```

The run appears in the Traces list. A fake reports no token usage, so its tokens show as Not
reported and its cost as Not captured.

### Before production

Outside `local`, nobody can open the dashboard until you say who can. Publish the service provider:

```bash
php artisan trail:install
```

Then list who may pass in the `viewTrail` gate of `app/Providers/TrailServiceProvider.php`. See
[Access](docs/access.md). A request that fails the check gets a 403.

Trail deletes nothing until you run `php artisan trail:prune`, which removes traces older than 14
days by default. It never schedules its commands itself. See [Operations](docs/operations.md).

## What it does

- Records agent runs, including streamed and queued ones, with their model steps, tool calls,
  sub-agents, embeddings, provider failover and tool-approval pauses, in one trace per run.
- Records real timing, token usage (cache and reasoning tokens included) and failure details, and
  shows anything it could not capture as missing (`Not captured`, `Pending`, `Unpriced`,
  `Incomplete`), never as zero.
- Estimates cost from a price table in `config/trail.php`. You can edit prices in the dashboard. A
  cost is an estimate, frozen when the run is recorded. It is not billing.
- Redacts secrets and cuts long strings before storing anything, and can sample runs, filter them
  in code, or pause recording from the command line.
- Serves a dashboard: an overview, a filterable list of runs with comparison, bookmarks and CSV
  export, the execution tree of each run, conversations as transcripts, per-agent reliability,
  latency and cost, and a usage and cost page with price management.
- Stores everything in your own database, on a connection you can choose.

## What it does not do

- It is not billing, and its costs are estimates from list prices. The default prices use base
  rates and do not model long-context surcharges.
- It records agent runs and embeddings. It does not record classification, images, audio,
  transcription or reranking.
- It records only what the SDK reports through events. The extra model call that titles a new
  conversation, and embeddings served from the SDK's cache, are not recorded.
- A run that resumes a tool-approval pause is a separate trace from the run that paused. They are
  not linked.
- It does not find every secret. Redaction catches keys and recognisable token shapes, not a
  password written in a sentence.
- It has no users or accounts of its own, and no hosted version: access uses your application's gate.
- With SQLite and several writers, a trace can be lost. See [Operations](docs/operations.md#sqlite-and-concurrent-writers).

The full list is in [Known limits](docs/limits.md).

## Documentation

- [Installation and upgrading](docs/installation.md)
- [Configuration](docs/configuration.md): every key, its environment variable and default
- [Access](docs/access.md): the `viewTrail` gate, `Trail::auth()`, guard, middleware, path and domain
- [What is recorded](docs/recording.md), and how to read what the dashboard shows
- [Payloads and sampling](docs/payloads.md): redaction, truncation, `Trail::filter()`, `Trail::withoutRecording()`
- [Cost](docs/cost.md): how prices are found and why a cost is an estimate
- [Operations](docs/operations.md): the artisan commands, scheduling, queues, Octane and storage
- [Testing your application](docs/testing.md): `Trail::fake()`
- [Known limits](docs/limits.md)
- [Roadmap](ROADMAP.md) and [changelog](CHANGELOG.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the commands, and the workbench app that records
scripted agent runs.

## Security

Please see [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
