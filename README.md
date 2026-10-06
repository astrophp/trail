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

## Contributing

```bash
composer install
composer test

npm install
npm test
npm run build
```

The compiled dashboard in `dist/` is committed; rebuild it whenever `resources/js` changes.

## Security

Please see [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
