# Known limits

This page lists what Trail does not do or does imperfectly in `v0.1.0`, so you do not have to
find out from a missing number.

## Things the SDK does not report

Trail records what the SDK reports through its events, so a few things cannot be recorded:

- When an agent remembers conversations and generates a title for a new one, the SDK makes an
  extra model call that no event reports. It is neither recorded nor priced.
- Embeddings served from the SDK's embeddings cache fire no events, so they do not appear.
- Classification, images, audio, transcription and reranking are not recorded at all.

## A paused run and the run that resumed it are separate traces

A run that stops for tool approval is one trace, with the status Awaiting approval. The run that
resumes it, once a person has approved or rejected the call, is another trace. The two are not
linked. When the agent remembers conversations, both carry the same conversation id, so they are
turns of the same conversation; nothing else ties them together.

## Users are stored as an id and a type

Trail stores a run's user as an id and a type, the way the SDK's conversations do, and nothing
else. The name and email the dashboard shows are looked up when a page is shown:

- By default each type is mapped to an Eloquent model, through your morph map first and then as a
  class name, and the users are read with one query per model. The model's `name` and `email`
  attributes are used.
- If your users are not in Eloquent models, resolve them yourself. Set this once, for example in a
  service provider's `boot()`. The callback gets the user ids grouped by type and returns the users
  by type and id, or `null` for one it cannot find:

<!-- sample: limits.users -->
```php
use Astro\Trail\Facades\Trail;

Trail::resolveUsersUsing(function (array $users) {
    $resolved = [];

    foreach ($users as $type => $ids) {
        foreach ($ids as $id) {
            // Look the user up wherever your users live.
            $resolved[$type][$id] = ['name' => 'User '.$id, 'email' => 'user'.$id.'@example.com'];
        }
    }

    return $resolved;
});
```

- A user who cannot be resolved (deleted, or a type with no model) shows as the id. If an error
  was behind it, the error is reported.
- Because only the id and type are stored, **you cannot search by a user's name or email.** The
  search box matches the user id, and the filters take a user id and type.
- A change to a person's name shows in old runs too, because the name is never stored. A CSV
  export includes the resolved name and email.

## Timestamps are wall-clock time

Trail stores timestamps as wall-clock time in your application's timezone (`app.timezone`), in
columns that hold no timezone. The sweep and the prune compare those stored values with a cutoff
written the same way.

When clocks are set back for daylight saving, an hour of wall-clock time happens twice. A row
written late in the first pass has a later wall-clock value than a row written early in the second
pass, so for a while the sweep and the prune see it as younger than it is. They can run late by up
to the length of the repeated hour, usually one hour. They do not run early. An application in UTC,
or in a timezone without daylight saving, is not affected. The dashboard reads the same stored
values, so a stale run can also show as Incomplete up to an hour late in that window.

## Default prices use base rates

The prices in `config/trail.php` are standard, non-batch list prices read on 2026-10-07. They do
not model long-context surcharges, which some OpenAI, Gemini and xAI models apply above a
prompt-size threshold, nor Anthropic's one-hour cache writes or cache storage fees. A run that
uses them can be charged more than Trail estimates. Check [Cost](cost.md) before you rely on a
total.

## The dashboard is one large script

The dashboard's JavaScript and CSS are inlined into the page, so there is nothing to publish and
no asset URL to configure. The cost is that every dashboard page load carries them. In this
release the script is about 1.3 MB, about 380 KB gzipped
(measure it with `gzip -c dist/app.js | wc -c`), and the stylesheet is about 135 KB, about 20 KB
gzipped. Whether the page is compressed in transit depends on your web server. The size changes
with every release that changes the dashboard.

## Several SQLite writers can lose a trace

