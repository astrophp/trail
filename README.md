# Trail

[![tests](https://github.com/astrophp/trail/actions/workflows/tests.yml/badge.svg)](https://github.com/astrophp/trail/actions/workflows/tests.yml)

Observability for the [Laravel AI SDK](https://github.com/laravel/ai): Trail records what your
agents did — runs, model steps, tool calls, sub-agents, tokens and estimated cost — into your
application's own database, and serves a dashboard from your application.

> **Status: early development.** Trail is being built in the open and is not ready for use yet.
> There is no tagged release. See the [roadmap](ROADMAP.md) for what is planned.

## Goals

- Install the package, run the migrations, and it records. No changes to your agents or tools.
- Your data stays in your database. Trail is a package, not a hosted service.
- Find the exact model step, tool or sub-agent behind a slow, failed or expensive run.
- Honest data: anything Trail could not capture is shown as missing, never as zero.

## Requirements

- PHP 8.3+
- Laravel 12 or 13
- `laravel/ai` 1.1+

## Dashboard access

The dashboard is served at `/trail`. In the `local` environment anyone can open it. Anywhere else a
request must pass the `viewTrail` gate, defined in `App\Providers\TrailServiceProvider` (published by
`php artisan trail:install`); nobody passes until you list who can. Prefer your own check? Override
`authorization()` in that provider and call `Trail::auth(fn ($request) => ...)`, which replaces the
gate everywhere, local included. A request that fails the check gets a 403, never a redirect.

- `trail.path` / `TRAIL_PATH`, `trail.domain` / `TRAIL_DOMAIN`: where the dashboard is served.
- `trail.middleware` (default `web`) and `trail.guard` / `TRAIL_GUARD`: the middleware and the guard whose user is checked. Trail's own access check is always added after the middleware.
- `TRAIL_DASHBOARD_ENABLED=false` removes the dashboard routes and keeps recording; `TRAIL_ENABLED=false` stops both.

## Known limits

Trail records what the SDK reports through its events, so a few things cannot be recorded:

- When an agent remembers conversations and generates a title for a new one, the SDK makes an extra
  model call that no event reports. It is neither recorded nor priced.
- Embeddings served from the SDK's embeddings cache fire no events, so they do not appear.
- A run that resumes an approval pause is a separate trace from the run that paused. The two are
  not linked.

## Testing

`Trail::fake()` swaps Trail's storage for an in-memory store, so your tests never touch Trail's tables.

```php
use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\TraceRecord;

it('records the support agent', function () {
    $trail = Trail::fake();

    // ... run the code under test ...

    $trail->assertRecorded(SupportAgent::class, fn (TraceRecord $trace) => $trace->status === Status::Completed);
});

it('records nothing for a guest', function () {
    $trail = Trail::fake();

    // ... run the code under test ...

    $trail->assertNothingRecorded();
});
```

## Contributing

```bash
composer install
composer test

npm install
npm run lint        # eslint + prettier --check
npm run format      # prettier --write + eslint --fix
npm run typecheck
npm test
npm run build       # also checks the bundle size budget
npm run catalogue   # component catalogue (dev only), http://localhost:5175
npm run size
```

The compiled dashboard in `dist/` is committed; rebuild it whenever `resources/js` changes.

### Workbench

`composer serve` boots a small Testbench app with Trail installed, at `http://localhost:8000`. Its
landing page and `php vendor/bin/testbench workbench:run --all` run agent scenarios (tool calls,
sub-agents, failures, failover, streaming, approvals, embeddings, ...) through the real SDK, so
everything Trail shows was recorded by Trail. Nothing is seeded, and traces survive restarts; wipe
them with `php vendor/bin/testbench trail:clear`. With no provider key the scenarios run offline
against scripted provider responses; copy `workbench/.env.example` to `workbench/.env` and set
`ANTHROPIC_API_KEY` or `OPENAI_API_KEY` to run those that can against a real provider.

## Security

Please see [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
