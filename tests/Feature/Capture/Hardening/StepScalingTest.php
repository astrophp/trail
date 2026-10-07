<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Tests\Fixtures\Agents\ManyStepsAgent;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\CountingStore;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Replay;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Reports;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Ai\Responses\Data\ToolCall;

/*
|--------------------------------------------------------------------------
| Many steps
|--------------------------------------------------------------------------
|
| Every step records the messages it sends, which are the whole history so far.
| Trail's time per step, and the bytes it stores per step, must not grow with the
| history. Marked slow: the 200-step runs take a few seconds.
|
*/

beforeEach(function () {
    config(['cache.default' => 'array']);

    Event::forget('Laravel\Ai\Events\*');
    $this->reports = Reports::capture();

    /** A run of $steps tool-calling steps and a last answer; each tool returns about 2,000 characters. */
    $this->run = function (int $steps): void {
        $script = [];

        for ($i = 0; $i < $steps; $i++) {
            $script[] = new ToolCall("call_$i", 'fetch', ['query' => "q$i"]);
        }

        ManyStepsAgent::fake([...$script, 'Done']);

        (new ManyStepsAgent([new CallbackTool('fetch', fn () => str_repeat('a result of some length. ', 80))]))->prompt('Hi');
    };
});

it('spends time per step that does not grow with the history (200 steps)', function () {
    $store = new CountingStore;
    $this->app->instance(TraceStore::class, $store);

    $with = [];
    $flush = [];

    foreach ([25, 50, 100, 200] as $steps) {
        $with[$steps] = Replay::ms(fn () => ($this->run)($steps));
        $flush[$steps] = Replay::ms(fn () => Trail::flush());
    }

    Replay::detach();

    $without = [];

    foreach ([25, 50, 100, 200] as $steps) {
        $without[$steps] = Replay::ms(fn () => ($this->run)($steps));
    }

    $curve = [];

    foreach ([25, 50, 100, 200] as $steps) {
        $curve[$steps] = $with[$steps] - $without[$steps];
        Replay::say(sprintf('%3d steps: %6.0f ms with Trail, %5.0f ms without -> Trail %6.0f ms (%.2f ms per step); flush %.0f ms', $steps, $with[$steps], $without[$steps], $curve[$steps], $curve[$steps] / $steps, $flush[$steps]));
    }

    // Linear in the steps would make 200 steps cost 8 times 25; allow some slack, fail on the square.
    expect($curve[200] / max($curve[25], 1))->toBeLessThan(8 * 2.5);
})->group('slow');

it('stores about as many bytes per step at 100 steps as at 10', function () {
    $stored = function (int $steps): int {
        DB::table('trail_spans')->delete();
        DB::table('trail_traces')->delete();

        ($this->run)($steps);
        Trail::flush();

        return (int) DB::table('trail_spans')->selectRaw('sum(length(input)) as bytes')->value('bytes');
    };

    $ten = $stored(10);
    $hundred = $stored(100);

    Replay::say(sprintf('bytes stored in step inputs: 10 steps %d KB (%d KB per step), 100 steps %d KB (%d KB per step)', $ten / 1024, $ten / 10 / 1024, $hundred / 1024, $hundred / 100 / 1024));

    expect($hundred / 100)->toBeLessThan(($ten / 10) * 3);
})->group('slow');

it('writes no single statement larger than a default MariaDB max_allowed_packet (16 MB) for a long run with a long multibyte history', function () {
    // A server rejects a statement above max_allowed_packet (4 MB on MySQL 5.7, 16 MB on MariaDB, 64 MB on MySQL 8); the
    // whole transaction goes with it and the trace is lost. SQLite takes anything, so the size is measured, not the failure.
    $sizes = [];

    DB::listen(function ($query) use (&$sizes) {
        if (str_starts_with($query->sql, 'insert into "trail_spans"') || str_starts_with($query->sql, 'insert into `trail_spans`')) {
            $sizes[] = array_sum(array_map(fn ($binding) => is_string($binding) ? strlen($binding) : 8, $query->bindings));
        }
    });

    $script = [];

    for ($i = 0; $i < 120; $i++) {
        $script[] = new ToolCall("call_$i", 'fetch', ['query' => "q$i"]);
    }

    ManyStepsAgent::fake([...$script, 'Done']);
    (new ManyStepsAgent([new CallbackTool('fetch', fn () => str_repeat("\u{1F600}", 9000))]))->prompt('Hi');

    Trail::flush();

    Replay::say(sprintf('120 steps with 9,000-emoji tool results: %d span inserts, largest %.1f MB, total %.1f MB, %d reports', count($sizes), max($sizes) / 1048576, array_sum($sizes) / 1048576, $this->reports->count()));

    // The run's spans all arrived, in statements well under the packet limit.
    expect(max($sizes))->toBeLessThan(16 * 1048576)
        ->and(DB::table('trail_spans')->count())->toBe(242)
        ->and($this->reports->count())->toBe(0);
})->group('slow');
