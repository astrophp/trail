<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/astrophp/trail/main/art/logo-dark.svg">
    <img src="https://raw.githubusercontent.com/astrophp/trail/main/art/logo-light.svg" alt="Trail logo" width="240">
  </picture>
</p>

<p align="center">
  <strong>Observability for the Laravel AI SDK.</strong><br>
  Agent runs recorded in your own database and shown in your own app.
</p>

<p align="center">
  <a href="https://github.com/astrophp/trail/actions/workflows/tests.yml"><img src="https://github.com/astrophp/trail/actions/workflows/tests.yml/badge.svg" alt="tests"></a>
  <a href="https://packagist.org/packages/astrophp/trail"><img src="https://img.shields.io/packagist/v/astrophp/trail" alt="Latest version on Packagist"></a>
  <a href="https://packagist.org/packages/astrophp/trail"><img src="https://img.shields.io/packagist/php-v/astrophp/trail" alt="PHP version"></a>
  <a href="composer.json"><img src="https://img.shields.io/badge/Laravel-12%20%7C%2013-FF2D20?logo=laravel&logoColor=white" alt="Laravel 12 and 13"></a>
  <a href="https://packagist.org/packages/astrophp/trail/stats"><img src="https://img.shields.io/packagist/dt/astrophp/trail" alt="Total downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/astrophp/trail" alt="MIT licence"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#what-it-looks-like">Screenshots</a> ·
  <a href="#what-it-does">What it does</a> ·
  <a href="#what-it-does-not-do">What it does not do</a> ·
  <a href="#documentation">Documentation</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/astrophp/trail/main/art/overview-dark.png">
    <img src="https://raw.githubusercontent.com/astrophp/trail/main/art/overview-light.png" alt="The Trail overview: counts of runs, error rate, average duration and estimated cost, a chart of runs started every five minutes, and a list of what needs attention." width="900">
  </picture>
</p>

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

## What it looks like

These screenshots show runs that Trail recorded from the workbench, the small application in this
repository that runs scripted agents.

<table>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/astrophp/trail/main/art/traces-dark.png">
        <img src="https://raw.githubusercontent.com/astrophp/trail/main/art/traces-light.png" alt="The Traces list: every recorded run with its agent, status, duration, tokens and estimated cost, with filters above it." width="420">
      </picture>
      <br><sub><strong>Traces.</strong> Every run, filterable, with comparison, bookmarks and export.</sub>
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/astrophp/trail/main/art/trace-dark.png">
        <img src="https://raw.githubusercontent.com/astrophp/trail/main/art/trace-light.png" alt="The inspector of one run: an execution tree of model steps, a tool call and a delegated sub-agent with timing bars, and the evidence for the selected step beside it." width="420">
      </picture>
      <br><sub><strong>Trace inspector.</strong> The execution tree of one run with timing, and the evidence for the step you select.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/astrophp/trail/main/art/conversation-dark.png">
        <img src="https://raw.githubusercontent.com/astrophp/trail/main/art/conversation-light.png" alt="A conversation shown as a transcript of several turns between a customer and an assistant." width="420">
      </picture>
      <br><sub><strong>Conversations.</strong> A multi-turn session read as a transcript.</sub>
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/astrophp/trail/main/art/agent-dark.png">
        <img src="https://raw.githubusercontent.com/astrophp/trail/main/art/agent-light.png" alt="The page of one agent: its runs, error rate, latency and cost over the last hour." width="420">
      </picture>
      <br><sub><strong>Agents.</strong> Reliability, latency and cost of one agent.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/astrophp/trail/main/art/usage-dark.png">
        <img src="https://raw.githubusercontent.com/astrophp/trail/main/art/usage-light.png" alt="Usage and cost: a chart of estimated spend over the last hour, a spend projection, and breakdowns by model, provider and agent." width="420">
      </picture>
      <br><sub><strong>Usage &amp; cost.</strong> Estimated spend over time, a projection, and breakdowns by model, provider and agent.</sub>
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/astrophp/trail/main/art/palette-dark.png">
        <img src="https://raw.githubusercontent.com/astrophp/trail/main/art/palette-light.png" alt="The command palette open over the Traces list, with matching runs and agents in separate groups." width="420">
      </picture>
      <br><sub><strong>Command palette.</strong> Press <kbd>⌘K</kbd> or <kbd>Ctrl</kbd> <kbd>K</kbd> to go to a page or find a run, a conversation or an agent.</sub>
    </td>
  </tr>
</table>

## What it does

### Capture

- Records agent runs, including streamed and queued ones, with their model steps, tool calls,
  sub-agents, embeddings, provider failover and tool-approval pauses, in one trace per run.
- Records real timing, token usage (cache and reasoning tokens included) and failure details, and
  shows anything it could not capture as missing (`Not captured`, `Pending`, `Unpriced`,
  `Incomplete`), never as zero.
- Estimates cost from a price table in `config/trail.php`. You can edit prices in the dashboard. A
  cost is an estimate, frozen when the run is recorded. It is not billing.
- Redacts secrets and cuts long strings before storing anything, and can sample runs, filter them
  in code, or pause recording from the command line.
- Stores everything in your own database, on a connection you can choose.

### Dashboard

- Serves a dashboard: an overview, a filterable list of runs with comparison, bookmarks and CSV
  export, the execution tree of each run, conversations as transcripts, per-agent reliability,
  latency and cost, and a usage and cost page with price management.
- Has a command palette and keyboard shortcuts, to move between pages and find a run, a
  conversation or an agent without leaving the keyboard.

### Operations

- Controls who can open the dashboard with a gate, and can switch recording or the dashboard off.
- Ships artisan commands to install, prune, sweep, clear, pause and resume. It never schedules them.
- Gives your own tests `Trail::fake()` and its assertions.

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
