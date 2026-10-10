<?php

use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

afterEach(function () {
    // Some tests change the environment; a failed assertion must not leave it changed.
    $this->app['env'] = 'testing';
});

uses(RefreshDatabase::class);

function trailSeedEverything(): void
{
    $trace = Rows::trace();
    Rows::span($trace);
    Rows::bookmark($trace);
    Rows::price(['model' => 'kept-model']);
}

function trailRowCounts(): array
{
    return [
        'traces' => DB::table('trail_traces')->count(),
        'spans' => DB::table('trail_spans')->count(),
        'bookmarks' => DB::table('trail_bookmarks')->count(),
        'prices' => DB::table('trail_prices')->count(),
    ];
}

const TRAIL_CONFIRMATION = 'Are you sure you want to run this command?';

it('deletes everything but prices after confirmation', function () {
    trailSeedEverything();

    $this->artisan('trail:clear')
        ->expectsConfirmation(TRAIL_CONFIRMATION, 'yes')
        ->expectsOutputToContain('Deleted every trace, span and bookmark. Prices were kept.')
        ->assertSuccessful();

    expect(trailRowCounts())->toBe(['traces' => 0, 'spans' => 0, 'bookmarks' => 0, 'prices' => 1])
        ->and(DB::table('trail_prices')->value('model'))->toBe('kept-model');
});

it('leaves the data alone when confirmation is declined', function () {
    trailSeedEverything();

    $this->artisan('trail:clear')
        ->expectsConfirmation(TRAIL_CONFIRMATION, 'no')
        ->expectsOutputToContain('Command cancelled.')
        ->assertFailed();

    expect(trailRowCounts())->toBe(['traces' => 1, 'spans' => 1, 'bookmarks' => 1, 'prices' => 1]);
});

it('does not ask with --force', function () {
    trailSeedEverything();

    $this->artisan('trail:clear', ['--force' => true])->assertSuccessful();

    expect(trailRowCounts())->toBe(['traces' => 0, 'spans' => 0, 'bookmarks' => 0, 'prices' => 1]);
});

it('does not ask in the local environment', function () {
    trailSeedEverything();
    $this->app['env'] = 'local';

    $this->artisan('trail:clear')->assertSuccessful();

    expect(trailRowCounts())->toBe(['traces' => 0, 'spans' => 0, 'bookmarks' => 0, 'prices' => 1]);
});

it('asks in every other environment', function (string $environment) {
    trailSeedEverything();
    $this->app['env'] = $environment;

    $this->artisan('trail:clear')
        ->expectsConfirmation(TRAIL_CONFIRMATION, 'no')
        ->assertFailed();

    expect(DB::table('trail_traces')->count())->toBe(1);
})->with(['production', 'staging', 'testing']);

it('works while recording is disabled', function () {
    config(['trail.enabled' => false]);
    trailSeedEverything();

    $this->artisan('trail:clear', ['--force' => true])->assertSuccessful();

    expect(DB::table('trail_traces')->count())->toBe(0);
});
