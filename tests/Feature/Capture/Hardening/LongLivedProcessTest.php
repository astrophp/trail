<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\CountingStore;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Replay;
use Astro\Trail\Tests\Fixtures\Capture\Streams;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Ai\Embeddings;

/*
|--------------------------------------------------------------------------
| Long-lived processes
|--------------------------------------------------------------------------
|
| A queue worker flushes between jobs and a request ends, but a console command
| that loops, a daemon or a test suite may never reach a flush point. Memory and
| time per run must stay flat there. Events are replayed straight into the
| dispatcher so thousands of runs cost the SDK nothing.
|
*/

beforeEach(function () {
    config(['cache.default' => 'array']);

    // The test harness logs every SDK event, which would be the memory being measured.
    Event::forget('Laravel\Ai\Events\*');

    $this->store = new CountingStore;
    $this->app->instance(TraceStore::class, $this->store);

    Replay::reset();
    Replay::run((string) Str::uuid7());
    Trail::flush();
    $this->store = new CountingStore;
    $this->app->instance(TraceStore::class, $this->store);
});

it('keeps memory and time per run flat over 5,000 completed runs with no flush point', function () {
    $block = function (int $from, int $to): float {
        return Replay::ms(function () use ($from, $to) {
            for ($i = $from; $i < $to; $i++) {
                Replay::run((string) Str::uuid7(), steps: 2);
            }
        });
    };

    $first = $block(0, 500);
    $block(500, 1000);
    $memoryAt1000 = Replay::memory();
    $block(1000, 4500);
    $last = $block(4500, 5000);
    $memoryAt5000 = Replay::memory();

    Replay::say(sprintf('5,000 completed runs: first 500 %.0f ms, last 500 %.0f ms, memory %d KB at run 1,000 -> %d KB at run 5,000, held %s, %d traces written', $first, $last, $memoryAt1000 / 1024, $memoryAt5000 / 1024, json_encode(Replay::held()), $this->store->stores));

    expect($memoryAt5000 - $memoryAt1000)->toBeLessThan(2 * 1024 * 1024)
        ->and($last)->toBeLessThan($first * 3 + 50)
        ->and(Replay::held()['buffers'])->toBeLessThanOrEqual(101)
        ->and(Replay::held()['runs'])->toBe(0);
})->group('slow');

it('keeps memory and time per run flat over 5,000 skipped runs', function () {
    Trail::filter(fn () => false);

    $block = fn (int $count) => Replay::ms(function () use ($count) {
        for ($i = 0; $i < $count; $i++) {
            Replay::run((string) Str::uuid7());
        }
    });

    $first = $block(500);
    $block(500);
    $memoryAt1000 = Replay::memory();
    $block(3500);
    $last = $block(500);
    $memoryAt5000 = Replay::memory();

    Replay::say(sprintf('5,000 skipped runs: first 500 %.0f ms, last 500 %.0f ms, memory %d KB -> %d KB, held %s', $first, $last, $memoryAt1000 / 1024, $memoryAt5000 / 1024, json_encode(Replay::held())));

    expect($memoryAt5000 - $memoryAt1000)->toBeLessThan(1024 * 1024)
        ->and($last)->toBeLessThan($first * 3 + 50)
        ->and($this->store->starts)->toBe(0);
});

it('does not hold on to 5,000 abandoned streams', function () {
    $before = Replay::memory();

    for ($i = 0; $i < 5000; $i++) {
        $id = (string) Str::uuid7();
        Replay::start($id, streamed: true);
        Replay::openStep($id);
    }

    $after = Replay::memory();

    Replay::say(sprintf('5,000 abandoned streams, held %s, %d start inserts, memory +%d KB (%d bytes each)', json_encode(Replay::held()), $this->store->starts, ($after - $before) / 1024, ($after - $before) / 5000));

    // An abandoned stream never fires a terminal event. A process with no flush point must still bound what it keeps.
    expect(Replay::held()['runs'])->toBeLessThan(1000)
        ->and(Replay::held()['buffers'])->toBeLessThan(1000);
});

it('keeps the time of a finishing run flat while abandoned streams pile up', function () {
    $block = fn (int $count) => Replay::ms(function () use ($count) {
        for ($i = 0; $i < $count; $i++) {
            $abandoned = (string) Str::uuid7();
            Replay::start($abandoned, streamed: true);
            Replay::openStep($abandoned);
            Replay::run((string) Str::uuid7());
        }
    });

    $first = $block(200);
    $block(4600);
    $last = $block(200);

    Replay::say(sprintf('finishing runs beside abandoned streams: first 200 pairs %.0f ms, 200 pairs after 4,800 abandoned %.0f ms (%.1fx), held %s', $first, $last, $last / max($first, 0.001), json_encode(Replay::held())));

    // The time of a finishing run does not grow with the pile (a little slack for a busy machine).
    expect($last)->toBeLessThan($first * 2 + 50);
})->group('slow');

it('does not hold on to 5,000 standalone embeddings calls that never ended', function () {
    for ($i = 0; $i < 5000; $i++) {
        Replay::embeddingStart((string) Str::uuid7());
    }

    Replay::say('5,000 embeddings calls with no end event, held '.json_encode(Replay::held()));

    expect(Replay::held()['embeddings'])->toBeLessThan(1000)
        ->and(Replay::held()['buffers'])->toBeLessThan(1000);
});

it('holds no more than its limit of real standalone embeddings calls that failed, as a loop that catches the error leaves them', function () {
    Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'bad']], 500)]);

    for ($i = 0; $i < 300; $i++) {
        try {
            Embeddings::for(['a'])->generate();
        } catch (Throwable) {
        }
    }

    Replay::say('300 real standalone embeddings calls that failed: held '.json_encode(Replay::held()));

    // A failed call fires no event, so nothing ever closes it; the recorder's limit only covers finished traces.
    expect(Replay::held()['buffers'])->toBeLessThanOrEqual(101)
        ->and(Replay::held()['embeddings'])->toBeLessThanOrEqual(101);
});

it('holds no more than its limit of real streams that were abandoned', function () {
    for ($i = 0; $i < 300; $i++) {
        Streams::abandonedAfter(2);
    }

    Replay::say('300 real abandoned streams: held '.json_encode(Replay::held()));

    expect(Replay::held()['buffers'])->toBeLessThanOrEqual(101)
        ->and(Replay::held()['runs'])->toBeLessThanOrEqual(101);
});

it('is empty after every flush in a worker loop, and keeps memory flat over 1,000 iterations', function () {
    $iterations = function (int $count) {
        for ($i = 0; $i < $count; $i++) {
            Replay::run((string) Str::uuid7(), steps: 2);
            Trail::flush();
        }
    };

    $iterations(200);
    $before = Replay::memory();
    $iterations(1000);
    $after = Replay::memory();

    Replay::say(sprintf('worker loop with flushes: memory %d KB -> %d KB over 1,000 iterations', $before / 1024, $after / 1024));

    expect(Replay::held())->toBe(['runs' => 0, 'buffers' => 0, 'embeddings' => 0, 'skipped' => 0])
        ->and($after - $before)->toBeLessThan(512 * 1024);
});
