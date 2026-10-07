<?php

use Astro\Trail\Capture\Recorder;
use Astro\Trail\Capture\Sampler;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\BrokenCache;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Reports;
use Astro\Trail\Tests\Fixtures\Users\User;
use Astro\Trail\Users\UserResolver;
use Illuminate\Contracts\Cache\Factory as CacheFactory;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| The maintenance commands and the user resolver under a broken database or cache
|--------------------------------------------------------------------------
|
| A clear failure is fine for a command; a result that looks like success is
| not. The user resolver is called by the dashboard and must never throw.
|
*/

beforeEach(function () {
    config(['cache.default' => 'array']);

    $this->reports = Reports::capture();

    /** Run a command and return [exit code or the exception it threw, its output]. */
    $this->command = function (string $name, array $options = []): array {
        try {
            $code = Artisan::call($name, $options);
        } catch (Throwable $e) {
            return [$e, Artisan::output()];
        }

        return [$code, Artisan::output()];
    };

    $this->breakDatabase = function () {
        config([
            'database.connections.trail_down' => ['driver' => 'sqlite', 'database' => '/nonexistent-trail-directory/trail.sqlite', 'prefix' => ''],
            'trail.storage.connection' => 'trail_down',
        ]);

        foreach ([TraceStore::class, PriceBook::class, CostCalculator::class, Recorder::class] as $abstract) {
            $this->app->forgetInstance($abstract);
        }
    };
});

it('fails clearly, and does not claim success, when the database is down', function (string $command, array $options) {
    ($this->breakDatabase)();

    [$result, $output] = ($this->command)($command, $options);

    $failed = $result instanceof Throwable || $result !== 0;

    expect($failed)->toBeTrue("[$command] reported success: ".(is_int($result) ? $result : '').$output)
        ->and($output)->not->toMatch('/Deleted \d+|Marked \d+|Recording (paused|resumed)|cleared/i');
})->with([
    'prune' => ['trail:prune', []],
    'prune with hours' => ['trail:prune', ['--hours' => 1]],
    'sweep' => ['trail:sweep', []],
    'clear' => ['trail:clear', ['--force' => true]],
]);

it('fails clearly, and does not claim success, when the cache is down', function (string $command) {
    $this->app->instance(CacheFactory::class, new BrokenCache);
    $this->app->forgetInstance(Sampler::class);

    [$result, $output] = ($this->command)($command);

    $failed = $result instanceof Throwable || $result !== 0;

    expect($failed)->toBeTrue("[$command] reported success: ".(is_int($result) ? $result : '').$output)
        ->and($output)->not->toMatch('/Recording (paused|resumed)/i');
})->with(['trail:pause', 'trail:resume']);

it('prunes nothing, and says so, when retention is garbage', function (mixed $retention) {
    DB::table('trail_traces')->insert([
        'id' => 'old', 'type' => 'agent', 'name' => 'Old', 'status' => 'completed', 'started_at' => now()->subYears(5),
        'created_at' => now()->subYears(5), 'updated_at' => now()->subYears(5), 'streamed' => 0, 'recovered' => 0, 'child_failed' => 0,
        'span_count' => 0, 'unpriced_span_count' => 0,
    ]);

    config(['trail.retention' => $retention]);

    [$result] = ($this->command)('trail:prune');

    expect(DB::table('trail_traces')->count())->toBe(1)
        ->and($result)->not->toBe(0);
})->with([
    'text' => ['abc'], 'negative' => [-5], 'zero' => [0], 'null' => [null], 'empty array' => [[]], 'true' => [true], 'NaN' => [NAN], 'infinity' => [INF],
]);

describe('the user resolver', function () {
    it('returns an unresolved user, and reports once, when the database is down', function () {
        config(['database.connections.trail_down' => ['driver' => 'sqlite', 'database' => '/nonexistent-trail-directory/trail.sqlite', 'prefix' => '']]);

        $down = new class extends User
        {
            protected $connection = 'trail_down';
        };

        $resolved = (new UserResolver)->resolve([['type' => $down::class, 'id' => 1], ['type' => $down::class, 'id' => 2]]);

        expect(array_values($resolved))->toBe([null, null])
            ->and($this->reports->count())->toBeLessThanOrEqual(1);
    });

    it('returns unresolved users for a callback that throws, returns garbage, or returns a generator', function (Closure $callback) {
        $resolved = (new UserResolver($callback))->resolve([['type' => 'App\\User', 'id' => 1]]);

        expect(array_values($resolved))->toBe([null]);
    })->with([
        'throws' => [fn () => throw new RuntimeException('no')],
        'throws an Error' => [fn () => throw new TypeError('no')],
        'returns a string' => [fn () => 'users'],
        'returns a generator' => [fn () => (function () {
            yield 'x' => [];
        })()],
        'returns objects' => [fn () => ['App\\User' => ['1' => new stdClass]]],
        'returns nested arrays' => [fn () => ['App\\User' => ['1' => ['name' => ['a'], 'email' => null]]]],
    ]);

    it('answers for a hundred thousand pairs with a bounded number of callback calls', function () {
        $calls = 0;
        $pairs = [];

        for ($i = 0; $i < 100_000; $i++) {
            $pairs[] = ['type' => 'App\\User', 'id' => $i];
        }

        (new UserResolver(function (array $grouped) use (&$calls) {
            $calls++;

            return [];
        }))->resolve($pairs);

        expect($calls)->toBe(1);
    });
});

it('does not copy the text of a prompt into the log when its own insert fails', function () {
    // Trail's tables are in a database that has none, so every write fails.
    config(['database.connections.trail_empty' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''], 'trail.storage.connection' => 'trail_empty']);

    foreach ([TraceStore::class, PriceBook::class, CostCalculator::class, Recorder::class] as $abstract) {
        $this->app->forgetInstance($abstract);
    }

    AssistantAgent::fake(['A reply that holds PERSONAL-REPLY-MARKER']);
    (new AssistantAgent)->prompt('My name is Jane Doe, jane@example.com, PERSONAL-PROMPT-MARKER');
    Trail::flush();

    // A QueryException carries the SQL with its bound values. Reporting it as it is writes the prompt and the reply to the log.
    $logged = implode("\n", $this->reports->messages());

    expect($this->reports->count())->toBeGreaterThan(0)
        ->and($logged)->not->toContain('PERSONAL-PROMPT-MARKER')
        ->and($logged)->not->toContain('PERSONAL-REPLY-MARKER');
});
