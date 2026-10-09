<?php

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Http\Controllers\Api\PriceIndexController;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Storage\Models\Price;
use Astro\Trail\Tests\Fixtures\Http\AgentRows;
use Astro\Trail\Tests\Fixtures\Pricing\FlakyResolver;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Astro\Trail\Tests\Fixtures\Storage\Stored;
use Illuminate\Database\ConnectionResolverInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Schema;
use Illuminate\Testing\TestResponse;

beforeEach(function () {
    Carbon::setTestNow('2026-01-02 12:00:00');
    // The framework skips the CSRF check in the "testing" environment, which is also where
    // access is closed to everyone but the gate; the tests open it, and set "local" only where
    // they need to.
    $this->app['env'] = 'testing';
    Trail::auth(fn () => true);
});

afterEach(function () {
    Carbon::setTestNow();
    // Some tests change the environment to see the CSRF check or the closed gate; a failed assertion must not leave it so.
    $this->app['env'] = 'testing';
});

function priceUrl(string $provider, string $model): string
{
    return '/trail/api/prices?provider='.rawurlencode($provider).'&model='.rawurlencode($model);
}

/**
 * The raw row, as the database holds it. The model casts a rate to a float, which would turn a stored 0 and
 * a stored '' or '0' into the same number; the tests are about what the column holds.
 */
function savedPrice(string $provider, string $model): ?stdClass
{
    return DB::table('trail_prices')->where('provider', $provider)->where('model', $model)->first();
}

/** A decimal column as text, whatever the driver returns: a float, or a string with its six places. */
function placesOf(mixed $raw): ?string
{
    return $raw === null ? null : number_format((float) $raw, 6, '.', '');
}

/** A request with the content as given, which putJson() cannot send: it encodes an empty array as a list. */
function putRaw(string $url, string $content, string $type = 'application/json'): TestResponse
{
    return test()->call('PUT', $url, server: ['CONTENT_TYPE' => $type, 'HTTP_ACCEPT' => 'application/json'], content: $content);
}

/** A run with one step of the model, written through the store so that its summary is kept too. */
function observedStep(string $provider, string $model): void
{
    Stored::run([], [['provider' => $provider, 'model' => $model]]);
}

/**
 * @param  array<string, int|float|null>  $rates
 * @return array<string, int|float|null>
 */
function ratesOf(?float $input, ?float $output, ?float $cacheRead = null, ?float $cacheWrite = null): array
{
    $whole = fn (?float $rate) => $rate !== null && floor($rate) === $rate ? (int) $rate : $rate;

    return ['input' => $whole($input), 'output' => $whole($output), 'cache_read' => $whole($cacheRead), 'cache_write' => $whole($cacheWrite)];
}

/**
 * @param  array<string, int|float|null>  $rates
 * @param  array{model: string, saved: bool}|null  $via
 * @param  array<string, mixed>|null  $default  the default, when it is not the price itself
 * @return array<string, mixed>
 */
function priceOf(string $provider, string $model, array $rates, string $source, bool $observed = false, ?array $via = null, ?array $default = null, ?string $savedAt = null): array
{
    return [
        'provider' => $provider,
        'model' => $model,
        'rates' => $rates,
        'source' => $source,
        'via' => $via,
        'default' => $default ?? ['source' => $source, 'via' => $via, 'rates' => $rates],
        'observed' => $observed,
        'saved_at' => $savedAt,
    ];
}

describe('the list', function () {
    beforeEach(function () {
        config(['trail.pricing' => [
            'anthropic' => ['claude-sonnet-4-5' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75]],
            'openai' => [
                'gpt-4o' => ['input' => 2.5, 'output' => 10.0, 'cache_read' => 1.25],
                'gpt-5' => ['input' => 1.25, 'output' => 10.0, 'cache_read' => 0.125],
            ],
        ]]);

        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '1.000000', 'output' => '8.000000']);
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5-mini', 'input' => '0.250000', 'output' => '2.000000', 'cache_read' => '0.000000']);

        observedStep('anthropic', 'claude-sonnet-4-5');
        observedStep('anthropic', 'claude-sonnet-4-5-20250929');
        observedStep('openai', 'gpt-5-2025-08-07');
        observedStep('openai', 'mystery');
    });

    it('lists every model with its price, where it comes from and what it would be without its saved row', function () {
        $savedAt = '2026-01-02T12:00:00.000Z';

        expect($this->getJson('/trail/api/prices')->assertOk()->json())->toBe([
            'data' => [
                priceOf('openai', 'mystery', ratesOf(null, null), 'none', observed: true),
                priceOf('anthropic', 'claude-sonnet-4-5', ratesOf(3, 15, 0.3, 3.75), 'config', observed: true),
                priceOf('anthropic', 'claude-sonnet-4-5-20250929', ratesOf(3, 15, 0.3, 3.75), 'prefix', observed: true, via: ['model' => 'claude-sonnet-4-5', 'saved' => false]),
                // Through a saved row: the rate is the saved one, which is blank where the config entry had a value.
                priceOf('openai', 'gpt-5-2025-08-07', ratesOf(1, 8), 'prefix', observed: true, via: ['model' => 'gpt-5', 'saved' => true]),
                priceOf('openai', 'gpt-4o', ratesOf(2.5, 10, 1.25), 'config'),
                priceOf('openai', 'gpt-5', ratesOf(1, 8), 'saved', default: ['source' => 'config', 'via' => null, 'rates' => ratesOf(1.25, 10, 0.125)], savedAt: $savedAt),
                // Saved only, and a free cache read is a rate of 0, not a missing one.
                priceOf('openai', 'gpt-5-mini', ratesOf(0.25, 2, 0), 'saved', default: ['source' => 'none', 'via' => null, 'rates' => ratesOf(null, null)], savedAt: $savedAt),
            ],
            'limit' => ['limit' => 500, 'total' => 7, 'truncated' => false],
        ]);
    });

    it('reads the saved prices and the observed models once, not once per model', function () {
        $statements = AgentRows::statements(fn () => $this->getJson('/trail/api/prices')->assertOk());

        expect($statements)->toHaveCount(2)
            ->and(collect($statements)->filter(fn (string $sql) => str_contains($sql, 'trail_prices'))->count())->toBe(1)
            ->and(collect($statements)->filter(fn (string $sql) => str_contains($sql, 'trail_trace_models'))->count())->toBe(1)
            ->and(collect($statements)->filter(fn (string $sql) => str_contains($sql, 'trail_spans'))->count())->toBe(0);
    });

    it('sends at most the limit, and says how many there are', function () {
        app()->bind(PriceIndexController::class, fn () => new PriceIndexController(2));

        $body = $this->getJson('/trail/api/prices')->assertOk()->json();

        expect(array_column($body['data'], 'model'))->toBe(['mystery', 'claude-sonnet-4-5'])
            ->and($body['limit'])->toBe(['limit' => 2, 'total' => 7, 'truncated' => true]);
    });

    it('is not truncated when the models fill the limit exactly', function () {
        app()->bind(PriceIndexController::class, fn () => new PriceIndexController(7));

        $body = $this->getJson('/trail/api/prices')->assertOk()->json();

        expect($body['data'])->toHaveCount(7)
            ->and($body['limit'])->toBe(['limit' => 7, 'total' => 7, 'truncated' => false]);
    });

    it('ignores parameters it does not know', function () {
        expect($this->getJson('/trail/api/prices?range=bad&limit=1&provider=nope')->assertOk()->json('limit'))
            ->toBe(['limit' => 500, 'total' => 7, 'truncated' => false]);
    });
});