With SQLite and more than one process writing, a trace can be lost. It is reported, and your AI
call is unaffected. See [Operations](operations.md#sqlite-and-concurrent-writers) for what was
observed and the settings that avoided it.

## Errors inside Trail go to your exception handler

When Trail cannot write, it reports the failure with Laravel's `report()`, so whatever your
application sends exceptions to receives it. A failed write is described by its class, connection,
SQLSTATE and driver code, and the SQL with placeholders, never the values. Other errors inside
Trail are reported with their own messages; those were not audited for whether one could contain
prompt text.

## Redaction does not find every secret

A secret in free text with no recognisable shape, such as a password written in a sentence, is
stored as written. See [Payloads and sampling](payloads.md#redaction).

## A trace appears when its process flushes

A run's steps and tools appear in the dashboard when its process reaches a flush point, not while
it runs. A long job shows as Running, without steps, until it ends. See
[What is recorded](recording.md#when-it-is-written).

## Exports hold at most 10,000 runs

The CSV export of runs holds the first 10,000 runs of the view, in the list's order. The response
carries headers that say how many runs the view had and whether the file was cut short. Narrow the
range or the filters to get the rest.

## Speed on large tables

Trail's tests include opt-in measurements of the database reads behind the dashboard
(`tests/Performance`; `TRAIL_MEASURE=1`, and the comment at the top of `AgentQueriesTest.php`,
`OverviewQueriesTest.php` and `UsageQueriesTest.php` says how to run each). These are the figures
from one run of them. They show how the reads grow on generated data. They are not a promise for
your data.

**Setup.**

- A laptop: Apple M1 Pro with 10 cores and 16 GB of memory. The databases ran in Docker containers
  (the Docker VM had 10 CPUs and 7.7 GiB of memory) with their data directories in memory
  (`tmpfs`), so there is no disk time in the figures. MySQL 8.4.11 and PostgreSQL 17.11, both on
  aarch64.
- MySQL and Postgres were left at their defaults, except where it says otherwise below.
- The machine was not idle. Other work was running on it, and its one-minute load average when an
  agents or usage measurement started ranged from 5 to 52. Treat the figures as rough, and as
  larger than a quiet machine would give.
- The data is generated: each run has a root agent span, one to four steps, none to three tool
  calls and, for about 8% of runs, a delegated sub-agent, about 5.3 spans a run. The rows carry no
  prompts or outputs (`input`, `output` and `metadata` are null), so they are narrower than real
  ones. Runs are spread evenly over 14 days, so the 24-hour range holds about a fourteenth of them
  and the 7-day range about half.
- Each figure is the median wall-clock time, in milliseconds, of five runs of one read (all the
  queries the dashboard makes for it, one after the other), timed from PHP against the database on
  the same machine. A read whose first run took over ten seconds was run three times. There was
  no warm-up run. The figures leave out the HTTP request, rendering and the browser.

**The agents pages, and the runs list filtered by tool.** The reads as the dashboard makes them,
with the indexes the migrations create. "35% agent" and "10% agent" are agents that hold that
share of all runs.

| Read | Range | MySQL 100k | MySQL 300k | MySQL 1M | Postgres 100k | Postgres 300k | Postgres 1M |
| -- | -- | -- | -- | -- | -- | -- | -- |
| `GET /agents`, by runs | 24h | 182 | 596 | 2,493 | 34.8 | 134 | 1,598 |
| `GET /agents`, by runs | 7d | 698 | 2,643 | 9,528 | 124 | 768 | 3,097 |
| `GET /agents`, by cost | 24h | 187 | 539 | 2,606 | 35.8 | 99.7 | 1,425 |
| `GET /agents`, by cost | 7d | 612 | 2,331 | 10,946 | 115 | 397 | 4,293 |
| `GET /agents/show`, 35% agent | 24h | 220 | 578 | 3,349 | 45.3 | 114 | 322 |
| `GET /agents/show`, 35% agent | 7d | 676 | 1,581 | 6,880 | 185 | 842 | 4,377 |
| `GET /agents/show`, 10% agent | 24h | 192 | 462 | 2,477 | 38.3 | 131 | 308 |
| `GET /agents/show`, 10% agent | 7d | 363 | 1,036 | 4,587 | 126 | 711 | 2,023 |
| `GET /agents/show`, delegated-only agent | 24h | 124 | 226 | 976 | 35.1 | 41.3 | 79.1 |
| `GET /agents/show`, delegated-only agent | 7d | 220 | 562 | 2,182 | 65.5 | 142 | 436 |
| `GET /agents/breakdown`, 35% agent | 24h | 229 | 659 | 2,615 | 61.5 | 165 | 739 |
| `GET /agents/breakdown`, 35% agent | 7d | 1,171 | 6,027 | not measured | 240 | 1,149 | 7,457 |
| `GET /agents/breakdown`, 10% agent | 24h | 94.3 | 262 | 1,245 | 28.3 | 83.9 | 239 |
| `GET /agents/breakdown`, 10% agent | 7d | 385 | 1,201 | 4,827 | 131 | 466 | 5,228 |
| `GET /agents/breakdown`, delegated-only agent | 24h | 73.3 | 194 | 828 | 24.0 | 33.2 | 88.2 |
| `GET /agents/breakdown`, delegated-only agent | 7d | 212 | 640 | 2,337 | 48.7 | 163 | 424 |
| `GET /traces?tool=`, most common tool | 24h | 43.6 | 126 | 533 | 15.8 | 33.2 | 184 |
| `GET /traces?tool=`, most common tool | 7d | 192 | 908 | 2,716 | 32.9 | 113 | 417 |
| `GET /traces?tool=`, rarest tool | 24h | 4.6 | 8.2 | 18.7 | 4.9 | 9.0 | 23.5 |
| `GET /traces?tool=`, rarest tool | 7d | 10.5 | 27.3 | 135 | 8.1 | 18.2 | 55.7 |

"100k", "300k" and "1M" are 100,000, 300,000 and 1,000,000 runs (525,163, 1,577,440 and 5,259,661
spans). The 1M measurements were made with settings that keep the database small enough to hold in
memory: PostgreSQL with `wal_level=minimal`, `max_wal_size=256MB`, `min_wal_size=32MB` and
`fsync=off`, and MySQL with `--skip-log-bin` and its temporary files in the memory-backed data
directory. "Not measured": that read needed more temporary-file space than the memory-backed
directory had and failed with "No space left on device" on the 1M MySQL database. It says nothing
about how long the read would take.

What the table shows:

- At a million runs, on this machine, most of these reads took seconds, not milliseconds, and
  several grew faster than the number of runs: from 100,000 to 1,000,000 runs the agents list over
  seven days went from 698 ms to 9.5 s on MySQL and from 124 ms to 3.1 s on Postgres.
- The slowest read that completed on Postgres at a million runs was an agent's breakdown over seven
  days (7.5 s for the 35% agent). On MySQL it was the agents list sorted by cost over seven days
  (10.9 s).
- The runs list filtered by a rare tool stayed under 140 ms throughout. The reads of an agent that
  only ever ran as a sub-agent were the fastest on Postgres (79 ms to 436 ms at a million runs)
  and took between 0.8 and 2.3 s on MySQL.
- SQLite was not measured.

**The overview.** The two reads behind the Overview page, on a table of runs (no spans), for all
agents and for one agent that holds about 10% of the runs.

| Read | Range | MySQL 100k | MySQL 1M | Postgres 100k | Postgres 1M |
| -- | -- | -- | -- | -- | -- |
| Overview figures, all agents | 24h | 91.9 | 991 | 23.4 | 143 |
| Overview figures, one agent | 24h | 74.3 | 854 | 15.8 | 74.4 |
| Overview figures, all agents | 7d | 200 | 2,177 | 106 | 1,083 |
| Overview figures, one agent | 7d | 105 | 1,154 | 48.7 | 267 |
| What needs attention, all agents | 24h | 33.0 | 296 | 7.5 | 27.6 |
| What needs attention, one agent | 24h | 20.1 | 203 | 3.8 | 17.8 |
| What needs attention, all agents | 7d | 174 | 1,885 | 25.0 | 132 |
| What needs attention, one agent | 7d | 127 | 1,219 | 13.5 | 75.8 |

Both databases were at their defaults for these. The measurement also checks that the overview's
counts agree with the runs list's, and found no disagreement.

**The usage page.** The usage measurement times candidate reads written for it (`UsageReads.php`),
not the package's own query classes, so its figures show what reads of this shape cost and are not
a measurement of the Usage & cost page itself. The ones on the per-run summary tables
(`trail_trace_models` and `trail_trace_tools`), with the indexes the migrations create, at 100,000
runs:

| Range | MySQL (median ms, fastest to slowest of 10 reads) | Postgres (median ms, fastest to slowest of 10 reads) |
| -- | -- | -- |
| 24h | 8.0 to 64.7 | 4.1 to 37.6 |
| 7d | 44.5 to 619 | 12.1 to 268 |

The slowest read in both was counting the distinct runs behind each provider over seven days (619 ms
on MySQL, 268 ms on Postgres). Listing every model ever observed took 84 ms on MySQL and 28 ms on
Postgres. The measurement's own notes put a million runs at roughly 6 GiB for Postgres and 8 GiB
or more for MySQL when the data directory is held in memory, which this machine could not give.
**The usage reads were not measured at a million runs, nor at 300,000.**

**Size on disk.** The generated rows of `trail_traces` and `trail_spans`, with their indexes, took
about 377 MiB on MySQL and 409 MiB on Postgres at 100,000 runs, and about 3.7 GiB on MySQL and
4.1 GiB on Postgres at a million. Real runs carry prompts and outputs, so yours will be larger.
`trail:prune` is how you bound it.
