<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| The runs just before and after a run in a view of the list
|--------------------------------------------------------------------------
|
| The list is the reference: stepping through the neighbours must visit exactly the ids the list
| returns, in its order, whatever the sort, the ties and the missing values.
|
*/

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:00:00');
});

afterEach(fn () => Carbon::setTestNow());

/**
 * Runs that make every sort awkward: equal values, several runs without a duration or a cost,
 * costs that differ only in the tenth decimal, and names that differ in case only. The ids do not
 * follow any of the sorts.
 */
function neighbourDataset(): void
{
    $rows = [
        // id, name, started_at, duration_ms, cost
        ['n07', 'alpha', '2026-01-02 10:00:00', 100.0, 0.1234567890],
        ['n02', 'Alpha', '2026-01-02 10:00:00', 100.0, 0.1234567891],
        ['n11', 'ALPHA', '2026-01-02 09:00:00', 250.5, 0.1234567891],
        ['n05', 'beta', '2026-01-02 11:00:00', null, null],
        ['n09', 'Beta', '2026-01-02 11:00:00', 100.0, 0.5],
        ['n01', 'beta', '2026-01-02 08:00:00', null, 0.5],
        ['n12', 'gamma', '2026-01-02 08:00:00', 7.25, null],
        ['n04', 'gamma', '2026-01-02 10:30:00', null, null],
        ['n10', 'Gamma', '2026-01-02 10:30:00', 7.25, 0.0],
        ['n03', 'delta', '2026-01-02 06:00:00', null, null],
        ['n08', 'delta', '2026-01-02 06:00:00', 0.5, 12.0],
        ['n06', 'delta', '2026-01-02 06:00:00', 0.5, 12.0],
    ];

    foreach ($rows as [$id, $name, $startedAt, $duration, $cost]) {
        Rows::trace(['id' => $id, 'name' => $name, 'status' => Status::Completed, 'started_at' => $startedAt, 'duration_ms' => $duration, 'cost' => $cost]);
    }
}

/**
 * @return list<string>
 */
function listedIds(mixed $test, string $query): array
{
    $response = $test->getJson('/trail/api/traces?per_page=100'.($query === '' ? '' : '&'.$query));
    $response->assertOk();

    return array_column($response->json('data'), 'id');
}

/**
 * @return array{previous: ?string, next: ?string}
 */
function neighboursOf(mixed $test, string $id, string $query = ''): array
{
    $response = $test->getJson("/trail/api/traces/{$id}/neighbours".($query === '' ? '' : '?'.$query));
    $response->assertOk();

    return $response->json('data');
}

/**
 * The ids met by stepping from a run in one direction until there is no further run.
 *
 * @return list<string>
 */
function walkFrom(mixed $test, string $id, string $direction, string $query): array
{
    $visited = [$id];

    while (($id = neighboursOf($test, $id, $query)[$direction]) !== null) {
        expect(in_array($id, $visited, true))->toBeFalse('The walk met a run twice.');
        $visited[] = $id;
        expect(count($visited))->toBeLessThan(1000);
    }

    return $visited;
}

/**
 * Every run the list shows has the neighbours the list puts around it.
 */
function expectNeighboursOfList(mixed $test, string $query, int $atLeast = 3): void
{
    $ids = listedIds($test, $query);

    expect(count($ids))->toBeGreaterThanOrEqual($atLeast);

    foreach ($ids as $position => $id) {
        expect(neighboursOf($test, $id, $query))->toBe([
            'previous' => $ids[$position - 1] ?? null,
            'next' => $ids[$position + 1] ?? null,
        ], "Neighbours of {$id} in [{$query}]");
    }
}