it('marks a model observed when a step was recorded with it and not when only an agent span asked for it', function () {
    config(['trail.pricing' => []]);
    Stored::run([], [
        ['type' => SpanType::Agent, 'provider' => 'acme', 'model' => 'asked'],
        ['type' => SpanType::Step, 'provider' => 'acme', 'model' => 'called'],
    ]);
    Rows::price(['provider' => 'acme', 'model' => 'asked']);

    $rows = $this->getJson('/trail/api/prices')->assertOk()->json('data');

    expect(array_map(fn (array $row) => [$row['model'], $row['observed']], $rows))->toBe([['called', true], ['asked', false]]);
});

it('does not observe a model used only in a run recorded without a summary, and lists it only when config or a saved price names it', function () {
    config(['trail.pricing' => []]);
    // The spans are there and the per-run summary is not, as for a run recorded before the summary existed.
    Rows::span(Rows::trace(), ['type' => 'step', 'provider' => 'openai', 'model' => 'gpt-5']);
    Rows::span(Rows::trace(), ['type' => 'step', 'provider' => 'acme', 'model' => 'old']);

    expect($this->getJson('/trail/api/prices')->assertOk()->json('data'))->toBe([]);

    config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.0]]]]);
    $rows = $this->getJson('/trail/api/prices')->assertOk()->json('data');

    expect(array_map(fn (array $row) => [$row['model'], $row['observed']], $rows))->toBe([['gpt-5', false]]);
});

it('truncates at 500 models', function () {
    config(['trail.pricing' => ['acme' => array_fill_keys(array_map(fn (int $n) => sprintf('model-%03d', $n), range(1, 501)), ['input' => 1.0])]]);

    $body = $this->getJson('/trail/api/prices')->assertOk()->json();

    expect($body['data'])->toHaveCount(500)
        ->and($body['limit'])->toBe(['limit' => 500, 'total' => 501, 'truncated' => true]);
});

it('lists the config models and the saved ones when the observed models cannot be read', function () {
    Exceptions::fake();

    // A connection that holds the prices but not the summary of the models.
    config([
        'database.connections.trail_prices_only' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''],
        'trail.storage.connection' => 'trail_prices_only',
        'trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.25]]],
    ]);
    Schema::connection('trail_prices_only')->create('trail_prices', function ($table) {
        $table->id();
        $table->string('provider');
        $table->string('model');
        $table->decimal('input', 12, 6)->nullable();
        $table->decimal('output', 12, 6)->nullable();
        $table->decimal('cache_read', 12, 6)->nullable();
        $table->decimal('cache_write', 12, 6)->nullable();
        $table->dateTime('created_at', 3);
        $table->dateTime('updated_at', 3);
    });
    DB::connection('trail_prices_only')->table('trail_prices')->insert(['provider' => 'acme', 'model' => 'tiny', 'input' => '2.000000', 'created_at' => '2026-01-02 12:00:00.000', 'updated_at' => '2026-01-02 12:00:00.000']);
    app()->forgetInstance(PriceBook::class);

    $body = $this->getJson('/trail/api/prices')->assertOk()->json();

    expect(array_map(fn (array $row) => [$row['provider'], $row['model'], $row['source'], $row['observed']], $body['data']))->toBe([
        ['acme', 'tiny', 'saved', false],
        ['openai', 'gpt-5', 'config', false],
    ]);
    Exceptions::assertReportedCount(1);
});

it('lists the config models when the database cannot be reached at all', function () {
    Exceptions::fake();
    config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.25]]]]);
    app()->instance(PriceBook::class, new PriceBook(app('config'), new FlakyResolver(app(ConnectionResolverInterface::class))));

    $rows = $this->getJson('/trail/api/prices')->assertOk()->json('data');

    // The saved prices could not be read either: the config applies, and nothing is saved.
    expect(array_column($rows, 'model'))->toBe(['gpt-5'])
        ->and($rows[0]['source'])->toBe('config')
        ->and($rows[0]['rates']['input'])->toBe(1.25)
        ->and($rows[0]['saved_at'])->toBeNull();
});

