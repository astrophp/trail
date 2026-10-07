<?php

use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Pricing\Rate;
use Astro\Trail\Tests\Fixtures\Pricing\FlakyResolver;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Database\ConnectionResolverInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;

uses(RefreshDatabase::class);

function book(): PriceBook
{
    return app(PriceBook::class);
}

function rate(float $input, ?float $output = null): array
{
    return ['input' => $input, 'output' => $output ?? $input * 2];
}

it('matches the exact model id', function () {
    config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.25, 'output' => 10.0, 'cache_read' => 0.125]]]]);

    $rate = book()->rateFor('openai', 'gpt-5');

    expect($rate)->toBeInstanceOf(Rate::class)
        ->and($rate->provider)->toBe('openai')
        ->and($rate->model)->toBe('gpt-5')
        ->and($rate->input)->toBe(1.25)
        ->and($rate->output)->toBe(10.0)
        ->and($rate->cacheRead)->toBe(0.125)
        ->and($rate->cacheWrite)->toBeNull()
        ->and($rate->custom)->toBeFalse();
});

it('uses the rate of the listed model for a version suffix', function (string $model) {
    config(['trail.pricing' => ['openai' => ['base' => rate(1.0), 'other' => rate(9.0)]]]);

    expect(book()->rateFor('openai', 'base'.$model)?->model)->toBe('base')
        ->and(book()->rateFor('openai', 'base'.$model)?->input)->toBe(1.0);
})->with(['-20251001', '-2025-08-07', '-08-2024', '-2512', '-001', '-latest']);

it('keeps the real model keys of the examples', function () {
    config(['trail.pricing' => [
        'openai' => ['gpt-5' => rate(1.0)],
        'anthropic' => ['claude-haiku-4-5' => rate(2.0)],
        'xai' => ['grok-4.7' => rate(3.0)],
        'gemini' => ['gemini-2.5-flash' => rate(4.0)],
    ]]);

    expect(book()->rateFor('openai', 'gpt-5-2025-08-07')?->model)->toBe('gpt-5')
        ->and(book()->rateFor('anthropic', 'claude-haiku-4-5-20251001')?->model)->toBe('claude-haiku-4-5')
        ->and(book()->rateFor('xai', 'grok-4.7-latest')?->model)->toBe('grok-4.7')
        ->and(book()->rateFor('gemini', 'gemini-2.5-flash-001')?->model)->toBe('gemini-2.5-flash');
});

it('prefers the longest listed key', function () {
    config(['trail.pricing' => [
        'openai' => ['gpt-4o' => rate(2.5), 'gpt-4o-mini' => rate(0.15)],
        'anthropic' => ['claude-opus-4' => rate(15.0), 'claude-opus-4-5' => rate(5.0)],
    ]]);

    expect(book()->rateFor('openai', 'gpt-4o-mini-2024-07-18')?->model)->toBe('gpt-4o-mini')
        ->and(book()->rateFor('openai', 'gpt-4o-2024-08-06')?->model)->toBe('gpt-4o')
        ->and(book()->rateFor('anthropic', 'claude-opus-4-5-20251101')?->model)->toBe('claude-opus-4-5')
        ->and(book()->rateFor('anthropic', 'claude-opus-4-20250514')?->model)->toBe('claude-opus-4');
});

it('prefers the longest key when several keys match the suffix rule', function (array $table) {
    config(['trail.pricing' => ['acme' => $table]]);

    expect(book()->rateFor('acme', 'acme-08-2024')?->model)->toBe('acme-08')
        ->and(book()->rateFor('acme', 'acme-08-2024')?->input)->toBe(2.0)
        ->and(book()->rateFor('acme', 'acme-2024')?->model)->toBe('acme');
})->with([
    'short key first' => [['acme' => rate(1.0), 'acme-08' => rate(2.0)]],
    'long key first' => [['acme-08' => rate(2.0), 'acme' => rate(1.0)]],
]);

it('does not price a model by a bare prefix', function (string $provider, string $key, string $model) {
    config(['trail.pricing' => [$provider => [$key => rate(1.0)]]]);

    expect(book()->rateFor($provider, $model))->toBeNull();
})->with([
    'sized variant' => ['openai', 'gpt-5', 'gpt-5-mini'],
    'next generation' => ['anthropic', 'claude-sonnet-5', 'claude-sonnet-5-5'],
    'other product' => ['openai', 'o3', 'o3-deep-research'],
    'cheaper sibling' => ['openai', 'gpt-4', 'gpt-4o-mini'],
    'minor version' => ['openai', 'gpt-5', 'gpt-5.5'],
    'longer number' => ['openai', 'gpt-5', 'gpt-50'],
    'five digits' => ['openai', 'base', 'base-12345'],
    'partial date' => ['openai', 'base', 'base-2025-08'],
]);

