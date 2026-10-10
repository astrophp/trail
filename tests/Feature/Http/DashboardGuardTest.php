<?php

use Astro\Trail\Tests\Fixtures\Http\DefinesOtherGuard;
use Illuminate\Auth\GenericUser;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;

afterEach(function () {
    // Some tests change the environment; a failed assertion must not leave it changed.
    $this->app['env'] = 'testing';
});

uses(DefinesOtherGuard::class);

beforeEach(function () {
    $this->app['env'] = 'production';
    Gate::define('viewTrail', fn ($user) => true);

    // Signed in on a guard without making it the default one, which actingAs() would.
    $this->user = new GenericUser(['id' => 1, 'email' => 'ada@example.com']);
});

it('checks the default guard when no guard is configured', function () {
    Auth::guard('other')->setUser($this->user);

    $this->get('/trail')->assertForbidden();

    Auth::guard('web')->setUser($this->user);

    $this->get('/trail')->assertOk();
});

it('checks the configured guard, and not the default one', function () {
    config(['trail.guard' => 'other']);

    Auth::guard('web')->setUser($this->user);

    $this->get('/trail')->assertForbidden();

    Auth::guard('other')->setUser($this->user);

    $this->get('/trail')->assertOk();
});

it('treats an empty guard as the default one', function () {
    config(['trail.guard' => '']);
    Auth::guard('web')->setUser($this->user);

    $this->get('/trail')->assertOk();
});