describe('saving a price', function () {
    beforeEach(function () {
        config(['trail.pricing' => [
            'anthropic' => ['claude-sonnet-4-5' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75]],
            'openai' => ['gpt-5' => ['input' => 1.25, 'output' => 10.0, 'cache_read' => 0.125]],
        ]]);
    });

    it('saves the four rates and answers the price as it now resolves', function () {
        $body = $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => 1, 'output' => 8.5, 'cache_read' => '0.1', 'cache_write' => 2])->assertOk()->json();

        expect($body)->toBe(['data' => priceOf(
            'openai', 'gpt-5', ratesOf(1, 8.5, 0.1, 2), 'saved',
            default: ['source' => 'config', 'via' => null, 'rates' => ratesOf(1.25, 10, 0.125)],
            savedAt: '2026-01-02T12:00:00.000Z',
        )]);

        $row = savedPrice('openai', 'gpt-5');
        expect([placesOf($row->input), placesOf($row->output), placesOf($row->cache_read), placesOf($row->cache_write)])->toBe(['1.000000', '8.500000', '0.100000', '2.000000'])
            ->and(DB::table('trail_prices')->count())->toBe(1);
    });

    it('saves a blank rate as NULL, not as 0', function (array $body) {
        $this->putJson(priceUrl('openai', 'gpt-5'), $body + ['input' => 1])->assertOk()->assertJsonPath('data.rates', ratesOf(1, null));

        $row = savedPrice('openai', 'gpt-5');
        expect($row->output)->toBeNull()
            ->and($row->cache_read)->toBeNull()
            ->and($row->cache_write)->toBeNull()
            ->and(placesOf($row->input))->toBe('1.000000');
    })->with([
        'the keys left out' => [[]],
        'null' => [['output' => null, 'cache_read' => null, 'cache_write' => null]],
        'empty text' => [['output' => '', 'cache_read' => '', 'cache_write' => '']],
    ]);

    it('saves 0 as a free rate, not as a missing one', function (int|float|string $zero) {
        $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => $zero, 'output' => null])->assertOk()->assertJsonPath('data.rates', ratesOf(0, null));

        $row = savedPrice('openai', 'gpt-5');
        expect($row->input)->not->toBeNull()
            ->and(placesOf($row->input))->toBe('0.000000')
            ->and($row->output)->toBeNull();
    })->with([0, 0.0, '0', '0.0', '00']);

    it('keeps a number exactly as it was sent', function (int|float|string $sent, string $stored) {
        $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => $sent])->assertOk();

        expect(placesOf(savedPrice('openai', 'gpt-5')?->input))->toBe($stored);
        // The list reads it back as the same number.
        expect(collect($this->getJson('/trail/api/prices')->json('data'))->firstWhere('model', 'gpt-5')['rates']['input'])->toEqual((float) $stored);
    })->with([
        'a float' => [3.75, '3.750000'],
        'the smallest rate' => [0.000001, '0.000001'],
        'the smallest rate as text' => ['0.000001', '0.000001'],
        'six places as text' => ['12.345678', '12.345678'],
        'a long float that is a plain decimal' => [0.1, '0.100000'],
        'the largest rate' => [999999.999999, '999999.999999'],
        'the largest rate as text' => ['999999.999999', '999999.999999'],
        'a whole number' => [999999, '999999.000000'],
        'a whole number as text' => ['12', '12.000000'],
    ]);

    it('replaces the whole row: a key left out does not keep its previous value', function () {
        $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => 1, 'output' => 2, 'cache_read' => 3, 'cache_write' => 4])->assertOk();
        $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => 5])->assertOk()->assertJsonPath('data.rates', ratesOf(5, null));

        $row = savedPrice('openai', 'gpt-5');
        expect(placesOf($row->input))->toBe('5.000000')
            ->and($row->output)->toBeNull()
            ->and($row->cache_read)->toBeNull()
            ->and($row->cache_write)->toBeNull()
            ->and(DB::table('trail_prices')->count())->toBe(1);
    });

    it('moves saved_at on every save, even of the same rates', function () {
        $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => 1])->assertOk()->assertJsonPath('data.saved_at', '2026-01-02T12:00:00.000Z');

        Carbon::setTestNow('2026-01-02 12:30:15.250');
        $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => 1])->assertOk()->assertJsonPath('data.saved_at', '2026-01-02T12:30:15.250Z');

        expect(DB::table('trail_prices')->count())->toBe(1);
    });

    it('saves a price with no rate at all: the model is deliberately unpriced', function () {
        putRaw(priceUrl('openai', 'gpt-5'), '{}')->assertOk()->assertExactJson(['data' => priceOf(
            'openai', 'gpt-5', ratesOf(null, null), 'saved',
            default: ['source' => 'config', 'via' => null, 'rates' => ratesOf(1.25, 10, 0.125)],
            savedAt: '2026-01-02T12:00:00.000Z',
        )]);

        expect(DB::table('trail_prices')->count())->toBe(1);
        expect(app(CostCalculator::class)->cost('openai', 'gpt-5', 1000, 100))->toBeNull();
    });

    it('saves a negative zero as the rate 0', function () {
        $this->call('PUT', priceUrl('openai', 'gpt-5'), server: ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], content: '{"input": -0.0}')
            ->assertOk()->assertJsonPath('data.rates', ratesOf(0, null));

        expect(placesOf(savedPrice('openai', 'gpt-5')?->input))->toBe('0.000000');
    });

    it('refuses what is no rate, with the field named, and writes nothing', function (string $field, mixed $value) {
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '7.000000']);

        $response = $this->putJson(priceUrl('openai', 'gpt-5'), [$field => $value])->assertUnprocessable();

        expect(array_keys($response->json('errors')))->toBe([$field])
            ->and($response->json('errors.'.$field))->toHaveCount(1)
            ->and($response->json('message'))->toBe($response->json('errors.'.$field.'.0'));

        $row = savedPrice('openai', 'gpt-5');
        expect(placesOf($row->input))->toBe('7.000000')
            ->and($row->output)->toBeNull()
            ->and(DB::table('trail_prices')->count())->toBe(1);
    })->with([
        'text' => ['output', 'abc'],
        'an exponent' => ['input', '1e3'],
        'a negative number' => ['cache_read', -1],
        'a negative decimal' => ['cache_write', -0.5],
        'negative text' => ['input', '-1'],
        'a boolean' => ['output', true],
        'false' => ['output', false],
        'a list' => ['input', [1]],
        'an object' => ['input', ['a' => 1]],
        'NaN as text' => ['input', 'NaN'],
        'INF as text' => ['input', 'INF'],
        'a bare point' => ['input', '.5'],
        'a trailing point' => ['input', '5.'],
        'a sign' => ['input', '+5'],
        'a thousands separator' => ['input', '1,5'],
        'a hexadecimal' => ['input', '0x10'],
        'above the column' => ['input', 1000000],
        'above the column as a float' => ['cache_read', 999999.9999995],
        'above the column as text' => ['cache_write', '1000000'],
        'just above the largest rate as text' => ['input', '999999.9999991'],
        'a huge number' => ['input', 1e20],
        'seven places' => ['output', '0.0000001'],
        'seven places as a float' => ['output', 0.0000001],
        'seven places after other digits' => ['output', '1.1234567'],
        'seven places ending in zero' => ['output', '1.1234560'],
        'a float with more places than it can hold' => ['output', 1e-20],
    ]);

    it('reports every invalid field together', function () {
        $response = $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => 'abc', 'output' => 2, 'cache_read' => -1, 'cache_write' => '0.0000001'])->assertUnprocessable();

        expect(array_keys($response->json('errors')))->toBe(['input', 'cache_read', 'cache_write'])
            ->and(DB::table('trail_prices')->count())->toBe(0);
    });

    it('names the column limit and the places in the message', function () {
        $errors = $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => 1000000, 'output' => '0.0000001', 'cache_read' => 'abc'])->assertUnprocessable()->json('errors');

        expect($errors)->toBe([
            'input' => ['The input rate can be at most 999999.999999.'],
            'output' => ['The output rate can have at most 6 decimal places.'],
            'cache_read' => ['The cache read rate must be a number that is 0 or more.'],
        ]);
    });

    it('changes the next price of this process at once, and not what a run recorded', function () {
        $costs = app(CostCalculator::class);
        // Read once, so the book holds the config price until the write flushes it.
        expect($costs->cost('openai', 'gpt-5', 1_000_000, 1_000_000))->toBe(11.25);

        $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => 2, 'output' => 20])->assertOk();

        expect($costs->cost('openai', 'gpt-5', 1_000_000, 1_000_000))->toBe(22.0);
    });

    it('is seen by another long-lived process once the saved prices it holds are more than a minute old', function () {
        // A queue worker: its own price book, which read the prices before the write.
        $worker = new PriceBook(app('config'), app(ConnectionResolverInterface::class));
        expect($worker->rateFor('openai', 'gpt-5')?->input)->toBe(1.25);

        $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => 2, 'output' => 20])->assertOk();

        expect(PriceBook::REFRESH_SECONDS)->toBe(60)
            ->and($worker->rateFor('openai', 'gpt-5')?->input)->toBe(1.25);

        Carbon::setTestNow(Carbon::now()->addSeconds(PriceBook::REFRESH_SECONDS));
        expect($worker->rateFor('openai', 'gpt-5')?->input)->toBe(1.25);

        Carbon::setTestNow(Carbon::now()->addSecond());
        expect($worker->rateFor('openai', 'gpt-5')?->input)->toBe(2.0);
    });

    it('leaves a recorded run and its cost as they were', function () {
        $trace = Rows::trace(['cost' => '0.0045000000', 'input_tokens' => 1000, 'output_tokens' => 100]);
        $span = Rows::span($trace, ['type' => 'step', 'provider' => 'openai', 'model' => 'gpt-5', 'cost' => '0.0045000000', 'input_tokens' => 1000, 'output_tokens' => 100]);

        $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => 100, 'output' => 100])->assertOk();
        $this->deleteJson(priceUrl('openai', 'gpt-5'))->assertOk();
        putRaw(priceUrl('openai', 'gpt-5'), '{}')->assertOk();

        expect((float) DB::table('trail_traces')->where('id', $trace->id)->value('cost'))->toBe(0.0045)
            ->and((float) DB::table('trail_spans')->where('id', $span->id)->value('cost'))->toBe(0.0045);
    });

    it('prices a usage with cache-read tokens as unknown once the cache rate is blank', function () {
        $costs = app(CostCalculator::class);
        expect($costs->cost('anthropic', 'claude-sonnet-4-5', 1000, 100, 500))->toBeFloat();

        $this->putJson(priceUrl('anthropic', 'claude-sonnet-4-5'), ['input' => 3, 'output' => 15, 'cache_write' => 3.75])->assertOk();

        // The config entry's 0.3 does not fall back in: a saved price replaces it whole.
        expect($costs->cost('anthropic', 'claude-sonnet-4-5', 1000, 100, 500))->toBeNull()
            ->and($costs->cost('anthropic', 'claude-sonnet-4-5', 1000, 100))->toBe(0.0045)
            ->and($costs->cost('anthropic', 'claude-sonnet-4-5', 1000, 100, 0))->toBe(0.0045);
    });

    it('shows the default as what applies without the model\'s own row, through another model\'s saved row', function () {
        observedStep('openai', 'gpt-5-2025-08-07');
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '2.000000']);
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5-2025-08-07', 'input' => '9.000000', 'output' => '9.000000']);

        $this->putJson(priceUrl('openai', 'gpt-5-2025-08-07'), ['input' => 4])->assertOk()->assertExactJson(['data' => priceOf(
            'openai', 'gpt-5-2025-08-07', ratesOf(4, null), 'saved', observed: true,
            default: ['source' => 'prefix', 'via' => ['model' => 'gpt-5', 'saved' => true], 'rates' => ratesOf(2, null)],
            savedAt: '2026-01-02T12:00:00.000Z',
        )]);
    });

    it('saves a model that only usage has shown, with the provider and model as listed', function () {
        observedStep('acme', 'brand-new');

        $this->putJson(priceUrl('acme', 'brand-new'), ['input' => 1])->assertOk()->assertExactJson(['data' => priceOf(
            'acme', 'brand-new', ratesOf(1, null), 'saved', observed: true,
            default: ['source' => 'none', 'via' => null, 'rates' => ratesOf(null, null)],
            savedAt: '2026-01-02T12:00:00.000Z',
        )]);

        expect(savedPrice('acme', 'brand-new'))->not->toBeNull();
    });

    it('saves a model whose id holds a slash, a colon, a plus, a percent sign and spaces at its ends', function () {
        $model = ' org/model:v1+beta%20 ';
        observedStep('openai', $model);

        $this->putJson(priceUrl('openai', $model), ['input' => 1.5])->assertOk()->assertJsonPath('data.model', $model);

        expect(savedPrice('openai', $model)?->model)->toBe($model);

        $this->deleteJson(priceUrl('openai', $model))->assertOk()->assertJsonPath('data.source', 'none');
        expect(DB::table('trail_prices')->count())->toBe(0);
    });

    it('reads a literal plus sign in the query as a space, and a percent-encoded one as a plus sign', function () {
        observedStep('openai', 'a b');
        observedStep('openai', 'a+b');

        $this->putJson('/trail/api/prices?provider=openai&model=a+b', ['input' => 1])->assertOk()->assertJsonPath('data.model', 'a b');
        $this->putJson('/trail/api/prices?provider=openai&model=a%2Bb', ['input' => 2])->assertOk()->assertJsonPath('data.model', 'a+b');

        expect(DB::table('trail_prices')->pluck('model')->sort()->values()->all())->toBe(['a b', 'a+b']);
    });

    it('reads the model as sent, not as the framework trims it', function () {
        observedStep('openai', 'spaced ');

        // Without the trailing space it is another model, and no model the book lists.
        $this->putJson('/trail/api/prices?provider=openai&model=spaced', ['input' => 1])->assertNotFound();
        $this->putJson('/trail/api/prices?provider=openai&model=spaced%20', ['input' => 1])->assertOk();
    });
});

