<?php

use Astro\Trail\Tests\Performance\OverviewMeasurement;
use Astro\Trail\Tests\TestCase;

/*
 * An opt-in measurement of the queries behind the overview. It is not part of the default
 * suites (phpunit.xml does not list this directory) and skips unless TRAIL_MEASURE=1.
 *
 *   TRAIL_MEASURE=1 TRAIL_MEASURE_DATABASES=sqlite,mysql,pgsql TRAIL_MEASURE_ROWS=100000,1000000 \
 *       vendor/bin/pest tests/Performance/OverviewQueriesTest.php
 *
 * TRAIL_MEASURE_SHAPES=0 skips the candidate shapes and times only the read the endpoint uses.
 * Other variables: TRAIL_MEASURE_SQLITE_ROWS (rows SQLite is filled with, default 5000; it is only
 * a parity check), TRAIL_MEASURE_REPEATS (default 5), TRAIL_MEASURE_PARITY_ROWS (default 600),
 * TRAIL_MEASURE_OUT (a file the report is appended to), TRAIL_MEASURE_HOST, TRAIL_MEASURE_MYSQL_PORT
 * (33306), TRAIL_MEASURE_PGSQL_PORT (35432) and TRAIL_MEASURE_PASSWORD. The databases must be
 * throwaway ones: the table is dropped, created and filled with generated rows.
 */
uses(TestCase::class);

it('measures the overview queries and checks that they agree', function () {
    ini_set('memory_limit', '2G');

    $measurement = OverviewMeasurement::fromEnvironment();
    $measurement->run();

    expect($measurement->findings)->toBe([]);
})->skip(fn () => getenv('TRAIL_MEASURE') !== '1', 'Set TRAIL_MEASURE=1 to run the overview measurement.');
