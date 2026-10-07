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
npm test
npm run build
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