describe('a model that is not listed', function () {
    beforeEach(function () {
        config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.25, 'output' => 10.0]]]]);
    });

    it('is a 404 for both writes and creates no row', function (string $provider, string $model) {
        $this->putJson(priceUrl($provider, $model), ['input' => 1])->assertNotFound()->assertJsonStructure(['message']);
        $this->deleteJson(priceUrl($provider, $model))->assertNotFound()->assertJsonStructure(['message']);

        expect(DB::table('trail_prices')->count())->toBe(0);
    })->with([
        'a model nobody listed' => ['openai', 'gpt-9'],
        'a provider nobody listed' => ['acme', 'gpt-5'],
        'a model in another case' => ['openai', 'GPT-5'],
        'a provider in another case' => ['OpenAI', 'gpt-5'],
        'a version of a listed model' => ['openai', 'gpt-5-2025-08-07'],
        'a model that is a prefix of a listed one' => ['openai', 'gpt'],
        'a model with a space added' => ['openai', 'gpt-5 '],
    ]);

    it('does not delete the saved row of a model it does not list', function () {
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '1.000000']);

        $this->deleteJson(priceUrl('openai', 'GPT-5'))->assertNotFound();

        expect(DB::table('trail_prices')->count())->toBe(1);
    });
});

it('is a 404 that does not reach the database when the provider or the model cannot be one', function (string $method, string $query) {
    $statements = AgentRows::statements(fn () => $this->json($method, '/trail/api/prices'.$query, ['input' => 1])->assertNotFound()->assertJsonStructure(['message']));

    expect($statements)->toBe([]);
})->with(['PUT', 'DELETE'])->with([
    'nothing' => [''],
    'no model' => ['?provider=openai'],
    'no provider' => ['?model=gpt-5'],
    'an empty model' => ['?provider=openai&model='],
    'an empty provider' => ['?provider=&model=gpt-5'],
    'a list as the model' => ['?provider=openai&model[]=gpt-5'],
    'a keyed list as the provider' => ['?provider[a]=openai&model=gpt-5'],
    'a model over 255 characters' => ['?provider=openai&model='.str_repeat('x', 256)],
    'a provider over 255 characters' => ['?model=gpt-5&provider='.str_repeat('x', 256)],
    'a NUL byte in the model' => ['?provider=openai&model=a%00b'],
    'a NUL byte in the provider' => ['?provider=a%00b&model=gpt-5'],
    'a model over 255 multibyte characters' => ['?provider=openai&model='.rawurlencode(str_repeat('é', 256))],
    'a provider over 255 multibyte characters' => ['?model=gpt-5&provider='.rawurlencode(str_repeat('é', 256))],
    'a model that is not UTF-8' => ['?provider=openai&model=%FF'],
    'a provider that is not UTF-8' => ['?provider=%FF&model=gpt-5'],
]);

