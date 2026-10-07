<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Replay;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Scenarios;
use Astro\Trail\Tests\Fixtures\Storage\Transactions;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

/*
|--------------------------------------------------------------------------
| A call that pays for everyone else's write
|--------------------------------------------------------------------------
|
| A process with no flush point (a console command that loops over records, a
| daemon) necessarily writes inside a call once it holds more traces than its
| limit. Each terminal event writes at most two of the oldest, so no call pays for
| more than that and the backlog drains over the calls that follow.
|
*/

it('makes no AI call pay for more than two traces\' writes, however many runs came before it', function () {
    config(['cache.default' => 'array']);

    Transactions::outside(function () {
        $seen = ['queries' => 0, 'began' => 0];

        DB::listen(function () use (&$seen) {
            $seen['queries']++;
        });
        Event::listen(TransactionBeginning::class, function () use (&$seen) {
            $seen['began']++;
        });

        // What writing one trace costs, measured on a trace written by a flush.
        Scenarios::hello();
        $seen = ['queries' => 0, 'began' => 0];
        Trail::flush();
        $write = $seen;

        $perCall = [];
        $transactionsPerCall = [];
        $times = [];

        for ($call = 1; $call <= 130; $call++) {
            $seen = ['queries' => 0, 'began' => 0];

            $times[$call] = Replay::ms(fn () => Scenarios::hello());
            $perCall[$call] = $seen['queries'];
            $transactionsPerCall[$call] = $seen['began'];
        }

        $worst = array_keys($perCall, max($perCall))[0];

        Replay::say(sprintf(
            'call %d of a loop with no flush point: %d queries, %d transactions, %.1f ms (call 50: %d queries, %.1f ms)',
            $worst, $perCall[$worst], $transactionsPerCall[$worst], $times[$worst], $perCall[50], $times[50],
        ));

        // The early insert, and the writes of at most two traces, whichever call it is.
        expect(max($perCall))->toBeLessThanOrEqual(1 + 2 * $write['queries'])
            ->and(max($transactionsPerCall))->toBeLessThanOrEqual(2 * $write['began'])
            ->and(Replay::held()['buffers'])->toBeLessThanOrEqual(101);
    });
});
