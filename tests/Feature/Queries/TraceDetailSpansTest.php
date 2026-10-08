<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Queries\TraceDetail;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| The first spans of several runs, read together
|--------------------------------------------------------------------------
*/

/**
 * Spans in bulk, one a sequence, in the order given.
 *
 * @param  list<int>  $sequences
 */
function spansOfRun(Trace $trace, array $sequences, string $prefix): void
{
    $now = '2026-01-02 12:00:00.000';

    foreach (array_chunk($sequences, 250) as $chunk) {
        DB::table('trail_spans')->insert(array_map(fn (int $sequence): array => [
            'id' => sprintf('%s-%05d', $prefix, $sequence), 'trace_id' => $trace->id, 'type' => 'step', 'name' => 'step', 'status' => 'completed',
            'sequence' => $sequence, 'started_at' => $now, 'created_at' => $now, 'updated_at' => $now,
        ], $chunk));
    }
}

it('reads nothing for no runs', function () {
    DB::enableQueryLog();

    expect((new TraceDetail)->spansOf([]))->toBe([])
        ->and(DB::getQueryLog())->toBe([]);
});

it('gives each run its own spans in recording order, ties by id, in one read', function () {
    $one = Rows::trace(['id' => 'one', 'status' => Status::Completed]);
    $two = Rows::trace(['id' => 'two', 'status' => Status::Completed]);
    $empty = Rows::trace(['id' => 'empty', 'status' => Status::Completed]);

    spansOfRun($one, [3, 1, 2], 'a');
    spansOfRun($two, [2, 1], 'b');
    Rows::span($one, ['id' => 'a-00002x', 'sequence' => 2]);

    DB::enableQueryLog();
    $pages = (new TraceDetail)->spansOf([$one, $two, $empty]);
    $queries = count(DB::getQueryLog());

    expect($queries)->toBe(1)
        ->and(array_keys($pages))->toBe(['one', 'two', 'empty'])
        ->and($pages['one']['spans']->pluck('id')->all())->toBe(['a-00001', 'a-00002', 'a-00002x', 'a-00003'])
        ->and($pages['two']['spans']->pluck('id')->all())->toBe(['b-00001', 'b-00002'])
        ->and($pages['empty'])->toBe(['spans' => $pages['empty']['spans'], 'total' => 0, 'truncated' => false])
        ->and($pages['empty']['spans'])->toHaveCount(0)
        ->and([$pages['one']['total'], $pages['one']['truncated']])->toBe([4, false]);
});

it('cuts each run at the limit on its own, and counts only the runs that went past it', function () {
    $exact = Rows::trace(['id' => 'exact', 'status' => Status::Completed]);
    $past = Rows::trace(['id' => 'past', 'status' => Status::Completed]);
    $way = Rows::trace(['id' => 'way', 'status' => Status::Completed]);

    spansOfRun($exact, range(1, 2000), 'e');
    spansOfRun($past, range(1, 2001), 'p');
    spansOfRun($way, range(1, 2300), 'w');

    DB::enableQueryLog();
    $pages = (new TraceDetail)->spansOf([$exact, $past, $way]);
    $log = DB::getQueryLog();

    expect($log)->toHaveCount(2)
        ->and(stripos($log[1]['query'], 'count(') !== false)->toBeTrue()
        ->and([$pages['exact']['total'], $pages['exact']['truncated'], $pages['exact']['spans']->count()])->toBe([2000, false, 2000])
        ->and([$pages['past']['total'], $pages['past']['truncated'], $pages['past']['spans']->count()])->toBe([2001, true, 2000])
        ->and([$pages['way']['total'], $pages['way']['truncated'], $pages['way']['spans']->count()])->toBe([2300, true, 2000])
        ->and($pages['past']['spans']->last()?->id)->toBe('p-02000')
        ->and($pages['way']['spans']->first()?->id)->toBe('w-00001');
});

it('does not count when no run went past the limit', function () {
    $run = Rows::trace(['id' => 'run', 'status' => Status::Completed]);
    spansOfRun($run, range(1, 5), 'r');

    DB::enableQueryLog();
    (new TraceDetail)->spansOf([$run]);

    expect(DB::getQueryLog())->toHaveCount(1);
});

it('leaves the helper column of the read on none of the spans', function () {
    $run = Rows::trace(['id' => 'run', 'status' => Status::Completed]);
    spansOfRun($run, range(1, 3), 'r');

    foreach ((new TraceDetail)->spansOf([$run])['run']['spans'] as $span) {
        expect(array_key_exists('trail_place', $span->getAttributes()))->toBeFalse()
            ->and($span->toArray())->not->toHaveKey('trail_place');
    }
});