it('only matches within the same provider and is case sensitive', function () {
    config(['trail.pricing' => ['openai' => ['gpt-5' => rate(1.0)]]]);

    expect(book()->rateFor('azure', 'gpt-5'))->toBeNull()
        ->and(book()->rateFor('OpenAI', 'gpt-5'))->toBeNull()
        ->and(book()->rateFor('openai', 'GPT-5'))->toBeNull()
        ->and(book()->rateFor('openai', 'gpt-5')?->input)->toBe(1.0);
});

it('lets a database row replace the config entry as a whole', function () {
    config(['trail.pricing' => ['openai' => ['gpt-5' => ['input' => 1.0, 'output' => 2.0, 'cache_read' => 0.5, 'cache_write' => 1.5]]]]);
    Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => 3]);

    $rate = book()->rateFor('openai', 'gpt-5');

    expect($rate?->input)->toBe(3.0)
        ->and($rate?->output)->toBeNull()
        ->and($rate?->cacheRead)->toBeNull()
        ->and($rate?->cacheWrite)->toBeNull()
        ->and($rate?->custom)->toBeTrue();
});

it('finds database rows for models config does not list', function () {
    config(['trail.pricing' => ['openai' => ['gpt-5' => rate(1.0)]]]);
    Rows::price(['provider' => 'acme', 'model' => 'tiny', 'input' => 0.5, 'output' => 1.5]);

    $rate = book()->rateFor('acme', 'tiny');

    expect($rate?->input)->toBe(0.5)
        ->and($rate?->output)->toBe(1.5)
        ->and($rate?->custom)->toBeTrue();
});

it('lets database rows take part in version suffix matching', function () {
    config(['trail.pricing' => []]);
    Rows::price(['provider' => 'acme', 'model' => 'tiny', 'input' => 0.5]);

    $rate = book()->rateFor('acme', 'tiny-2026-01-01');

    expect($rate?->model)->toBe('tiny')
        ->and($rate?->custom)->toBeTrue()
        ->and(book()->rateFor('acme', 'tiny-mini'))->toBeNull();
});

it('keeps a free rate apart from a missing one', function () {
    Rows::price(['provider' => 'acme', 'model' => 'free', 'input' => 0, 'output' => null]);

    $rate = book()->rateFor('acme', 'free');

    expect($rate?->input)->toBe(0.0)
        ->and($rate?->output)->toBeNull();
});

it('reads database rows once until flushed', function () {
    config(['trail.pricing' => []]);
    Rows::price(['provider' => 'acme', 'model' => 'tiny', 'input' => 1]);

    $queries = 0;
    DB::listen(function ($query) use (&$queries) {
        if (str_starts_with($query->sql, 'select') && str_contains($query->sql, 'trail_prices')) {
            $queries++;
        }
    });

    book()->rateFor('acme', 'tiny');
    book()->rateFor('acme', 'tiny-latest');
    book()->rateFor('acme', 'unknown');
    book()->rateFor('other', 'tiny');

    expect($queries)->toBe(1);

    DB::table('trail_prices')->where('model', 'tiny')->update(['input' => 4]);

    expect(book()->rateFor('acme', 'tiny')?->input)->toBe(1.0);

    book()->flush();

    expect(book()->rateFor('acme', 'tiny')?->input)->toBe(4.0)
        ->and($queries)->toBe(2);
});

it('reads stored prices again once the refresh window has passed', function () {
    config(['trail.pricing' => []]);
    Rows::price(['provider' => 'acme', 'model' => 'tiny', 'input' => 1]);

    $queries = 0;
    DB::listen(function ($query) use (&$queries) {
        if (str_starts_with($query->sql, 'select') && str_contains($query->sql, 'trail_prices')) {
            $queries++;
        }
    });

    $this->travelTo(now());

    expect(book()->rateFor('acme', 'tiny')?->input)->toBe(1.0);

    DB::table('trail_prices')->where('model', 'tiny')->update(['input' => 5]);

    $this->travel(PriceBook::REFRESH_SECONDS)->seconds();

    expect(book()->rateFor('acme', 'tiny')?->input)->toBe(1.0)
        ->and($queries)->toBe(1);

    $this->travel(2)->seconds();

    expect(book()->rateFor('acme', 'tiny')?->input)->toBe(5.0)
        ->and($queries)->toBe(2);
});

