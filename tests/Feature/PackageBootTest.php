<?php

use Astro\Trail\TrailServiceProvider;
use Illuminate\Support\Facades\DB;

it('registers the service provider and its config', function () {
    expect(app()->getProvider(TrailServiceProvider::class))->not->toBeNull()
        ->and(config('trail.enabled'))->toBeTrue();
});

it('can reach the configured database', function () {
    expect(DB::connection()->select('select 1 as ok')[0]->ok)->toEqual(1);
});
