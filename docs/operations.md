# Operations

Trail ships six artisan commands. It never schedules any of them for you.

| Command | What it does |
| -- | -- |
| `trail:install` | Publishes the config and the service provider ([Installation](installation.md)) |
| `trail:prune` | Deletes traces older than the retention period |
| `trail:sweep` | Marks runs that never finished as incomplete |
| `trail:clear` | Deletes every recorded trace |
| `trail:pause` | Stops recording new runs, in every process |
| `trail:resume` | Starts recording again |

The commands stay available when `trail.enabled` is `false`.

## Pruning

```bash
php artisan trail:prune
php artisan trail:prune --hours=72
```

`trail:prune` deletes the traces that were recorded more than `trail.retention` days ago (`14` by
default), together with their spans, per-run summaries and bookmarks. It deletes in chunks of 500
traces, each in its own transaction. Saved prices are kept.

- `--hours=N` deletes traces older than `N` hours instead, once, without reading the setting.
  `N` is a number from `0` to `876000`. `--hours=0` deletes everything recorded before now.
- If `trail.retention` is not a positive number of days (at most 36500), the command prints an
  error, deletes nothing and exits with a failure. `--hours` still works.
- It prints how many traces it deleted. It selects traces by when they were stored, which for
  a run is when its first row was written.

## Sweeping

```bash
php artisan trail:sweep
```

A run whose process died never reports an end, so its stored status stays Running.
`trail:sweep` marks every run (and every step still open in it) that has been running for longer
than `trail.stale_after` seconds as Incomplete with the issue kind abandoned. It has no options
and prints how many runs it marked.

You do not need the sweep to see the right thing: the dashboard and its API already show a stale
run as Incomplete before the sweep has run. The sweep makes the database itself say so, which
matters if you read it yourself. `stale_after` is `3600` seconds by default and values below
`60` behave as `60`.

## Clearing

```bash
php artisan trail:clear
php artisan trail:clear --force
```

Deletes every recorded trace, span and bookmark. Saved prices are kept. Outside the `local`
environment it asks for confirmation first, and the answer defaults to no; `--force` skips the
question.

## Pausing and resuming

```bash
php artisan trail:pause
php artisan trail:resume
```

`trail:pause` stops recording new runs in every process, without a deploy, until
`trail:resume`. Runs already in progress finish recording. The dashboard shows a notice while
recording is paused.

- The flag is kept in your **default cache store**, so that store must be shared between
  processes. With the `array` or `null` driver the flag only reaches the process that set it, and
  both commands warn you.
- A process reads the flag at its first run after a flush (the end of a request or job) and
  again at the next run once five seconds have passed, so a long job still notices a pause. With
  the `database` cache driver each read is a query, made before the run starts.
- A cache that cannot be read does not stop recording: the failure is reported and recording goes on.
- `trail.enabled` turns Trail off completely instead: nothing is registered and nothing is recorded.

## Scheduling

Add the commands to your schedule, for example in `routes/console.php`:

<!-- sample: operations.schedule -->
```php
use Illuminate\Support\Facades\Schedule;

Schedule::command('trail:prune')->daily();
Schedule::command('trail:sweep')->everyFiveMinutes();
```

Your application's scheduler has to be running for this to do anything (`php artisan schedule:run`
every minute, or `php artisan schedule:work`).

## Queues and Octane

