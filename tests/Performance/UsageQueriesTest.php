<?php

use Astro\Trail\Tests\Performance\UsageMeasurement;
use Astro\Trail\Tests\TestCase;

/*
 * An opt-in measurement of the reads a usage page would need, on spans as they are and on a per-run
 * summary made by hand in the throwaway database, and of what keeping that summary current adds to a
 * flush. It is not part of the default suites (phpunit.xml does not list this directory) and skips
 * unless TRAIL_MEASURE=1.
 *
 *   TRAIL_MEASURE=1 TRAIL_MEASURE_DATABASES=sqlite,mysql,pgsql TRAIL_MEASURE_ROWS=100000,1000000 \
 *       vendor/bin/pest tests/Performance/UsageQueriesTest.php
 *
 * ROWS is the number of runs; each run brings about five spans. Other variables:
 * TRAIL_MEASURE_SQLITE_ROWS (runs SQLite is filled with, default 300; it is only a sanity check),
 * TRAIL_MEASURE_REPEATS (default 5; a read whose first run takes over 10 s is repeated 3 times),
 * TRAIL_MEASURE_CONFIGS (the indexes of the summaries to time the reads with, default
 * none,started,pms,trace,name,all; join several with +), TRAIL_MEASURE_ONLY (a regular expression the
 * label of a read must match), TRAIL_MEASURE_CHECK_MAX (the most runs a dataset may have for the
 * agreement checks, default 150000), TRAIL_MEASURE_WRITE_RUNS (runs per cell of the flush
 * measurement, default 300), TRAIL_MEASURE_OUT (a file the report is appended to), TRAIL_MEASURE_HOST,
 * TRAIL_MEASURE_MYSQL_PORT (33306), TRAIL_MEASURE_PGSQL_PORT (35432) and TRAIL_MEASURE_PASSWORD. The
 * databases must be throwaway ones: the tables are dropped, created and filled with generated rows.
 */
uses(TestCase::class);

it('measures the usage reads and checks that they agree', function () {
    ini_set('memory_limit', '4G');

    $measurement = UsageMeasurement::fromEnvironment();
    $measurement->run();

    expect($measurement->findings)->toBe([]);
})->skip(fn () => getenv('TRAIL_MEASURE') !== '1', 'Set TRAIL_MEASURE=1 to run the usage measurement.');