it('accepts a model of 255 characters', function () {
    $model = str_repeat('é', 255);
    observedStep('openai', $model);

    $this->putJson(priceUrl('openai', $model), ['input' => 1])->assertOk()->assertJsonPath('data.model', $model);
});

describe('resetting a price', function () {
    beforeEach(function () {
        config(['trail.pricing' => [
            'anthropic' => ['claude-sonnet-4-5' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75]],
            'openai' => ['gpt-5' => ['input' => 1.25, 'output' => 10.0, 'cache_read' => 0.125]],
        ]]);
    });

    it('returns a model to its config price', function () {
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '1.000000']);
        $costs = app(CostCalculator::class);
        expect($costs->cost('openai', 'gpt-5', 1_000_000, 1_000_000))->toBeNull();

        $this->deleteJson(priceUrl('openai', 'gpt-5'))->assertOk()->assertExactJson(['data' => priceOf('openai', 'gpt-5', ratesOf(1.25, 10, 0.125), 'config')]);

        expect(DB::table('trail_prices')->count())->toBe(0)
            ->and($costs->cost('openai', 'gpt-5', 1_000_000, 1_000_000))->toBe(11.25);
    });

    it('returns a model that only a saved price knew to no price at all', function () {
        observedStep('acme', 'brand-new');
        Rows::price(['provider' => 'acme', 'model' => 'brand-new', 'input' => '1.000000']);

        $this->deleteJson(priceUrl('acme', 'brand-new'))->assertOk()->assertExactJson(['data' => priceOf('acme', 'brand-new', ratesOf(null, null), 'none', observed: true)]);

        expect(DB::table('trail_prices')->count())->toBe(0);
    });

    it('drops a model from the list once the saved price that was its only trace is reset', function () {
        Rows::price(['provider' => 'acme', 'model' => 'tiny', 'input' => '1.000000']);

        $this->deleteJson(priceUrl('acme', 'tiny'))->assertOk()->assertJsonPath('data.source', 'none');

        expect($this->getJson('/trail/api/prices')->json('data.*.model'))->toBe(['claude-sonnet-4-5', 'gpt-5']);
    });

    it('answers a model with no saved row as it is, changing nothing', function () {
        Rows::price(['provider' => 'openai', 'model' => 'other', 'input' => '1.000000']);

        $this->deleteJson(priceUrl('anthropic', 'claude-sonnet-4-5'))->assertOk()->assertExactJson(['data' => priceOf('anthropic', 'claude-sonnet-4-5', ratesOf(3, 15, 0.3, 3.75), 'config')]);
        $this->deleteJson(priceUrl('anthropic', 'claude-sonnet-4-5'))->assertOk();

        expect(DB::table('trail_prices')->count())->toBe(1);
    });

    it('returns a version of a listed model to the price of the model it extends', function () {
        observedStep('anthropic', 'claude-sonnet-4-5-20250929');
        Rows::price(['provider' => 'anthropic', 'model' => 'claude-sonnet-4-5-20250929', 'input' => '1.000000']);

        $this->deleteJson(priceUrl('anthropic', 'claude-sonnet-4-5-20250929'))->assertOk()->assertExactJson(['data' => priceOf(
            'anthropic', 'claude-sonnet-4-5-20250929', ratesOf(3, 15, 0.3, 3.75), 'prefix', observed: true,
            via: ['model' => 'claude-sonnet-4-5', 'saved' => false],
        )]);
    });

    it('returns a version of a model to the saved price of the model it extends', function () {
        observedStep('openai', 'gpt-5-2025-08-07');
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '2.000000']);
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5-2025-08-07', 'input' => '9.000000']);

        $this->deleteJson(priceUrl('openai', 'gpt-5-2025-08-07'))->assertOk()->assertExactJson(['data' => priceOf(
            'openai', 'gpt-5-2025-08-07', ratesOf(2, null), 'prefix', observed: true,
            via: ['model' => 'gpt-5', 'saved' => true],
        )]);

        expect(DB::table('trail_prices')->count())->toBe(1);
    });

    it('deletes only the row of exactly that spelling', function () {
        // The database may take these two for one model (MySQL) or for two (the others); the other spelling's row stays either way.
        config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.25]]]]);
        Rows::price(['provider' => 'openai', 'model' => 'GPT-5', 'input' => '4.000000']);

        $this->deleteJson(priceUrl('openai', 'gpt-5'))->assertOk();

        expect(DB::table('trail_prices')->pluck('model')->all())->toBe(['GPT-5']);
    });
});

