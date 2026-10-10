<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Astro\Trail\Trail;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:00:00');
});

afterEach(function () {
    Carbon::setTestNow();
    // Some tests change the environment; a failed assertion must not leave it changed.
    $this->app['env'] = 'testing';
});

it('answers for an empty database', function () {
    $this->getJson('/trail/api/meta')->assertOk()->assertExactJson([
        'data' => [
            'app' => ['name' => config('app.name'), 'environment' => 'local', 'timezone' => 'UTC'],
            'version' => $this->app->make(Trail::class)->version(),
            'recording' => 'enabled',
            'stale_after' => 3600,
            'traces' => ['any' => false, 'running' => 0],
            'filters' => ['agents' => [], 'providers' => [], 'models' => []],
        ],
        'range' => ['preset' => '24h', 'from' => '2026-01-01T12:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z'],
    ]);
});

it('lists what was observed in the range, sorted and without duplicates', function () {
    $inside = '2026-01-02 08:00:00';
    $outside = '2025-12-01 08:00:00';

    $a = Rows::trace(['name' => 'TicketTriage', 'started_at' => $inside, 'status' => Status::Completed]);
    Rows::trace(['name' => 'SupportAssistant', 'started_at' => $inside, 'status' => Status::Completed]);
    Rows::trace(['name' => 'SupportAssistant', 'started_at' => $inside, 'status' => Status::Completed]);
    $old = Rows::trace(['name' => 'Retired', 'started_at' => $outside, 'status' => Status::Completed]);

    Rows::span($a, ['provider' => 'openai', 'model' => 'gpt-5', 'started_at' => $inside]);
    Rows::span($a, ['provider' => 'openai', 'model' => 'gpt-5', 'started_at' => $inside]);
    Rows::span($a, ['provider' => 'anthropic', 'model' => 'claude-sonnet-4-5', 'started_at' => $inside]);
    // Used by a later step of the run only.
    Rows::span($a, ['provider' => 'anthropic', 'model' => 'claude-haiku-4-5', 'started_at' => $inside]);
    Rows::span($a, ['provider' => null, 'model' => null, 'started_at' => $inside]);
    Rows::span($a, ['provider' => 'openai', 'model' => null, 'started_at' => $inside]);
    Rows::span($old, ['provider' => 'gemini', 'model' => 'gemini-pro', 'started_at' => $outside]);
    // The range is about when the run started, not the step.
    Rows::span($old, ['provider' => 'mistral', 'model' => 'mistral-large', 'started_at' => $inside]);

    $this->getJson('/trail/api/meta')->assertOk()
        ->assertJsonPath('data.traces.any', true)
        ->assertJsonPath('data.filters.agents', ['SupportAssistant', 'TicketTriage'])
        ->assertJsonPath('data.filters.providers', ['anthropic', 'openai'])
        ->assertJsonPath('data.filters.models', [
            ['provider' => 'anthropic', 'model' => 'claude-haiku-4-5'],
            ['provider' => 'anthropic', 'model' => 'claude-sonnet-4-5'],
            ['provider' => 'openai', 'model' => 'gpt-5'],
        ]);
});

it('filters on the range it was given and echoes it', function () {
    $trace = Rows::trace(['name' => 'Retired', 'started_at' => '2025-12-01 08:00:00']);
    Rows::span($trace, ['provider' => 'gemini', 'model' => 'gemini-pro', 'started_at' => '2025-12-01 08:00:00']);

    $this->getJson('/trail/api/meta?from=2025-12-01T00:00:00Z&to=2025-12-02T00:00:00Z')->assertOk()
        ->assertJsonPath('data.filters.agents', ['Retired'])
        ->assertJsonPath('data.filters.models', [['provider' => 'gemini', 'model' => 'gemini-pro']])
        ->assertJsonPath('range', ['preset' => null, 'from' => '2025-12-01T00:00:00.000Z', 'to' => '2025-12-02T00:00:00.000Z']);
});

it('keeps each filter list to 100', function () {
    foreach (range(1, 101) as $i) {
        Rows::trace(['name' => sprintf('agent-%03d', $i), 'started_at' => '2026-01-02 08:00:00']);
    }

    $agents = $this->getJson('/trail/api/meta')->json('data.filters.agents');

    expect($agents)->toHaveCount(100)->and($agents[0])->toBe('agent-001');
});

it('counts running runs without the stale ones, in any range', function () {
    Rows::trace(['status' => Status::Running, 'started_at' => '2020-01-01 00:00:00', 'created_at' => Carbon::now()->subMinutes(5)]);
    Rows::trace(['status' => Status::Running, 'created_at' => Carbon::now()->subSeconds(7200)]);
    Rows::trace(['status' => Status::Completed]);

    $this->getJson('/trail/api/meta')->assertJsonPath('data.traces.running', 1)->assertJsonPath('data.traces.any', true);
});

it('says recording is paused after trail:pause', function () {
    $this->artisan('trail:pause')->assertSuccessful();

    $this->getJson('/trail/api/meta')->assertJsonPath('data.recording', 'paused');
});

it('reports the configured stale_after', function () {
    config(['trail.stale_after' => 7200]);

    $this->getJson('/trail/api/meta')->assertJsonPath('data.stale_after', 7200);
});

it('reports the application timezone', function () {
    config(['app.timezone' => 'Europe/Istanbul']);

    $this->getJson('/trail/api/meta')->assertJsonPath('data.app.timezone', 'Europe/Istanbul');
});