it('does not retry or report a failed read within the window, and recovers after it', function () {
    Exceptions::fake();
    $this->travelTo(now());

    config(['trail.pricing' => []]);
    Rows::price(['provider' => 'acme', 'model' => 'tiny', 'input' => 2]);

    $resolver = new FlakyResolver(app(ConnectionResolverInterface::class));
    $book = new PriceBook(app('config'), $resolver);

    expect($book->rateFor('acme', 'tiny'))->toBeNull();

    $resolver->failing = false;
    $this->travel(PriceBook::REFRESH_SECONDS)->seconds();

    expect($book->rateFor('acme', 'tiny'))->toBeNull();

    Exceptions::assertReportedCount(1);

    $this->travel(2)->seconds();

    expect($book->rateFor('acme', 'tiny')?->input)->toBe(2.0);

    Exceptions::assertReportedCount(1);
});

it('leaves the callers transaction usable when a read fails', function () {
    Exceptions::fake();

    config(['trail.pricing' => ['openai' => ['gpt-5' => rate(1.0)]]]);
    Rows::price(['provider' => 'acme', 'model' => 'tiny', 'input' => 2]);

    $connection = DB::connection();
    $prefix = $connection->getTablePrefix();

    expect($connection->transactionLevel())->toBeGreaterThan(0);

    // With this prefix the tables do not exist, so the engine itself rejects the statements.
    $connection->setTablePrefix('missing_');

    try {
        $book = new PriceBook(app('config'), app(ConnectionResolverInterface::class));
        $rate = $book->rateFor('openai', 'gpt-5');
        $known = $book->knownModels();
    } finally {
        $connection->setTablePrefix($prefix);
    }

    expect($rate?->input)->toBe(1.0)
        ->and($rate?->custom)->toBeFalse()
        ->and($known)->toBe([['provider' => 'openai', 'model' => 'gpt-5']]);

    Exceptions::assertReportedCount(2);

    expect(DB::table('trail_prices')->count())->toBe(1);
});

it('falls back to config and reports once when the prices cannot be read', function () {
    Exceptions::fake();

    config(['trail.pricing' => ['openai' => ['gpt-5' => rate(1.0)]]]);
    Rows::price(['provider' => 'acme', 'model' => 'tiny', 'input' => 2]);

    $resolver = new FlakyResolver(app(ConnectionResolverInterface::class));
    $book = new PriceBook(app('config'), $resolver);

    expect($book->rateFor('openai', 'gpt-5-latest')?->input)->toBe(1.0)
        ->and($book->rateFor('openai', 'gpt-5')?->custom)->toBeFalse()
        ->and($book->rateFor('acme', 'tiny'))->toBeNull();

    Exceptions::assertReportedCount(1);

    $resolver->failing = false;

    expect($book->rateFor('acme', 'tiny'))->toBeNull();

    $book->flush();

    expect($book->rateFor('acme', 'tiny')?->input)->toBe(2.0);

    Exceptions::assertReportedCount(1);
});

it('retries after a failure only on flush and reports each failure once', function () {
    Exceptions::fake();

    $resolver = new FlakyResolver(app(ConnectionResolverInterface::class));
    $book = new PriceBook(app('config'), $resolver);

    $book->rateFor('openai', 'gpt-5');
    $book->rateFor('openai', 'gpt-5');
    $book->flush();
    $book->rateFor('openai', 'gpt-5');

    Exceptions::assertReportedCount(2);
});

it('does not throw when the connection cannot be opened', function () {
    Exceptions::fake();

    config([
        'trail.pricing' => ['openai' => ['gpt-5' => rate(1.0)]],
        'database.connections.trail_broken' => ['driver' => 'sqlite', 'database' => '/nonexistent/trail.sqlite', 'prefix' => ''],
    ]);

    $book = new PriceBook(app('config'), app(ConnectionResolverInterface::class), 'trail_broken');

    expect($book->rateFor('openai', 'gpt-5')?->input)->toBe(1.0);

    Exceptions::assertReportedCount(1);
});