describe('two spellings of one model', function () {
    beforeEach(function () {
        config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.25]]]]);
        // Config lists "gpt-5"; a run was recorded as "GPT-5", which is saved.
        observedStep('openai', 'GPT-5');
        Rows::price(['provider' => 'openai', 'model' => 'GPT-5', 'input' => '4.000000']);
    });

    it('lists both spellings', function () {
        expect($this->getJson('/trail/api/prices')->json('data.*.model'))->toBe(['GPT-5', 'gpt-5']);
    });

    it('refuses to save over the row that the database takes for the same model', function () {
        $response = $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => 9])->assertUnprocessable();

        expect(array_keys($response->json('errors')))->toBe(['model'])
            ->and($response->json('errors.model.0'))->toContain('[GPT-5]');

        $row = savedPrice('openai', 'GPT-5');
        expect(DB::table('trail_prices')->count())->toBe(1)
            ->and(placesOf($row->input))->toBe('4.000000')
            ->and($row->updated_at)->toBe(Carbon::now()->format('Y-m-d H:i:s.v'));
    })->skip(fn () => DB::connection()->getDriverName() !== 'mysql', 'only MySQL compares the two spellings as one');

    it('keeps both spellings as two prices', function () {
        $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => 9])->assertOk()->assertJsonPath('data.source', 'saved');

        expect(DB::table('trail_prices')->orderBy('model')->pluck('input', 'model')->map(fn ($input) => placesOf($input))->all())
            ->toEqual(['GPT-5' => '4.000000', 'gpt-5' => '9.000000']);
    })->skip(fn () => DB::connection()->getDriverName() === 'mysql', 'MySQL compares the two spellings as one');
});