describe('stepping through a view', function () {
    it('walks the list in its order, both ways, for every sort', function (string $sort) {
        neighbourDataset();

        $ids = listedIds($this, "sort={$sort}");
        expect($ids)->toHaveCount(12)
            ->and(walkFrom($this, $ids[0], 'next', "sort={$sort}"))->toBe($ids)
            ->and(walkFrom($this, $ids[11], 'previous', "sort={$sort}"))->toBe(array_reverse($ids));
    })->with([
        'started_at' => ['started_at'], '-started_at' => ['-started_at'],
        'duration' => ['duration'], '-duration' => ['-duration'],
        'cost' => ['cost'], '-cost' => ['-cost'],
        'agent' => ['agent'], '-agent' => ['-agent'],
    ]);

    it('puts the runs without a value last, ordered by id in the direction of the sort', function () {
        neighbourDataset();

        // n01, n03, n04 and n05 have no duration: they come last, by id in the direction of the sort.
        expect(listedIds($this, 'sort=duration'))->toBe(['n06', 'n08', 'n10', 'n12', 'n02', 'n07', 'n09', 'n11', 'n01', 'n03', 'n04', 'n05'])
            ->and(neighboursOf($this, 'n11', 'sort=duration'))->toBe(['previous' => 'n09', 'next' => 'n01'])
            ->and(neighboursOf($this, 'n01', 'sort=duration'))->toBe(['previous' => 'n11', 'next' => 'n03'])
            ->and(neighboursOf($this, 'n05', 'sort=duration'))->toBe(['previous' => 'n04', 'next' => null])
            ->and(neighboursOf($this, 'n11', 'sort=-duration'))->toBe(['previous' => null, 'next' => 'n09'])
            // Descending, the first run without a duration follows the last one with it.
            ->and(neighboursOf($this, 'n05', 'sort=-duration'))->toBe(['previous' => 'n06', 'next' => 'n04'])
            ->and(neighboursOf($this, 'n01', 'sort=-duration'))->toBe(['previous' => 'n03', 'next' => null]);
    });

    it('tells costs that differ in the tenth decimal apart', function () {
        Rows::trace(['id' => 'c1', 'status' => Status::Completed, 'cost' => 0.1234567890]);
        Rows::trace(['id' => 'c2', 'status' => Status::Completed, 'cost' => 0.1234567891]);
        Rows::trace(['id' => 'c3', 'status' => Status::Completed, 'cost' => 0.1234567892]);

        expect(neighboursOf($this, 'c2', 'sort=cost'))->toBe(['previous' => 'c1', 'next' => 'c3'])
            ->and(neighboursOf($this, 'c2', 'sort=-cost'))->toBe(['previous' => 'c3', 'next' => 'c1']);
    });

    it('breaks ties by id in the direction of the sort', function () {
        foreach (['t3', 't1', 't4', 't2'] as $id) {
            Rows::trace(['id' => $id, 'status' => Status::Completed, 'cost' => 1.5, 'duration_ms' => 10]);
        }

        expect(listedIds($this, 'sort=cost'))->toBe(['t1', 't2', 't3', 't4'])
            ->and(listedIds($this, 'sort=-cost'))->toBe(['t4', 't3', 't2', 't1'])
            ->and(neighboursOf($this, 't2', 'sort=cost'))->toBe(['previous' => 't1', 'next' => 't3'])
            ->and(neighboursOf($this, 't2', 'sort=-cost'))->toBe(['previous' => 't3', 'next' => 't1']);
    });

    it('has no previous run for the first of a view and no next for the last', function () {
        neighbourDataset();

        $ids = listedIds($this, '');

        expect(neighboursOf($this, $ids[0]))->toBe(['previous' => null, 'next' => $ids[1]])
            ->and(neighboursOf($this, $ids[11]))->toBe(['previous' => $ids[10], 'next' => null])
            ->and(neighboursOf($this, $ids[5]))->toBe(['previous' => $ids[4], 'next' => $ids[6]]);
    });

    it('has neither neighbour for the only run of a view', function () {
        neighbourDataset();

        expect(listedIds($this, 'agent=ALPHA'))->toBe(['n11'])
            ->and(neighboursOf($this, 'n11', 'agent=ALPHA'))->toBe(['previous' => null, 'next' => null])
            // Beside a view in which the same run has both.
            ->and(neighboursOf($this, 'n11', 'sort=started_at'))->toBe(['previous' => 'n12', 'next' => 'n02']);
    });

    it('ignores the page and its size', function () {
        neighbourDataset();

        expect(neighboursOf($this, 'n09', 'page=3&per_page=1'))->toBe(neighboursOf($this, 'n09'))
            ->and(neighboursOf($this, 'n09')['next'])->not->toBeNull();
    });
});

