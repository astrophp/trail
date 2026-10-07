<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\ManyStepsAgent;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Replay;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Scenarios;
use Astro\Trail\Tests\Fixtures\Storage\Transactions;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Ai\Responses\Data\ToolCall;

/*
|--------------------------------------------------------------------------
| The cost of recording
|--------------------------------------------------------------------------
|
| Between the start of an AI call and its return Trail may issue exactly one
| query (the early insert into trail_traces) and begin no transaction; a
| skipped run issues none. The batch write at the flush is bounded and does
| not issue a query per span. The numbers are printed to stderr when the
| TRAIL_HARDENING_REPORT environment variable is set.
|
*/

beforeEach(function () {
    config(['cache.default' => 'array']);

    $this->measure = function (Closure $call): array {
        $queries = [];
        $began = 0;

        DB::listen(function ($query) use (&$queries) {
            $queries[] = $query->sql;
        });
        Event::listen(TransactionBeginning::class, function () use (&$began) {
            $began++;
        });

        $call();

        return [$queries, $began];
    };
});

it('issues exactly one query and begins no transaction during the call, for every run shape', function (string $shape) {
    Transactions::outside(function () use ($shape) {
        [$queries, $began] = ($this->measure)(Scenarios::all()[$shape]);

        expect($queries)->toHaveCount(1, "[$shape] issued: ".implode(' | ', $queries))
            ->and($queries[0])->toMatch('/^insert into ["`]?trail_traces/i')
            ->and($began)->toBe(0);
    });
})->with(array_keys(Scenarios::all()));

it('issues no query and begins no transaction for a skipped run, for every run shape', function (string $shape) {
    Trail::filter(fn () => false);

    Transactions::outside(function () use ($shape) {
        [$queries, $began] = ($this->measure)(Scenarios::all()[$shape]);

        expect($queries)->toBe([], "[$shape] issued: ".implode(' | ', $queries))->and($began)->toBe(0);
    });
})->with(array_keys(Scenarios::all()));

it('issues no query for a run skipped by sampling or by withoutRecording, for every run shape', function (string $shape, string $how) {
    match ($how) {
        'sampling' => config(['trail.sampling' => 0]),
        default => null,
    };

    Transactions::outside(function () use ($shape, $how) {
        $call = Scenarios::all()[$shape];
        [$queries, $began] = ($this->measure)(fn () => $how === 'without' ? Trail::withoutRecording($call) : $call());

        expect($queries)->toBe([], "[$shape/$how] issued: ".implode(' | ', $queries))->and($began)->toBe(0);
    });
})->with(array_keys(Scenarios::all()))->with(['sampling', 'without']);

it('writes a bounded number of queries at the flush, not one per span', function () {
    $small = null;
    $large = null;

    Transactions::outside(function () use (&$small, &$large) {
        $count = fn (int $tools) => (function () use ($tools) {
            $calls = [];

            for ($i = 0; $i < $tools; $i++) {
                $calls[] = new ToolCall("call_$i", 'lookup', ['query' => "q$i"]);
            }

            ManyStepsAgent::fake([...$calls, 'Done']);
            (new ManyStepsAgent([new LookupTool]))->prompt('Hi');

            $queries = [];
            DB::listen(function ($query) use (&$queries) {
                $queries[] = $query->sql;
            });

            Trail::flush();

            return $queries;
        })();

        $small = $count(1);
        DB::table('trail_spans')->delete();
        DB::table('trail_traces')->delete();
        $large = $count(120);
    });

    $spans = fn (int $tools) => 2 + $tools * 3;

    if (getenv('TRAIL_HARDENING_REPORT')) {
        fwrite(STDERR, sprintf("\n[flush queries] %d spans: %d queries; %d spans: %d queries\n", $spans(1), count($small), $spans(120), count($large)));
    }

    // Chunked inserts grow with the spans (25 rows each, for SQLite's parameter limit), but a query per span must never happen.
    expect(count($large))->toBeLessThan(120 + 30)
        ->and(count($large))->toBeLessThan(count($small) + 40);
});

it('adds under 50 ms of its own to a realistic run, flush included, for every run shape', function (string $shape) {
    $call = Scenarios::all()[$shape];

    // Warm up everything that is built once per process: the container, the price book, the compiled patterns.
    $call();
    Trail::flush();

    $median = function (Closure $measure): float {
        $times = [$measure(), $measure(), $measure(), $measure(), $measure()];
        sort($times);

        return $times[2];
    };

    $with = $median(function () use ($call) {
        $start = hrtime(true);
        $call();
        Trail::flush();

        return (hrtime(true) - $start) / 1e6;
    });

    Replay::detach();

    $without = $median(function () use ($call) {
        $start = hrtime(true);
        $call();

        return (hrtime(true) - $start) / 1e6;
    });

    Replay::say(sprintf('%-26s %6.1f ms with Trail (flush included), %6.1f ms without: Trail adds %.1f ms', $shape, $with, $without, $with - $without));

    expect($with - $without)->toBeLessThan(50);
})->with(array_keys(Scenarios::all()));