describe('access', function () {
    it('refuses all three routes when the gate does', function (string $method) {
        config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.25]]]]);
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '4.000000']);
        $this->app['env'] = 'production';
        Trail::auth(null);
        Gate::define('viewTrail', fn () => false);

        $this->withSession(['_token' => 'token'])->json($method, priceUrl('openai', 'gpt-5'), ['input' => 9], ['X-CSRF-TOKEN' => 'token'])->assertForbidden()->assertJsonStructure(['message']);

        expect(placesOf(savedPrice('openai', 'gpt-5')?->input))->toBe('4.000000');

        // The teardown rolls the test migrations back, which a command refuses to do unasked in production.
        $this->app['env'] = 'testing';
    })->with(['GET', 'PUT', 'DELETE']);

    it('does not delete a price for a request the gate refuses', function () {
        config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.25]]]]);
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '4.000000']);
        $this->app['env'] = 'production';
        Trail::auth(null);
        Gate::define('viewTrail', fn () => false);

        $this->withSession(['_token' => 'token'])->deleteJson(priceUrl('openai', 'gpt-5'), [], ['X-CSRF-TOKEN' => 'token'])->assertForbidden();

        expect(DB::table('trail_prices')->count())->toBe(1);

        $this->app['env'] = 'testing';
    });

    it('is not found when the dashboard is switched off', function (string $method) {
        config(['trail.dashboard.enabled' => false]);

        $this->json($method, priceUrl('openai', 'gpt-5'))->assertNotFound();
    })->with(['GET', 'PUT', 'DELETE']);

    // The framework checks CSRF tokens everywhere but in the "testing" environment.
    it('refuses a write without a CSRF token', function (string $method) {
        $this->app['env'] = 'local';
        config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.25]]]]);
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '4.000000']);

        $this->withSession(['_token' => 'secret'])->json($method, priceUrl('openai', 'gpt-5'), ['input' => 9])->assertStatus(419)->assertJsonStructure(['message']);
        $this->withSession(['_token' => 'secret'])->json($method, priceUrl('openai', 'gpt-5'), ['input' => 9], ['X-CSRF-TOKEN' => 'wrong'])->assertStatus(419);

        expect(placesOf(savedPrice('openai', 'gpt-5')?->input))->toBe('4.000000');

        $this->app['env'] = 'testing';
    })->with(['PUT', 'DELETE']);

    it('lets a write with the session token through, and a read without one', function () {
        $this->app['env'] = 'local';
        config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.25]]]]);
        $headers = ['X-CSRF-TOKEN' => 'secret'];

        $this->withSession(['_token' => 'secret'])->getJson('/trail/api/prices')->assertOk();
        $this->withSession(['_token' => 'secret'])->putJson(priceUrl('openai', 'gpt-5'), ['input' => 9], $headers)->assertOk()->assertJsonPath('data.source', 'saved');
        $this->withSession(['_token' => 'secret'])->deleteJson(priceUrl('openai', 'gpt-5'), [], $headers)->assertOk()->assertJsonPath('data.source', 'config');

        expect(DB::table('trail_prices')->count())->toBe(0);

        $this->app['env'] = 'testing';
    });
});

describe('the body of a save', function () {
    beforeEach(function () {
        config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.25, 'output' => 10.0]]]]);
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '7.000000', 'output' => '3.000000']);
    });

    it('is refused unless it is a JSON object, and the saved price is untouched', function (string $content, string $type) {
        $before = (array) savedPrice('openai', 'gpt-5');

        $response = putRaw(priceUrl('openai', 'gpt-5'), $content, $type)->assertUnprocessable();

        expect($response->json('errors'))->toBe(['body' => ['The body must be a JSON object.']])
            ->and((array) savedPrice('openai', 'gpt-5'))->toBe($before)
            ->and(DB::table('trail_prices')->count())->toBe(1);
    })->with([
        'invalid JSON' => ['{bad json', 'application/json'],
        'cut off JSON' => ['{"input":', 'application/json'],
        'no content' => ['', 'application/json'],
        'only whitespace' => ['  ', 'application/json'],
        'a list' => ['[1,2]', 'application/json'],
        'an empty list' => ['[]', 'application/json'],
        'a string' => ['"x"', 'application/json'],
        'a number' => ['5', 'application/json'],
        'a boolean' => ['true', 'application/json'],
        'null' => ['null', 'application/json'],
        'a form' => ['input=2', 'application/x-www-form-urlencoded'],
        'plain text' => ['input=2', 'text/plain'],
        'an object sent as plain text' => ['{"input":2}', 'text/plain'],
    ]);

    it('creates no row for a body that is refused', function () {
        config(['trail.pricing' => ['openai' => ['gpt-4o' => ['input' => 2.5]]]]);

        putRaw(priceUrl('openai', 'gpt-4o'), '[1,2]')->assertUnprocessable();

        expect(savedPrice('openai', 'gpt-4o'))->toBeNull();
    });

    it('takes an empty object as every rate blank', function () {
        putRaw(priceUrl('openai', 'gpt-5'), '{}')->assertOk()->assertJsonPath('data.rates', ratesOf(null, null));

        $row = savedPrice('openai', 'gpt-5');
        expect([$row->input, $row->output, $row->cache_read, $row->cache_write])->toBe([null, null, null, null]);
    });

    it('is checked after the model: an unlisted model is a 404 whatever the body', function () {
        putRaw(priceUrl('openai', 'nope'), '[1,2]')->assertNotFound();
    });
});

