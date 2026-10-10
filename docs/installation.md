# Installation and upgrading

## Requirements

- PHP 8.3 or newer
- Laravel 12 or 13
- `laravel/ai` 1.1 or newer
- A database Trail can write to: SQLite, MySQL or Postgres. The test suite runs on all three.

## Install

```bash
composer require astrophp/trail
php artisan migrate
```

That is the whole installation. Trail's service provider is discovered by Laravel, listens to the
SDK's events from then on, and needs no change to your agents or tools. The dashboard is at
`/trail`; in the `local` environment anyone can open it ([Access](access.md)).

The migrations are loaded from the package. They are not copied into your `database/migrations`
directory, and `php artisan migrate` runs them with your own. They create six tables:

| Table | Holds |
| -- | -- |
| `trail_traces` | One row per recorded run |
| `trail_spans` | The agent, step, tool and embedding spans of each run |
| `trail_trace_models` | A per-run summary of the models its steps used |
| `trail_trace_tools` | A per-run summary of the tools it called |
| `trail_prices` | The model prices saved from the dashboard |
| `trail_bookmarks` | The runs bookmarked in the dashboard |

To keep these tables on another connection than your default one, set `TRAIL_DB_CONNECTION`
**before** you migrate ([Storage](operations.md#storage)).

## Before production: `trail:install`

Outside the `local` environment nobody can open the dashboard until you say who can. For that,
publish the service provider:

```bash
php artisan trail:install
```

It publishes two files and registers the provider:

- `config/trail.php`, the configuration ([Configuration](configuration.md)). Also available
  alone with `php artisan vendor:publish --tag=trail-config`.
- `app/Providers/TrailServiceProvider.php`, where you define the `viewTrail` gate
  ([Access](access.md)). Also available alone with `php artisan vendor:publish --tag=trail-provider`.
- A line in `bootstrap/providers.php` for that provider. If Trail cannot add it, the command says
  so and you add `App\Providers\TrailServiceProvider::class` to your provider list yourself.

`--force` overwrites files that already exist. Without it, an existing file is left alone.

Recording does not need any of this. It works as soon as the tables exist.

## Upgrading

```bash
composer update astrophp/trail
php artisan migrate
```

- **The schema is fixed from `v0.1.0`.** The tables above are not edited in place from that tag
  on: a change to the schema ships as a new migration, which `php artisan migrate` runs. After an
  upgrade, run it.
- **The dashboard needs no publish step.** Its compiled files ship inside the package.
- **Your published config is not updated.** A section you published (`capture`, `redaction`,
  `dashboard`, `storage`) replaces the package's whole section, so a key a later version adds to it
  is missing from your copy. Compare your `config/trail.php` with the package's after an upgrade,
  and read the [changelog](../CHANGELOG.md).
- If you cache configuration or routes, rebuild the caches after upgrading.
- The dashboard's JSON API is for the dashboard itself. It is not versioned and may change between
  releases.

## Checking that it works

Run an agent the way your application already does, then open the dashboard. A run appears in the
Traces list. If you want to check without calling a provider, the SDK's own fake is enough:

```bash
php artisan tinker
```

```php
App\Ai\Agents\SupportAgent::fake(['Hello from a fake provider.']);
(new App\Ai\Agents\SupportAgent)->prompt('Hi');
```

`SupportAgent` is your own agent class (`php artisan make:agent SupportAgent` creates one). A fake
reports no token usage, so its run shows usage as Not reported and its cost as Not captured; see
[What is recorded](recording.md#reading-the-dashboard).

If nothing appears, see [Operations](operations.md#when-nothing-is-recorded).
