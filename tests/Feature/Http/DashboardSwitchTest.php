<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Http\DisablesDashboard;
use Astro\Trail\Tests\Fixtures\Sdk\ObservesSdk;
use Illuminate\Support\Facades\Route;

afterEach(function () {
    // Some tests change the environment; a failed assertion must not leave it changed.
    $this->app['env'] = 'testing';
});

uses(DisablesDashboard::class, ObservesSdk::class);

beforeEach(function () {
    $this->store = Trail::fake();
});

it('registers no Trail route and answers 404 when only the dashboard is switched off', function () {
    $this->app['env'] = 'local';

    $names = collect(Route::getRoutes()->getRoutes())->map->getName()->filter(fn ($name) => str_starts_with((string) $name, 'trail.'));

    expect($names->all())->toBe([]);

    $this->get('/trail')->assertNotFound();
    $this->get('/trail/api/x')->assertNotFound();
});

it('keeps recording when only the dashboard is switched off', function () {
    AssistantAgent::fake(['Hello']);
    (new AssistantAgent)->prompt('Hi');
    Trail::flush();

    expect($this->store->traces())->not->toBeEmpty();
});
