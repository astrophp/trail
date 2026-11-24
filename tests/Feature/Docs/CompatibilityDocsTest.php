<?php

use Astro\Trail\Tests\Fixtures\Docs\Pages;

/*
|--------------------------------------------------------------------------
| The README's compatibility table is what CI runs
|--------------------------------------------------------------------------
|
| The `laravel/ai`, Laravel and PHP versions the README says are tested are the versions in the
| matrices of the sdk and php jobs of .github/workflows/tests.yml. The test fails when a version
| is added to or dropped from CI and not from the table, or the other way round.
|
*/

/**
 * The quoted values of one matrix list of one job in the tests workflow, such as
 * `php: ['8.3', '8.4']`.
 *
 * @return list<string>
 */
function workflowMatrix(string $job, string $key): array
{
    $workflow = Pages::read(Pages::root().'/.github/workflows/tests.yml');

    if (preg_match('/^  '.preg_quote($job, '/').':\n(.*?)(?=^  \S|\z)/ms', $workflow, $block) !== 1) {
        throw new RuntimeException("tests.yml has no {$job} job.");
    }

    if (preg_match('/^\s+'.preg_quote($key, '/').': \[(.*?)\]$/m', $block[1], $match) !== 1) {
        throw new RuntimeException("The {$job} job of tests.yml has no {$key} matrix.");
    }

    preg_match_all("/'([^']+)'/", $match[1], $values);

    return array_map(fn (string $value) => rtrim($value, '.*'), $values[1]);
}

/**
 * The versions of one row of the README's compatibility table.
 *
 * @return list<string>
 */
function compatibilityRow(string $label): array
{
    $readme = Pages::read(Pages::root().'/README.md');

    if (preg_match('/^\| '.preg_quote($label, '/').' \| (.*?) \|$/m', $readme, $match) !== 1) {
        throw new RuntimeException("The README's compatibility table has no {$label} row.");
    }

    return array_map('trim', explode(',', $match[1]));
}

it('lists the laravel/ai versions CI tests', function () {
    expect(compatibilityRow('`laravel/ai`'))->toEqual(workflowMatrix('sdk', 'sdk'));
});

it('lists the PHP versions CI tests', function () {
    expect(compatibilityRow('PHP'))->toEqual(workflowMatrix('php', 'php'));
});

it('lists the Laravel versions CI tests', function () {
    expect(compatibilityRow('Laravel'))->toEqual(workflowMatrix('php', 'laravel'));
});
