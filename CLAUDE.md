# CLAUDE.md

Guidance for working in this repository.

## What this is

Trail (`astrophp/trail`, namespace `Astro\Trail\`) is an open-source observability package for the
Laravel AI SDK (`laravel/ai`). It records agent runs into the host app's own database and serves a
dashboard from the host app — the Horizon/Telescope pattern, for AI runs. It is not a SaaS product.

The public roadmap is `ROADMAP.md`. Read it before starting any work.

## Rules that must not be broken

- **Zero code changes for the developer.** `composer require` + `php artisan migrate` and it
  records. Capture uses SDK events only: no agent middleware, no traits, no wrapping.
- **Never fake data.** Missing timing, usage or price is stored as `null` and shown as
  `Not captured` / `Pending` / `Unpriced` / `Incomplete`, never as zero.
- **Tracing never breaks an AI call.** Every listener body is guarded; errors are reported.
- **No SaaS concepts, no model CRUD.** Models come from config and observed usage; only prices
  are editable.
- **This repository is public.** Never commit secrets, credentials, real user data, private
  paths or anything machine-specific.

## Targets

- `laravel/ai ^1.1`, PHP `^8.3`, Laravel 12 and 13.
- SQLite, MySQL and Postgres; no vendor-specific SQL.
- Frontend: React + TypeScript + shadcn/ui + Tailwind v4, built by Vite to a committed `dist/`
  and inlined into the Blade layout (the Horizon/Telescope method; no publish step).

## Conventions

- Mirror Horizon/Telescope: ServiceProvider, Facade + manager, `config/trail.php`, tables
  prefixed `trail_`, commands `trail:*`, `viewTrail` gate in a published app service provider.
- Commands are shipped but never auto-scheduled.
- ID columns are `string` (SDK ids are 36-char uuid7), never `char`/`ulid`.
- Use shadcn primitives and theme tokens; never hand-roll a primitive shadcn provides and never
  hardcode hex/px values in components.
- Frontend structure and rules: `docs/frontend.md`. Read it before touching `resources/js`.

## Workflow

- Branching: `main` only, short-lived feature branches, releases are tags (`v0.1.0`, …).
- Each change is independently mergeable and green in CI.
- Commit and push only when asked.

## Commands

```bash
composer test        # pint --test, phpstan (max), pest
composer lint        # pint (writes)
npm run lint         # eslint + prettier --check
npm run typecheck    # tsc
npm test             # vitest
npm run build        # resources/js -> dist/app.js + dist/app.css (commit the result)
```
