# Contributing

Thank you for helping with Trail. This page covers how to set the repository up, which commands to
run before you open a pull request, and where the rules for each part of the code live.

Please read the [roadmap](ROADMAP.md) first: it says what Trail is for and what it does not do.
Report security problems privately, as [SECURITY.md](SECURITY.md) describes, and not in an issue.

## Setup

You need PHP 8.3 or newer and Composer for the PHP side, and the Node version in `.nvmrc` (24) with
npm for the dashboard.

```bash
composer install
npm install
```

## Commands

```bash
composer test        # pint --test, phpstan (max), pest
composer lint        # pint (writes)
npm run lint         # eslint + prettier --check
npm run format       # prettier --write + eslint --fix
npm run typecheck    # tsc
npm test             # vitest
npm run build        # resources/js -> dist/app.js + dist/app.css (commit the result)
npm run catalogue    # component catalogue (dev only), http://localhost:5175
scripts/install-test.sh 13   # fresh Laravel app: require, migrate, record (12 or 13; commit first)
```

Run `composer test` for a change to PHP and `npm run lint`, `npm run typecheck` and `npm test` for
a change to the dashboard. Continuous integration runs both, on PHP 8.3, 8.4 and 8.5, Laravel 12 and
13, and on MySQL and Postgres as well as SQLite.

- Each pull request should be independently mergeable and green.
- The default test suites are `tests/Feature` and `tests/Unit`. `tests/Performance` holds opt-in
  measurements that skip unless `TRAIL_MEASURE=1`; read the comment at the top of each file before
  you run one, because they fill throwaway databases with generated rows.
- A test must not depend on the wall clock. If a test sets the application environment to
  `production`, it sets it back before it ends.
- To run the suite against MySQL or Postgres, give it a database the way the workflow file does:
  `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME` and `DB_PASSWORD`. Use a
  throwaway database.

## The compiled dashboard is committed

The dashboard is built by Vite into `dist/app.js` and `dist/app.css`, and the package inlines them
into its Blade layout. People who install Trail do not run a build, so `dist/` is committed.
Rebuild with `npm run build` whenever `resources/js` changes, and commit the result in the same
pull request. CI rebuilds it and fails if the committed files differ.

## The dashboard code

The structure and rules of `resources/js` are in [docs/frontend.md](docs/frontend.md). Read it
before you change anything there. In short: use shadcn/ui primitives and theme tokens, never
hand-roll a primitive shadcn provides, and never hardcode hex or pixel values in components.

### The catalogue

`npm run catalogue` serves a dev-only page of every shared component in its variants and states,
at `http://localhost:5175`. A shared component has a `name.catalogue.tsx` file next to it, and a
test fails when one is missing. See [docs/frontend.md](docs/frontend.md#the-catalogue).

## The dashboard API

The dashboard talks to a JSON API under `<path>/api`. [docs/api.md](docs/api.md) is its contract.
Change it together with the code.

## The workbench

`composer serve` boots a small Testbench app with Trail installed, at `http://localhost:8000`. Its
landing page, and `php vendor/bin/testbench workbench:run --all`, run agent scenarios (tool calls,
sub-agents, failures, failover, streaming, approvals, embeddings and more) through the real SDK, so
everything Trail shows was recorded by Trail.

- Nothing is seeded, and traces survive restarts. Wipe them with
  `php vendor/bin/testbench trail:clear`.
- `php vendor/bin/testbench workbench:run --list` lists the scenarios, and
  `php vendor/bin/testbench workbench:run plain-answer` runs one.
- With no provider key, the scenarios run offline against scripted provider responses. To run those
  that can against a real provider, copy `workbench/.env.example` to `workbench/.env` and set
  `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. That file is ignored by git; never commit a key.
- The workbench database is `workbench/database/database.sqlite`, which is also ignored.
  `composer build` creates and migrates it.

## Rules for changes

- **Zero code changes for the developer.** `composer require` and `php artisan migrate`, and it
  records. Capture uses SDK events only: no agent middleware, traits or wrapping.
- **Never fake data.** A missing timing, usage or price is stored as `null` and shown as Not
  captured, Pending, Unpriced or Incomplete, never as zero.
- **Tracing never breaks an AI call.** Every listener body is guarded, and errors are reported.
- **No model CRUD.** Models come from config and from observed usage. Only prices are editable.
- **Three databases.** SQLite, MySQL and Postgres, with no vendor-specific SQL.
- **Conventions follow Horizon and Telescope:** a service provider, a facade and manager,
  `config/trail.php`, tables prefixed `trail_`, commands named `trail:*`, and a `viewTrail` gate.
  Commands are shipped but never scheduled for the user.
- **Id columns are strings.** SDK ids are 36-character UUIDs, so they are `string` columns, never
  `char` or `ulid`.
- **Documentation is checked.** A key added to `config/trail.php` must be added to
  [docs/configuration.md](docs/configuration.md), or a test fails. Code samples in `docs/` are run
  by the tests; see `tests/Feature/Docs`.
- **The repository is public.** Do not commit secrets, credentials, real user data or anything
  specific to your machine.

## Pull requests

Branch from `main` with a short, descriptive name. Describe the change on its own terms in the
commit messages and the pull request, and say what you ran.
