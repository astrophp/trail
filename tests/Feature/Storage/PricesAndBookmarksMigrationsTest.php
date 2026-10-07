<?php

use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\Schema;

// DDL commits implicitly on MySQL, so these tests manage the schema themselves
// instead of running inside a RefreshDatabase transaction.
beforeEach(function () {
    $this->artisan('migrate:fresh')->assertSuccessful();
});

afterEach(function () {
    $this->artisan('migrate:fresh')->assertSuccessful();
    RefreshDatabaseState::$migrated = false;
});

it('creates the price and bookmark tables with exactly their columns', function () {
    expect(Schema::hasTable('trail_prices'))->toBeTrue()
        ->and(Schema::hasTable('trail_bookmarks'))->toBeTrue()
        ->and(array_keys(Rows::columnsOf('trail_prices')))->toEqual([
            'id', 'provider', 'model', 'input', 'output', 'cache_read', 'cache_write', 'created_at', 'updated_at',
        ])
        ->and(array_keys(Rows::columnsOf('trail_bookmarks')))->toEqual([
            'id', 'trace_id', 'user_id', 'user_type', 'created_at',
        ]);
});

it('removes the price and bookmark tables on rollback', function () {
    $this->artisan('migrate:rollback')->assertSuccessful();

    expect(Schema::hasTable('trail_prices'))->toBeFalse()
        ->and(Schema::hasTable('trail_bookmarks'))->toBeFalse();
});

it('enforces uniqueness with unique indexes', function (string $table, array $columns) {
    $unique = collect(Schema::getIndexes($table))
        ->filter(fn (array $index) => $index['unique'] && ! $index['primary'])
        ->map(fn (array $index) => $index['columns'])
        ->all();

    expect($unique)->toContain($columns);
})->with([
    'prices provider and model' => ['trail_prices', ['provider', 'model']],
    'bookmarks trace' => ['trail_bookmarks', ['trace_id']],
]);

it('keeps index names within the shortest identifier limit', function (string $table) {
    foreach (Schema::getIndexes($table) as $index) {
        expect(strlen($index['name']))->toBeLessThanOrEqual(63);
    }
})->with(['trail_prices', 'trail_bookmarks']);

it('leaves every price rate nullable with no default', function () {
    $columns = Rows::columnsOf('trail_prices');

    foreach (['input', 'output', 'cache_read', 'cache_write'] as $name) {
        expect($columns[$name]['nullable'])->toBeTrue($name)
            ->and($columns[$name]['default'])->toBeNull($name);
    }

    expect($columns['provider']['nullable'])->toBeFalse()
        ->and($columns['model']['nullable'])->toBeFalse();
});

it('marks only the bookmark user columns nullable', function () {
    $columns = Rows::columnsOf('trail_bookmarks');

    expect($columns['user_id']['nullable'])->toBeTrue()
        ->and($columns['user_type']['nullable'])->toBeTrue()
        ->and($columns['trace_id']['nullable'])->toBeFalse()
        ->and($columns['created_at']['nullable'])->toBeFalse();
});
