<?php

use Astro\Trail\Storage\Models\Bookmark;
use Astro\Trail\Storage\Models\Price;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

// A failed statement aborts the surrounding transaction on Postgres, so each
// expected failure runs in its own savepoint.
it('allows one price per provider and model', function () {
    Rows::price(['provider' => 'openai', 'model' => 'gpt']);

    expect(fn () => DB::transaction(fn () => Rows::price(['provider' => 'openai', 'model' => 'gpt'])))
        ->toThrow(UniqueConstraintViolationException::class);

    Rows::price(['provider' => 'azure', 'model' => 'gpt']);
    Rows::price(['provider' => 'openai', 'model' => 'gpt-mini']);

    expect(Price::query()->count())->toBe(3);
});

it('allows one bookmark per trace', function () {
    $trace = Rows::trace();
    Rows::bookmark($trace);

    expect(fn () => DB::transaction(fn () => Rows::bookmark($trace)))
        ->toThrow(UniqueConstraintViolationException::class);

    Rows::bookmark(Rows::trace());

    expect(Bookmark::query()->count())->toBe(2);
});

it('keeps a zero rate distinct from a missing rate', function () {
    $price = Rows::price(['input' => 0, 'output' => null])->fresh();

    expect($price->input)->toBe(0.0)
        ->and($price->output)->toBeNull()
        ->and($price->cache_read)->toBeNull()
        ->and($price->cache_write)->toBeNull();
});

it('reads every rate back as null when none is given', function () {
    $price = Rows::price()->fresh();

    foreach (['input', 'output', 'cache_read', 'cache_write'] as $rate) {
        expect($price->{$rate})->toBeNull($rate);
    }
});

it('round-trips rates', function (float $rate) {
    $price = Rows::price(['input' => $rate, 'output' => $rate, 'cache_read' => $rate, 'cache_write' => $rate])->fresh();

    foreach (['input', 'output', 'cache_read', 'cache_write'] as $name) {
        expect($price->{$name})->toBeFloat()->toEqualWithDelta($rate, 1e-9);
    }
})->with([0.0375, 1234.5, 0.000001, 15.0]);

it('bookmarks anonymously', function () {
    $bookmark = Rows::bookmark(Rows::trace())->fresh();

    expect($bookmark->user_id)->toBeNull()
        ->and($bookmark->user_type)->toBeNull()
        ->and($bookmark->created_at)->not->toBeNull();
});

it('records who added a bookmark', function () {
    $bookmark = Rows::bookmark(Rows::trace(), ['user_id' => '42', 'user_type' => 'App\\Models\\User'])->fresh();

    expect($bookmark->user_id)->toBe('42')
        ->and($bookmark->user_type)->toBe('App\\Models\\User');
});

it('sets the bookmark creation time and has no updated_at column', function () {
    $bookmark = Rows::bookmark(Rows::trace());

    expect($bookmark->fresh()->created_at->format('Y-m-d H:i:s.v'))->toBe($bookmark->created_at->format('Y-m-d H:i:s.v'))
        ->and(Schema::hasColumn('trail_bookmarks', 'updated_at'))->toBeFalse()
        ->and(Bookmark::UPDATED_AT)->toBeNull();
});

it('relates bookmarks and traces', function () {
    $trace = Rows::trace();
    $other = Rows::trace();
    $bookmark = Rows::bookmark($trace);

    expect($bookmark->trace?->is($trace))->toBeTrue()
        ->and(Trace::query()->findOrFail($trace->id)->bookmark?->is($bookmark))->toBeTrue()
        ->and(Trace::query()->findOrFail($other->id)->bookmark)->toBeNull();
});

it('follows the configured storage connection for prices and bookmarks', function () {
    config(['trail.storage.connection' => null]);

    expect((new Price)->getConnectionName())->toBeNull()
        ->and((new Bookmark)->getConnectionName())->toBeNull();

    config([
        'database.connections.trail_secondary' => config('database.connections.'.config('database.default')),
        'trail.storage.connection' => 'trail_secondary',
    ]);

    expect((new Price)->getConnectionName())->toBe('trail_secondary')
        ->and((new Bookmark)->getConnectionName())->toBe('trail_secondary');
});