it('reads config values leniently', function () {
    config(['trail.pricing' => [
        'acme' => [
            'text' => ['input' => '2.5', 'output' => 'abc', 'cache_read' => -1, 'cache_write' => 3],
            'broken' => 'not an array',
            'zero' => ['input' => 0, 'output' => null],
            'nulls' => ['input' => true, 'output' => [1]],
        ],
        'bad' => 'not an array',
    ]]);

    $text = book()->rateFor('acme', 'text');
    $zero = book()->rateFor('acme', 'zero');
    $nulls = book()->rateFor('acme', 'nulls');

    expect($text?->input)->toBe(2.5)
        ->and($text?->output)->toBeNull()
        ->and($text?->cacheRead)->toBeNull()
        ->and($text?->cacheWrite)->toBe(3.0)
        ->and(book()->rateFor('acme', 'broken'))->toBeNull()
        ->and(book()->rateFor('bad', 'anything'))->toBeNull()
        ->and($zero?->input)->toBe(0.0)
        ->and($zero?->output)->toBeNull()
        ->and($nulls?->input)->toBeNull()
        ->and($nulls?->output)->toBeNull();
});

it('survives a pricing config that is not an array', function () {
    config(['trail.pricing' => 'nope']);

    expect(book()->rateFor('openai', 'gpt-5'))->toBeNull()
        ->and(book()->knownModels())->toBe([]);
});

it('lists the models a price editor should offer', function () {
    config(['trail.pricing' => [
        'openai' => ['gpt-5' => rate(1.0), 'gpt-4o' => rate(2.0)],
        'anthropic' => ['claude-haiku-4-5' => rate(1.0)],
    ]]);

    Rows::price(['provider' => 'acme', 'model' => 'tiny']);
    Rows::price(['provider' => 'openai', 'model' => 'gpt-5']);

    $trace = Rows::trace();
    Rows::span($trace, ['type' => 'step', 'provider' => 'openai', 'model' => 'gpt-5']);
    Rows::span($trace, ['type' => 'step', 'provider' => 'openai', 'model' => 'gpt-5-2025-08-07']);
    Rows::span($trace, ['type' => 'step', 'provider' => 'openai', 'model' => 'gpt-5-2025-08-07']);
    Rows::span($trace, ['type' => 'embedding', 'provider' => 'voyageai', 'model' => 'voyage-4']);
    Rows::span($trace, ['type' => 'agent', 'provider' => 'ignored', 'model' => 'agent-model']);
    Rows::span($trace, ['type' => 'tool', 'provider' => 'ignored', 'model' => 'tool-model']);
    Rows::span($trace, ['type' => 'step', 'provider' => null, 'model' => 'no-provider']);
    Rows::span($trace, ['type' => 'step', 'provider' => 'ignored', 'model' => null]);

    expect(book()->knownModels())->toBe([
        ['provider' => 'acme', 'model' => 'tiny'],
        ['provider' => 'anthropic', 'model' => 'claude-haiku-4-5'],
        ['provider' => 'openai', 'model' => 'gpt-4o'],
        ['provider' => 'openai', 'model' => 'gpt-5'],
        ['provider' => 'openai', 'model' => 'gpt-5-2025-08-07'],
        ['provider' => 'voyageai', 'model' => 'voyage-4'],
    ]);
});

it('lists config and price rows when the spans cannot be read', function () {
    Exceptions::fake();

    config(['trail.pricing' => ['openai' => ['gpt-5' => rate(1.0)]]]);

    $book = new PriceBook(app('config'), new FlakyResolver(app(ConnectionResolverInterface::class)));

    expect($book->knownModels())->toBe([['provider' => 'openai', 'model' => 'gpt-5']]);

    Exceptions::assertReportedCount(2);
});

it('is a singleton that reads prices from the storage connection', function () {
    config([
        'database.connections.trail_secondary' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''],
        'trail.storage.connection' => 'trail_secondary',
        'trail.pricing' => [],
    ]);

    $this->artisan('migrate', ['--database' => 'trail_secondary'])->assertSuccessful();
    DB::connection('trail_secondary')->table('trail_prices')->insert([
        'provider' => 'acme', 'model' => 'tiny', 'input' => 1, 'created_at' => now(), 'updated_at' => now(),
    ]);

    expect(app(PriceBook::class))->toBe(app(PriceBook::class))
        ->and(app(PriceBook::class)->rateFor('acme', 'tiny')?->input)->toBe(1.0);

    config(['trail.storage.connection' => null]);
});
