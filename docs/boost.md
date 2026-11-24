# Laravel Boost

If your application uses [Laravel Boost](https://laravel.com/docs/boost), Trail adds four read-only
tools to Boost's existing MCP server. It also provides a short package guideline through Boost's
documented third-party guideline discovery. No separate MCP server or editor configuration is needed.
Install Boost in your application and run its installer as usual:

```bash
composer require laravel/boost --dev
php artisan boost:install
```

If Boost was already installed before Trail, run `php artisan boost:update --discover` to add
Trail's package guideline, then restart your MCP client to refresh its tool list.

The tools appear when your agent connects to `php artisan boost:mcp`. This integration is tested
with Boost 2.10.3. Boost's tool include configuration is available in that version, but package
tool registration is not currently covered by Boost's public documentation, so check it when
upgrading Boost:

| Tool | What it returns |
| -- | -- |
| `trail-list-traces` | Compact summaries of recent runs, optionally filtered by time range, status, agent, or text. Results are capped at 50. |
| `trail-show-trace` | One run, its error details, and up to 100 spans in execution order. Span input, output, and metadata are omitted. |
| `trail-show-conversation` | Up to 10 turns of a conversation, with bounded prompt and response excerpts. Pass a returned `next_before` trace ID as `before` to page toward older turns. Use `trail-show-trace` for a turn's span details. |
| `trail-usage-summary` | Usage and estimated cost totals with coverage, plus up to 20 model, provider, or agent groups for the selected time range. |

These tools read Trail's database through the application's configured Trail connection. They
return recorded data, including trace prompt and response excerpts. Boost's MCP access is separate
from Trail's dashboard `viewTrail` gate, so use it only with agents you trust with that data. The
tools do not run an agent, change a trace, or recalculate a cost. A missing usage or cost stays
missing.

To turn off the integration, set `TRAIL_BOOST_ENABLED=false` in the application's environment.
Trail's dashboard and recording continue to work. Rebuild cached configuration after changing the
setting.

## Direct usage quantities

The trace usage returned by `trail-list-traces`, `trail-show-trace`, and the turns of
`trail-show-conversation` includes `search_units`: a six-place decimal string or `null`.
Billable spans in `trail-show-trace` expose the same quantity. Tokens and search units stay
separate. The range figures in `trail-usage-summary` expose token counts only. Span input, output and metadata remain omitted.


### Classification, reranking, images, audio and transcription

All four tools use the same billable operation definitions and missing-evidence rules as the HTTP
API. `trail-list-traces` accepts `operation_type` for the root operation. `trail-show-trace` includes
classification, reranking, image, audio and transcription spans and independent search-unit usage,
while continuing to omit raw input, output and metadata. Usage summary retains legacy token fields and includes independent
unit coverage and call aliases. Provider probabilities, scores and snippets are never treated as
model quality metrics or reconstructed by the tools.