describe('filters', function () {
    beforeEach(function () {
        neighbourDataset();

        Rows::trace(['id' => 'f1', 'name' => 'beta', 'status' => Status::Failed, 'started_at' => '2026-01-02 10:15:00', 'duration_ms' => 900, 'cost' => 3, 'conversation_id' => 'c-1']);
        Rows::trace(['id' => 'f2', 'name' => 'beta', 'status' => Status::Failed, 'started_at' => '2026-01-02 10:45:00', 'duration_ms' => 950, 'cost' => 4, 'conversation_id' => 'c-1']);
        Rows::trace(['id' => 'f3', 'name' => 'beta', 'status' => Status::Failed, 'started_at' => '2026-01-02 09:15:00', 'conversation_id' => 'c-1']);
        Rows::trace(['id' => 'f4', 'name' => 'Search me', 'status' => Status::AwaitingApproval, 'started_at' => '2026-01-02 09:45:00', 'prompt_excerpt' => 'find the Needle here']);
        Rows::trace(['id' => 'f5', 'name' => 'Other', 'status' => Status::Completed, 'started_at' => '2026-01-02 09:46:00', 'prompt_excerpt' => 'a needle again']);
        Rows::trace(['id' => 'f6', 'name' => 'Other', 'status' => Status::Completed, 'started_at' => '2026-01-02 09:47:00', 'prompt_excerpt' => 'one more NEEDLE']);
    });

    it('gives the neighbours the list gives under a status, an agent, a search or a conversation filter', function (string $query) {
        foreach (['', '&sort=-cost', '&sort=duration', '&sort=agent'] as $sort) {
            expectNeighboursOfList($this, $query.$sort);
        }
    })->with([
        'status' => ['status=failed'],
        'completed' => ['status=completed'],
        'agent' => ['agent=beta'],
        'search' => ['search=needle'],
        'conversation' => ['conversation=c-1'],
    ]);

    it('gives the neighbours the list gives under a provider filter', function () {
        foreach (Trace::query()->orderBy('id')->get() as $i => $trace) {
            if ($i % 2 === 0) {
                Rows::span($trace, ['provider' => 'openai', 'model' => 'gpt-5', 'started_at' => $trace->started_at]);
            }
        }

        expectNeighboursOfList($this, 'provider=openai');
        expectNeighboursOfList($this, 'provider=openai&model=gpt-5&sort=-cost');
        expect(listedIds($this, 'provider=openai'))->not->toBe(listedIds($this, ''));
    });

    it('gives the neighbours the list gives for bookmarked runs', function () {
        foreach (['n01', 'n04', 'n09', 'f2', 'f4'] as $id) {
            Rows::bookmark(Trace::query()->findOrFail($id));
        }

        expectNeighboursOfList($this, 'bookmarked=1', 5);
        expectNeighboursOfList($this, 'bookmarked=1&sort=-duration', 5);
    });

    it('gives the neighbours the list gives for slow runs', function () {
        foreach (range(1, 60) as $i) {
            Rows::trace(['id' => sprintf('s%02d', $i), 'status' => Status::Completed, 'started_at' => '2026-01-02 11:30:00', 'duration_ms' => 5000 + $i, 'cost' => $i]);
        }

        // Only the slowest few are kept.
        expect(listedIds($this, 'slow=1'))->not->toBe(listedIds($this, ''));
        expectNeighboursOfList($this, 'slow=1');
        expectNeighboursOfList($this, 'slow=1&sort=-duration');
        expectNeighboursOfList($this, 'slow=1&sort=-cost');
    });

    it('follows the stale rule of the list', function () {
        Rows::trace(['id' => 'stale', 'name' => 'beta', 'status' => Status::Running, 'started_at' => '2026-01-02 10:20:00', 'created_at' => Carbon::now()->subHours(2)]);
        Rows::trace(['id' => 'stale-b', 'name' => 'beta', 'status' => Status::Running, 'started_at' => '2026-01-02 09:30:00', 'created_at' => Carbon::now()->subHours(3)]);
        Rows::trace(['id' => 'stale-c', 'name' => 'beta', 'status' => Status::Running, 'started_at' => '2026-01-02 09:35:00', 'created_at' => Carbon::now()->subHours(4)]);
        Rows::trace(['id' => 'live', 'name' => 'beta', 'status' => Status::Running, 'started_at' => '2026-01-02 10:25:00']);
        Rows::trace(['id' => 'stopped', 'name' => 'beta', 'status' => Status::Incomplete, 'started_at' => '2026-01-02 10:10:00']);

        expect(listedIds($this, 'status=incomplete'))->toContain('stale', 'stopped')->not->toContain('live')
            ->and(listedIds($this, 'status=running'))->toBe(['live']);

        expectNeighboursOfList($this, 'status=incomplete', 2);
        expectNeighboursOfList($this, 'issue_kind=abandoned');

        expect(neighboursOf($this, 'stale', 'status=incomplete&sort=started_at'))->toBe(['previous' => 'stopped', 'next' => null])
            // Not in the running view, where only the live run is.
            ->and(neighboursOf($this, 'stale', 'status=running'))->toBe(['previous' => null, 'next' => null])
            ->and(neighboursOf($this, 'live', 'status=running'))->toBe(['previous' => null, 'next' => null])
            ->and(neighboursOf($this, 'stale'))->not->toBe(['previous' => null, 'next' => null]);
    });
});

