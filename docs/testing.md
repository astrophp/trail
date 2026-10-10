# Testing your application with Trail

`Trail::fake()` replaces Trail's storage with an empty in-memory store, so a test can assert what
was recorded without writing Trail's trace rows to a database. It returns the store, which has the
assertions below.

While faked, Trail also prices from the `trail.pricing` entries in your configuration alone. It runs
no database query to find saved prices, so a test whose database has no `trail_prices` table reports
nothing, and a price saved in that table is not used. This holds for the rest of the process, however
long it runs.

```php
use App\Ai\Agents\SupportAgent;
use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\TraceRecord;

$trail = Trail::fake();

SupportAgent::fake(['Your order has shipped.']);
(new SupportAgent)->prompt('Where is my order?');

Trail::flush();

$trail->assertRecorded(SupportAgent::class, fn (TraceRecord $trace) => $trace->status === Status::Completed);
```

Put that in a Pest `it()` or a PHPUnit test method. `SupportAgent::fake()` is the SDK's own fake, so
the test needs no provider key.

## Call `Trail::flush()` before asserting

Trail buffers a run and writes it at a flush point ([What is recorded](recording.md#when-it-is-written)).
A request made with Laravel's HTTP test helpers reaches one when the request ends. Code that calls
an agent directly does not, so call `Trail::flush()` before you assert on a status, a span or a
total. Without it, the store holds only the row written when the run started, with the status
Running.

## The assertions

All of them return the store, so they chain. A failure names the agent class, except for
`assertRecordedCount()` without a class and `assertNothingRecorded()`, which report counts.

| Assertion | Passes when |
| -- | -- |
| `assertRecorded(string $agentClass, ?Closure $callback = null)` | A trace was recorded for the class, and, if you pass a callback `fn (TraceRecord $trace, array $spans): bool`, it returns `true` for at least one of them |
| `assertNotRecorded(string $agentClass)` | No trace was recorded for the class |
| `assertSpanRecorded(string $agentClass, ?Closure $callback = null)` | An agent span of the class was recorded in any trace, which is where a sub-agent is recorded. The callback is `fn (SpanRecord $span, TraceRecord $trace): bool` |
| `assertSpanNotRecorded(string $agentClass)` | No agent span of the class was recorded |
| `assertRecordedCount(int $count, ?string $agentClass = null)` | Exactly `$count` traces were recorded, in total or for the class |
| `assertNothingRecorded()` | No trace was recorded |

```php
use App\Ai\Agents\SupportAgent;
use Astro\Trail\Facades\Trail;

$trail = Trail::fake();

SupportAgent::fake(['Hello']);
(new SupportAgent)->prompt('Hi');
Trail::flush();

$trail->assertRecordedCount(1)
    ->assertRecordedCount(1, SupportAgent::class)
    ->assertSpanRecorded(SupportAgent::class)
    ->assertNotRecorded(App\Ai\Agents\HealthCheckAgent::class)
    ->assertSpanNotRecorded(App\Ai\Agents\HealthCheckAgent::class);
```

```php
use Astro\Trail\Facades\Trail;

$trail = Trail::fake();

// ... run the code under test ...

$trail->assertNothingRecorded();
```

## Looking at what was stored

The store also lets you read what it holds: `traces()` (a list of `TraceRecord`), `trace($id)`,
`spans($traceId = null)` (a list of `SpanRecord`) and `totals($traceId)` (tokens, cost and span
counts). A `TraceRecord` has the id, type, name, status, agent class, provider, model,
conversation and user, timing, excerpts and error details. A `SpanRecord` has the same kind of
fields for one span, plus its parent, tokens, cost, input and output.

## What the fake does not replace

- The dashboard's own pages and API are not replaced: they still read the database, including the
  saved prices and the recorded models. Only recording is faked.
- The listeners stay registered, so recording behaves as it does in your application. To turn
  recording off in tests, set `TRAIL_ENABLED=false` in `phpunit.xml` or use
  `Trail::withoutRecording()`.
- Each `Trail::fake()` call gives a new, empty store.