Trail writes at flush points ([What is recorded](recording.md#when-it-is-written)). That has
these consequences for long-lived processes:

- **Queue workers** flush after every job, whether it succeeded or failed, and again at the start
  of every worker loop. Traces of a job are in the database when the job
  ends. A job that runs for a long time shows as Running, without steps, until it ends.
- **Octane** flushes at the end of each request, task and tick. Trail listens to Octane's event by
  name and does not depend on Octane.
- `Trail::filter()` and `Trail::withoutRecording()` keep their state in the process. In a
  long-lived process, set a filter once in `boot()`.
- In your own long-lived script, call `Trail::flush()` between runs.
- A worker that is killed in the middle of a job loses what it had buffered. The first row it
  wrote remains, and becomes Incomplete.

## Storage

Trail's tables hold prompts and outputs, so they grow with your traffic. `trail:prune` keeps them
bounded; schedule it. The size depends on how long your runs are, how many steps and tools they
use, and `capture.max_length`. See [Known limits](limits.md#speed-on-large-tables) for the sizes Trail's own
measurements found with generated data.

### SQLite and concurrent writers

When Trail flushes a trace, its store reads and then writes inside one transaction, and makes up to
three attempts at it when the database reports a concurrency error. On MySQL and Postgres that is
enough. On SQLite it is not always: several processes writing at once can still fail with
"database is locked". When that happens Trail reports the failure through Laravel's exception
handler and **the trace is lost**: the flush writes nothing, and the run keeps the single row it
was given when it started, so it shows as Running, with no steps, until it is swept to Incomplete.
Your AI call is unaffected.

A single process is not affected, which is the usual case for local development. The risk is
several queue workers or web processes writing to one SQLite file.

**What was observed.** This was tried on the workbench app in this repository ([Contributing](../CONTRIBUTING.md#the-workbench)):
parallel processes, each running a scripted agent with one tool call (`workbench:run tool-calls`)
over and over against one SQLite file, on a laptop. Each result counts the traces in the file
afterwards. "Whole" is a completed trace with its steps; "left running" is a trace that kept only
its first row. Every trace left running matched one failure Trail reported.

| PHP | Settings on the SQLite connection | Processes x runs | Expected | Whole | Left running |
| -- | -- | -- | -- | -- | -- |
| 8.4 | Laravel's defaults | 4 x 40 | 160 | 144 | 16 |
| 8.4 | Laravel's defaults | 4 x 40 | 160 | 141 | 19 |
| 8.4 | `busy_timeout` and WAL | 4 x 40 | 160 | 132 | 28 |
| 8.4 | `busy_timeout` and WAL | 4 x 40 | 160 | 140 | 19 |
| 8.4 | `busy_timeout`, WAL and `transaction_mode` `IMMEDIATE` | 4 x 40 | 160 | 160 | 0 |
| 8.4 | `busy_timeout`, WAL and `transaction_mode` `IMMEDIATE` | 4 x 40 | 160 | 159 | 0 |
| 8.4 | Laravel's defaults | 2 x 60 | 120 | 119 | 0 |
| 8.4 | Laravel's defaults | 8 x 25 | 200 | 170 | 30 |
| 8.4 | `busy_timeout` and WAL | 8 x 25 | 200 | 162 | 38 |
| 8.4 | `busy_timeout`, WAL and `transaction_mode` `IMMEDIATE` | 8 x 25 | 200 | 200 | 0 |
| 8.3 | Laravel's defaults | 2 x 60 | 120 | 106 | 13 |
| 8.3 | `busy_timeout`, WAL and `transaction_mode` `IMMEDIATE` | 2 x 60 | 120 | 97 | 23 |

- The settings were `busy_timeout` 5000, `journal_mode` WAL and `transaction_mode` `IMMEDIATE`.
- WAL and a busy timeout alone did not help. Adding `IMMEDIATE` did: no trace was left running in
  any run with it.
- Losses are not guaranteed. The run of two processes on PHP 8.4 with the defaults lost none.
- Where the whole and left-running counts add up to one less than expected (159 of 160, 119 of
  120), a scenario process did not run to its end. One of them was checked: a file-copy error
  while the test harness booted, unrelated to Trail. Trail reported no failure for those runs.
  The others were not checked.
- On PHP 8.3 the `IMMEDIATE` setting made no difference, because Laravel's SQLite connection
  reads `transaction_mode` only on PHP 8.4 and newer. On 8.3 it is ignored.
- This is one laptop, one scenario and short runs. It shows the direction and not a rate.

This matches how SQLite treats a transaction that starts by reading and then tries to write while
another connection holds the write lock: it answers "busy" at once instead of waiting for the busy
timeout. A transaction that begins as `IMMEDIATE` takes the write lock first, where the busy
timeout applies.

**Recommendation.** For SQLite with more than one worker, set these on the connection Trail uses,
in `config/database.php`:

<!-- sample: operations.sqlite -->
```php
'sqlite' => [
    // ...driver, database and the rest stay as they are
    'busy_timeout' => 5000,
    'journal_mode' => 'WAL',
    'transaction_mode' => 'IMMEDIATE',
],
```

- `transaction_mode` takes effect on **PHP 8.4 and newer** only. On PHP 8.3, use MySQL or
  Postgres, or keep a single writer.
- `journal_mode` WAL is stored in the database file and stays after you remove the setting.
- The settings changed which traces were lost, not whether a write can ever fail. Failed writes
  are still reported.

### A dedicated storage connection

By default Trail's tables are on your application's default connection, so Trail's writes are
part of whatever transaction your application has open on it. Agents often run inside
`DB::transaction()`, so this matters in a few cases:

- **A rollback takes Trail's first row with it.** The row Trail inserts when a run starts is
  inside your transaction. When the transaction rolls back, the row goes too. Usually the run is
  recorded anyway, because Trail writes the whole trace again at the end of the request or job,
  after your transaction ended. A trace is lost when the flush happens inside a transaction that
  then rolls back (for example, if you call `Trail::flush()` there), or when the process dies
  before it flushes.
- **Nobody else can see the run until you commit.** The Running row is invisible to the
  dashboard until the transaction commits. A long transaction hides a long run.
- **A process that dies inside the transaction leaves nothing.** With the tables on their own
  connection, the first row is already committed, so the run is found later and swept to
  Incomplete.

These three were checked by hand on Postgres 17, with the tables on the default connection and on
a second connection to the same database: inside an open transaction a separate connection saw no
Trail row on the default connection and a Running one on the dedicated connection; a process
killed inside the transaction left no row on the default connection and a Running one on the
dedicated connection, which `trail:sweep` then marked Incomplete; and a flush inside a transaction
that was rolled back kept the completed trace only on the dedicated connection. It was not run
on MySQL.

A failed Trail write inside your transaction does not break it: Trail uses a savepoint, and the
test suite checks that your own queries keep working afterwards.

To avoid this, point Trail at a second connection to the same database. Set
`TRAIL_DB_CONNECTION` (`trail.storage.connection`) to its name **before you migrate**:

<!-- sample: operations.connection -->
```php
// In a service provider's register(): a second connection with the settings of the default one.
config(['database.connections.trail' => config('database.connections.'.config('database.default'))]);
```

```dotenv
TRAIL_DB_CONNECTION=trail
```

The migrations create Trail's tables on that connection and every read and write uses it. Costs
and caveats:

- Each process that records opens a second database connection.
- Trail's rows are no longer part of your transactions. A rolled-back run is still in Trail.
- On SQLite a second connection to the **same file** does not help. In a check with plain PDO
  connections, a write on the second connection while the first held an open write transaction
  failed with "database is locked" after the busy timeout (1 second there). On SQLite, point Trail at
  a database file of its own.

## When nothing is recorded

- `TRAIL_ENABLED` is `false`, or the config is cached with an older value.
- Recording is paused: `php artisan trail:resume`. The dashboard says so.
- The migrations have not run, or ran on another connection than `trail.storage.connection`.
  Failed writes are reported to your exception handler and logs.
- `trail.sampling` is below `1`, a `Trail::filter()` rejects the run, or the run started inside
  `Trail::withoutRecording()`.
- The process has not reached a flush point yet ([What is recorded](recording.md#when-it-is-written)).
- The operation is one Trail does not record ([What is recorded](recording.md#what-is-not-recorded)).
- The dashboard shows the last 24 hours by default. Widen its range.