describe('a run outside the view', function () {
    it('has neither neighbour when a filter leaves it out', function () {
        neighbourDataset();
        Rows::trace(['id' => 'failed', 'name' => 'beta', 'status' => Status::Failed, 'started_at' => '2026-01-02 10:40:00']);

        expect(neighboursOf($this, 'failed', 'status=completed'))->toBe(['previous' => null, 'next' => null])
            ->and(neighboursOf($this, 'failed', 'agent=Nobody'))->toBe(['previous' => null, 'next' => null])
            ->and(neighboursOf($this, 'failed', 'slow=1'))->toBe(['previous' => null, 'next' => null])
            ->and(neighboursOf($this, 'failed'))->not->toBe(['previous' => null, 'next' => null]);
    });

    it('has neither neighbour when it started outside the range', function () {
        neighbourDataset();
        Rows::trace(['id' => 'old', 'status' => Status::Completed, 'started_at' => '2026-01-01 09:00:00']);
        Rows::trace(['id' => 'older', 'status' => Status::Completed, 'started_at' => '2026-01-01 08:00:00']);

        expect(neighboursOf($this, 'old'))->toBe(['previous' => null, 'next' => null])
            ->and(neighboursOf($this, 'old', 'range=1h'))->toBe(['previous' => null, 'next' => null])
            ->and(neighboursOf($this, 'old', 'range=7d'))->toBe(['previous' => 'n03', 'next' => 'older'])
            ->and(neighboursOf($this, 'old', 'from=2026-01-01T07:00:00&to=2026-01-01T10:00:00'))->toBe(['previous' => null, 'next' => 'older']);
    });

    it('answers a JSON 404 for an unknown run', function () {
        neighbourDataset();

        $this->getJson('/trail/api/traces/nothing/neighbours')->assertNotFound()->assertJsonStructure(['message']);
        $this->getJson('/trail/api/traces/nothing/neighbours?status=failed')->assertNotFound()->assertJsonStructure(['message']);
    });

    it('does not touch the database for an id the column could not hold', function (string $sent) {
        $queries = 0;
        DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->getJson("/trail/api/traces/{$sent}/neighbours")->assertNotFound()->assertJsonStructure(['message']);

        expect($queries)->toBe(0);
    })->with([
        'too long' => [str_repeat('x', 65)],
        'a null byte' => ['a%00b'],
    ]);
});

describe('invalid input and access', function () {
    it('refuses what the list refuses', function (string $query, string $field) {
        neighbourDataset();

        $this->getJson("/trail/api/traces/n01/neighbours?{$query}")->assertUnprocessable()->assertJsonValidationErrors([$field]);
        $this->getJson("/trail/api/traces?{$query}")->assertUnprocessable()->assertJsonValidationErrors([$field]);
    })->with([
        'sort' => ['sort=cheapest', 'sort'],
        'range' => ['range=2d', 'range'],
        'range with from' => ['range=1h&from=2026-01-01T00:00:00', 'range'],
        'status' => ['status=sleeping', 'status'],
    ]);

    it('answers a denied request with a JSON 403, even when HTML is asked for', function () {
        neighbourDataset();
        $this->app['env'] = 'production';

        $this->get('/trail/api/traces/n01/neighbours', ['Accept' => 'text/html'])->assertForbidden()->assertJsonStructure(['message']);

        Trail::auth(fn () => true);

        $this->get('/trail/api/traces/n01/neighbours', ['Accept' => 'text/html'])->assertOk();

        // Rolling back this test's migrations asks for confirmation in production.
        $this->app['env'] = 'local';
    });
});

describe('cost of the read', function () {
    it('runs the same few queries for five runs as for three hundred', function () {
        $queries = function (string $id, string $query): int {
            $count = 0;
            DB::listen(function () use (&$count) {
                $count++;
            });

            $this->getJson("/trail/api/traces/{$id}/neighbours?{$query}");

            return $count;
        };

        $make = function (int $from, int $to) {
            foreach (range($from, $to) as $i) {
                Rows::trace([
                    'id' => sprintf('run-%03d', $i), 'status' => Status::Completed, 'name' => 'Agent '.($i % 7),
                    'started_at' => '2026-01-02 10:00:00', 'duration_ms' => $i % 3 === 0 ? null : $i % 11, 'cost' => $i % 5 === 0 ? null : $i % 13,
                ]);
            }
        };

        $make(1, 5);
        $few = [$queries('run-003', 'sort=-cost'), $queries('run-003', 'sort=agent&status=completed'), $queries('nothing-here', '')];

        $make(6, 300);
        $many = [$queries('run-003', 'sort=-cost'), $queries('run-003', 'sort=agent&status=completed'), $queries('nothing-here', '')];

        expect($many)->toBe($few)
            // One read for the run, and one for each neighbour; an unknown run takes two.
            ->and($many)->toBe([3, 3, 2]);
    });
});
