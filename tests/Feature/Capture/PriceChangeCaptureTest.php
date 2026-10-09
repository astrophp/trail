<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| A saved price prices the runs that come after it
|--------------------------------------------------------------------------
|
| The cost of a run is an estimate frozen when it is recorded. Saving a price
| through the API changes the next run's cost and nothing already stored.
|
*/

beforeEach(function () {
    // The framework skips the CSRF check in the "testing" environment.
    $this->app['env'] = 'testing';
    Trail::auth(fn () => true);

    config(['trail.pricing.anthropic' => [FakeAnthropic::MODEL => ['input' => 3.0, 'output' => 15.0]]]);

    $this->record = function (): string {
        FakeAnthropic::script([FakeAnthropic::text('ok', usage: ['input_tokens' => 1234, 'output_tokens' => 567])]);

        $id = (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL)->invocationId;
        Trail::flush();

        return $id;
    };

    // The run's and its step's stored cost, as ten decimal places whatever the driver returns.
    $this->costs = function (string $id): array {
        $ten = fn (mixed $cost) => $cost === null ? null : number_format((float) $cost, 10, '.', '');

        return [
            'run' => $ten(DB::table('trail_traces')->where('id', $id)->value('cost')),
            'step' => $ten(DB::table('trail_spans')->where('trace_id', $id)->where('type', 'step')->value('cost')),
        ];
    };
});

it('prices the next run with the saved price and leaves the recorded one alone', function () {
    $first = ($this->record)();

    // 1234 x 3 + 567 x 15 per million tokens.
    expect(($this->costs)($first))->toBe(['run' => '0.0122070000', 'step' => '0.0122070000']);

    $this->putJson('/trail/api/prices?provider=anthropic&model='.FakeAnthropic::MODEL, ['input' => 6, 'output' => 30])
        ->assertOk()->assertJsonPath('data.source', 'saved');

    $second = ($this->record)();

    expect(($this->costs)($second))->toBe(['run' => '0.0244140000', 'step' => '0.0244140000'])
        ->and(($this->costs)($first))->toBe(['run' => '0.0122070000', 'step' => '0.0122070000']);
});

it('leaves the recorded runs alone when the price is reset, and prices the next one from config again', function () {
    $this->putJson('/trail/api/prices?provider=anthropic&model='.FakeAnthropic::MODEL, ['input' => 6, 'output' => 30])->assertOk();
    $saved = ($this->record)();

    $this->deleteJson('/trail/api/prices?provider=anthropic&model='.FakeAnthropic::MODEL)->assertOk()->assertJsonPath('data.source', 'config');
    $reset = ($this->record)();

    expect(($this->costs)($saved))->toBe(['run' => '0.0244140000', 'step' => '0.0244140000'])
        ->and(($this->costs)($reset))->toBe(['run' => '0.0122070000', 'step' => '0.0122070000']);
});

it('leaves a run unpriced when its model was saved with no rate', function () {
    $this->call('PUT', '/trail/api/prices?provider=anthropic&model='.FakeAnthropic::MODEL, server: ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], content: '{}')->assertOk();

    expect(($this->costs)(($this->record)()))->toBe(['run' => null, 'step' => null]);
});
