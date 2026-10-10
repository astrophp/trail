<?php

use Astro\Trail\Tests\Performance\SearchMeasurement;
use Astro\Trail\Tests\TestCase;

/*
 * An opt-in measurement of the reads behind GET /api/search, with the indexes of the migrations
 * only. It is not part of the default suites (phpunit.xml does not list this directory) and skips
 * unless TRAIL_MEASURE=1.
 *
 *   TRAIL_MEASURE=1 TRAIL_MEASURE_DATABASES=sqlite,mysql,pgsql TRAIL_MEASURE_ROWS=1000000 \
 *       vendor/bin/pest tests/Performance/SearchQueriesTest.php
 *
 * Other variables: TRAIL_MEASURE_SQLITE_ROWS (rows SQLite is filled with, default 5000; it is only
 * a sanity check), TRAIL_MEASURE_REPEATS (default 5), TRAIL_MEASURE_OUT (a file the report is
 * appended to), TRAIL_MEASURE_HOST, TRAIL_MEASURE_MYSQL_PORT (33306), TRAIL_MEASURE_PGSQL_PORT
 * (35432) and TRAIL_MEASURE_PASSWORD. The databases must be throwaway ones: the tables are
 * dropped, created and filled with generated rows. Keep their data directories in memory
 * (a tmpfs) so that a million runs do not fill a disk.
 */
uses(TestCase::class);

it('measures the search reads and checks that they find what the fixture holds', function () {
    ini_set('memory_limit', '2G');

    $measurement = SearchMeasurement::fromEnvironment();
    $measurement->run();

    expect($measurement->findings)->toBe([]);
})->skip(fn () => getenv('TRAIL_MEASURE') !== '1', 'Set TRAIL_MEASURE=1 to run the search measurement.');
