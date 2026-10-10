<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\Models\Bookmark;
use Astro\Trail\Storage\Models\Price;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

afterEach(function () {
    config(['trail.storage.connection' => null]);

    $this->artisan('migrate:fresh')->assertSuccessful();
    RefreshDatabaseState::$migrated = false;
});

it('migrates and writes on the configured storage connection', function () {
    config([
        'database.connections.trail_secondary' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''],
        'trail.storage.connection' => 'trail_secondary',
    ]);

    $this->artisan('migrate:fresh')->assertSuccessful();

    expect(Schema::connection('trail_secondary')->hasTable('trail_traces'))->toBeTrue()
        ->and(Schema::connection('trail_secondary')->hasTable('trail_spans'))->toBeTrue()
        ->and(Schema::connection('trail_secondary')->hasTable('trail_prices'))->toBeTrue()
        ->and(Schema::connection('trail_secondary')->hasTable('trail_bookmarks'))->toBeTrue()
        ->and(Schema::connection('trail_secondary')->hasTable('trail_trace_models'))->toBeTrue()
        ->and(Schema::connection('trail_secondary')->hasTable('trail_trace_tools'))->toBeTrue()
        ->and(Schema::hasTable('trail_trace_models'))->toBeFalse()
        ->and(Schema::hasTable('trail_trace_tools'))->toBeFalse()
        ->and(Schema::hasTable('trail_traces'))->toBeFalse()
        ->and(Schema::hasTable('trail_spans'))->toBeFalse()
        ->and(Schema::hasTable('trail_prices'))->toBeFalse()
        ->and(Schema::hasTable('trail_bookmarks'))->toBeFalse();

    $trace = Rows::trace();
    Rows::span($trace);
    Rows::bookmark($trace);
    Rows::price();

    expect(DB::connection('trail_secondary')->table('trail_traces')->count())->toBe(1)
        ->and(DB::connection('trail_secondary')->table('trail_spans')->count())->toBe(1)
        ->and(DB::connection('trail_secondary')->table('trail_bookmarks')->count())->toBe(1)
        ->and(DB::connection('trail_secondary')->table('trail_prices')->count())->toBe(1)
        ->and(Price::query()->count())->toBe(1)
        ->and(Bookmark::query()->first()?->trace?->is($trace))->toBeTrue()
        ->and(Trace::query()->findOrFail($trace->id)->spans)->toHaveCount(1);

    $this->artisan('migrate:rollback')->assertSuccessful();

    expect(Schema::connection('trail_secondary')->hasTable('trail_traces'))->toBeFalse()
        ->and(Schema::connection('trail_secondary')->hasTable('trail_spans'))->toBeFalse()
        ->and(Schema::connection('trail_secondary')->hasTable('trail_prices'))->toBeFalse()
        ->and(Schema::connection('trail_secondary')->hasTable('trail_bookmarks'))->toBeFalse();
});

/** A run inside a transaction on the default connection that is flushed there, then rolled back. */
function runFlushedInsideRolledBackTransaction(): void
{
    AssistantAgent::fake(['Hello']);

    DB::connection()->beginTransaction();
    (new AssistantAgent)->prompt('Hi');
    Trail::flush();
    DB::connection()->rollBack();
}

it('loses a trace flushed inside a transaction that rolls back, when the tables are on the default connection', function () {
    $this->artisan('migrate')->assertSuccessful();

    runFlushedInsideRolledBackTransaction();

    expect(DB::table('trail_traces')->count())->toBe(0);
})->skip(fn () => DB::connection()->getDriverName() !== 'sqlite', 'the second connection is a second in-memory SQLite database');

it('keeps that trace when the tables are on a connection of their own', function () {
    config([
        'database.connections.trail_secondary' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''],
        'trail.storage.connection' => 'trail_secondary',
    ]);
    $this->artisan('migrate')->assertSuccessful();

    runFlushedInsideRolledBackTransaction();

    expect(DB::connection('trail_secondary')->table('trail_traces')->count())->toBe(1)
        ->and(DB::connection('trail_secondary')->table('trail_traces')->value('status'))->toBe('completed');
})->skip(fn () => DB::connection()->getDriverName() !== 'sqlite', 'the second connection is a second in-memory SQLite database');