describe('the prices of other workers', function () {
    beforeEach(function () {
        config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.25, 'output' => 10.0]]]]);
    });

    it('are read fresh by the list, in two queries, whatever this process holds', function () {
        // Warm the bound price book, which keeps the saved prices for a minute.
        $this->getJson('/trail/api/prices')->assertOk();

        $list = function () {
            $body = null;
            $statements = AgentRows::statements(function () use (&$body) {
                $body = $this->getJson('/trail/api/prices')->assertOk()->json('data');
            });

            return [collect($body)->keyBy('model')->map(fn (array $row) => [$row['source'], $row['rates']['input']])->all(), $statements];
        };

        // Another worker inserts, updates and deletes rows behind this process's back.
        DB::table('trail_prices')->insert(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '2.000000', 'created_at' => '2026-01-02 12:00:00.000', 'updated_at' => '2026-01-02 12:00:00.000']);
        DB::table('trail_prices')->insert(['provider' => 'acme', 'model' => 'tiny', 'input' => '0.500000', 'created_at' => '2026-01-02 12:00:00.000', 'updated_at' => '2026-01-02 12:00:00.000']);
        [$inserted, $statements] = $list();
        expect($inserted)->toEqual(['gpt-5' => ['saved', 2], 'tiny' => ['saved', 0.5]])
            ->and($statements)->toHaveCount(2);

        DB::table('trail_prices')->where('model', 'gpt-5')->update(['input' => '3.000000', 'updated_at' => '2026-01-02 12:05:00.000']);
        [$updated, $statements] = $list();
        expect($updated['gpt-5'])->toBe(['saved', 3])
            ->and($statements)->toHaveCount(2);

        DB::table('trail_prices')->delete();
        [$deleted, $statements] = $list();
        expect($deleted)->toBe(['gpt-5' => ['config', 1.25]])
            ->and($statements)->toHaveCount(2);
    });

    it('show the saved_at another worker wrote', function () {
        $this->getJson('/trail/api/prices')->assertOk();
        DB::table('trail_prices')->insert(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '2.000000', 'created_at' => '2026-01-02 11:00:00.000', 'updated_at' => '2026-01-02 11:30:00.250']);

        expect($this->getJson('/trail/api/prices')->json('data.0.saved_at'))->toBe('2026-01-02T11:30:00.250Z');
    });

    it('do not make a model known once they are gone: a write for it is a 404', function (string $method) {
        DB::table('trail_prices')->insert(['provider' => 'acme', 'model' => 'tiny', 'input' => '0.500000', 'created_at' => '2026-01-02 12:00:00.000', 'updated_at' => '2026-01-02 12:00:00.000']);
        // This process holds the row, as a worker that listed it a moment ago does.
        expect($this->getJson('/trail/api/prices')->json('data.*.model'))->toContain('tiny');

        DB::table('trail_prices')->delete();

        $this->json($method, priceUrl('acme', 'tiny'), ['input' => 1])->assertNotFound();
        expect(DB::table('trail_prices')->count())->toBe(0);
    })->with(['PUT', 'DELETE']);

    it('are used by a price book that another process holds up to a minute after a reset', function () {
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '2.000000']);
        $worker = new PriceBook(app('config'), app(ConnectionResolverInterface::class));
        expect($worker->rateFor('openai', 'gpt-5')?->input)->toBe(2.0);

        $this->deleteJson(priceUrl('openai', 'gpt-5'))->assertOk()->assertJsonPath('data.source', 'config');

        expect($worker->rateFor('openai', 'gpt-5')?->input)->toBe(2.0);

        Carbon::setTestNow(Carbon::now()->addSeconds(PriceBook::REFRESH_SECONDS));
        expect($worker->rateFor('openai', 'gpt-5')?->input)->toBe(2.0);

        Carbon::setTestNow(Carbon::now()->addSecond());
        expect($worker->rateFor('openai', 'gpt-5')?->input)->toBe(1.25);
    });
});

it('saves the price when another request creates the same row first', function () {
    config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.25]]]]);
    $fired = 0;

    // The other request wins the race: its row appears just before this one's insert.
    Price::creating(function (Price $price) use (&$fired) {
        if (++$fired === 1) {
            DB::table('trail_prices')->insert(['provider' => $price->provider, 'model' => $price->model, 'input' => '99.000000', 'created_at' => '2026-01-02 12:00:00.000', 'updated_at' => '2026-01-02 12:00:00.000']);
        }
    });

    try {
        $this->putJson(priceUrl('openai', 'gpt-5'), ['input' => 4, 'output' => 8])->assertOk()->assertJsonPath('data.rates', ratesOf(4, 8));
    } finally {
        Price::flushEventListeners();
    }

    $row = savedPrice('openai', 'gpt-5');
    // The insert failed on the unique index and was tried again; the table holds one row, with this request's rates.
    expect($fired)->toBe(2)
        ->and(DB::table('trail_prices')->count())->toBe(1)
        ->and([placesOf($row->input), placesOf($row->output)])->toBe(['4.000000', '8.000000']);
});

// MySQL's DISTINCT folds the two spellings of the observed models into one.
it('lists one spelling of the models a loose database takes for one', function () {
    config(['trail.pricing' => []]);
    observedStep('openai', 'gpt-5');
    observedStep('openai', 'GPT-5');

    expect($this->getJson('/trail/api/prices')->assertOk()->json('data'))->toHaveCount(1);
})->skip(fn () => DB::connection()->getDriverName() !== 'mysql', 'only MySQL compares the two spellings as one');

it('lists both spellings of observed models where they are two models', function () {
    config(['trail.pricing' => []]);
    observedStep('openai', 'gpt-5');
    observedStep('openai', 'GPT-5');

    expect($this->getJson('/trail/api/prices')->assertOk()->json('data'))->toHaveCount(2);
})->skip(fn () => DB::connection()->getDriverName() === 'mysql', 'MySQL compares the two spellings as one');
