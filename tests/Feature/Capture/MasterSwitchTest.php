<?php

use Astro\Trail\Capture\Listeners;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Laravel\Ai\Events\PromptingAgent;

/*
|--------------------------------------------------------------------------
| The master switch
|--------------------------------------------------------------------------
|
| This file's application is booted with trail.enabled already false (see
| DisablesTrail), not switched off after boot.
|
*/

it('is booted with Trail switched off', function () {
    expect(config('trail.enabled'))->toBeFalse();
});

it('registers no SDK listener and no flush point', function () {
    $dispatcher = $this->app->make(Dispatcher::class);
    $property = new ReflectionProperty($dispatcher, 'listeners');
    $trail = [];

    // The framework listens to some of the same events itself, so listeners are told apart by where they were written.
    foreach ($property->getValue($dispatcher) as $event => $listeners) {
        foreach ($listeners as $listener) {
            if ($listener instanceof Closure && str_contains((string) (new ReflectionFunction($listener))->getFileName(), '/src/Capture/')) {
                $trail[] = $event;
            }
        }
    }

    expect($trail)->toBe([]);
});

it('has a different outcome when Trail is on', function () {
    // The same measure finds Trail's listeners once it is registered, so the check above can fail.
    Listeners::register($this->app->make(Dispatcher::class), $this->app);

    $dispatcher = $this->app->make(Dispatcher::class);
    $property = new ReflectionProperty($dispatcher, 'listeners');
    $found = array_filter($property->getValue($dispatcher)[PromptingAgent::class] ?? [], fn ($listener) => $listener instanceof Closure && str_contains((string) (new ReflectionFunction($listener))->getFileName(), '/src/Capture/'));

    expect($found)->not->toBe([]);
});

it('records nothing, not even an early insert', function () {
    $queries = [];
    DB::listen(function ($query) use (&$queries) {
        $queries[] = $query->sql;
    });

    AssistantAgent::fake(['Hello']);
    (new AssistantAgent)->prompt('Hi');
    Trail::flush();

    $during = $queries;
    $probe = new DatabaseStoreProbe;

    expect([$probe->traceCount(), $probe->spanCount()])->toBe([0, 0])
        ->and($during)->toBe([]);
});

it('still has the artisan commands', function () {
    $commands = array_keys(Artisan::all());

    expect($commands)->toContain('trail:prune', 'trail:sweep', 'trail:clear', 'trail:pause', 'trail:resume');
});

it('lets the pause and resume commands run', function () {
    config(['cache.default' => 'array']);

    $this->artisan('trail:pause')->assertSuccessful();
    $this->artisan('trail:resume')->assertSuccessful();
});
