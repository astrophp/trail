<?php

use Astro\Trail\Tests\Performance\UsageMeasurement;
use Astro\Trail\Tests\TestCase;

/*
 * An opt-in measurement of the reads a usage page needs, on spans as they are and on the per-run
 * summaries the store keeps (trail_trace_models and trail_trace_tools), and of what keeping those
 * summaries current adds to a write through the store. It is not part of the default suites
 * (phpunit.xml does not list this directory) and skips unless TRAIL_MEASURE=1.
 *
 *   TRAIL_MEASURE=1 TRAIL_MEASURE_DATABASES=sqlite,mysql,pgsql TRAIL_MEASURE_ROWS=100000,1000000 \
 *       vendor/bin/pest tests/Performance/UsageQueriesTest.php
 *
 * ROWS is the number of runs; each run brings about five spans. The summaries are filled from the
 * spans by one set-based statement each, and the store's own write is run again for a sample of runs
 * to check that it leaves the same rows. Other variables:
 * TRAIL_MEASURE_SQLITE_ROWS (runs SQLite is filled with, default 300; it is only a sanity check),
 * TRAIL_MEASURE_REPEATS (default 5; a read whose first run takes over 10 s is repeated 3 times),
 * TRAIL_MEASURE_CONFIGS (the indexes to time the summary reads with, beside the two the migrations
 * make: default none,pms,name,all; join several with +), TRAIL_MEASURE_ONLY (a regular expression the
 * label of a read must match), TRAIL_MEASURE_CHECK_MAX (the most runs a dataset may have for the
 * agreement checks, default 150000), TRAIL_MEASURE_WRITE_RUNS (runs per cell of the write
 * measurement, default 300), TRAIL_MEASURE_OUT (a file the report is appended to), TRAIL_MEASURE_HOST,
 * TRAIL_MEASURE_MYSQL_PORT (33306), TRAIL_MEASURE_PGSQL_PORT (35432) and TRAIL_MEASURE_PASSWORD. The
 * databases must be throwaway ones: the tables are emptied and filled with generated rows.
 *
 * A million runs are about 5.3 million spans. With their indexes, the spans and runs take about 3.5 GiB
 * in Postgres and about 4.5 GiB in MySQL; the two summaries add about 1 GiB with their indexes, and the
 * grouped reads over a week in MySQL write more than 1 GiB of temporary files. When the data directory
 * is held in memory, a million runs therefore need roughly 6 GiB for Postgres and 8 GiB or more for MySQL,
 * beside what the server itself uses. Measure MySQL at 100,000 runs, and Postgres at both.
 */
uses(TestCase::class);

it('measures the usage reads and checks that they agree', function () {
    ini_set('memory_limit', '4G');

    $measurement = UsageMeasurement::fromEnvironment();
    $measurement->run();

    expect($measurement->findings)->toBe([]);
})->skip(fn () => getenv('TRAIL_MEASURE') !== '1', 'Set TRAIL_MEASURE=1 to run the usage measurement.');
