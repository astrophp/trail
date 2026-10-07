<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\TrailApplicationServiceProvider;
use Illuminate\Auth\GenericUser;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

it('defines a viewTrail gate that denies everyone', function () {
    (new TrailApplicationServiceProvider($this->app))->boot();

    expect(Gate::has('viewTrail'))->toBeTrue()
        ->and(Gate::forUser(new GenericUser(['id' => 1]))->check('viewTrail'))->toBeFalse()
        ->and(Gate::check('viewTrail'))->toBeFalse();
});

it('uses the gate of a subclass', function () {
    $provider = new class($this->app) extends TrailApplicationServiceProvider
    {
        protected function gate(): void
        {
            Gate::define('viewTrail', fn ($user) => $user->id === 1);
        }
    };

    $provider->boot();

    expect(Gate::forUser(new GenericUser(['id' => 1]))->check('viewTrail'))->toBeTrue()
        ->and(Gate::forUser(new GenericUser(['id' => 2]))->check('viewTrail'))->toBeFalse()
        ->and(Gate::check('viewTrail'))->toBeFalse();
});

it('lets a subclass replace the whole check with Trail::auth()', function () {
    $provider = new class($this->app) extends TrailApplicationServiceProvider
    {
        protected function authorization(): void
        {
            Trail::auth(fn () => true);
        }
    };

    $provider->boot();

    expect(Gate::has('viewTrail'))->toBeFalse()
        ->and(Trail::check(Request::create('/trail')))->toBeTrue();
});
