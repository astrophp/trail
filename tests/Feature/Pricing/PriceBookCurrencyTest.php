<?php

use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Pricing\PriceSource;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Database\ConnectionResolverInterface;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;

uses(RefreshDatabase::class);

/** A book of its own, so what it reports is its own. */
function currencyBook(): PriceBook
{
    return new PriceBook(app('config'), app(ConnectionResolverInterface::class));
}

beforeEach(function () {
    config(['trail.pricing' => [
        'openai' => [
            'gpt-5' => ['input' => 1.25, 'output' => 10.0],
            'embed' => ['input' => 0.1],
        ],
        'cohere' => [
            'rank' => ['reranking' => ['basis' => 'search_units', 'search_unit' => 0.0025]],
        ],
    ]]);
});

it('uses the bundled prices when the currency is USD, however it is written', function (mixed $currency) {
    config(['trail.currency' => $currency]);
    $book = currencyBook();

    expect($book->resolve('openai', 'gpt-5')->source)->toBe(PriceSource::Config)
        ->and($book->resolve('openai', 'gpt-5-2025-08-07')->source)->toBe(PriceSource::Prefix)
        ->and($book->resolveReranking('cohere', 'rank')->source)->toBe(PriceSource::Config)
        ->and($book->resolveReranking('cohere', 'rank-2025-08-07')->source)->toBe(PriceSource::Prefix);
})->with(['USD' => ['USD'], 'lower case' => ['usd'], 'padded' => [' Usd '], 'empty' => ['']]);

describe('another currency', function () {
    beforeEach(function () {
        config(['trail.currency' => 'eur']);
    });

    it('leaves every bundled price out', function () {
        $book = currencyBook();

        foreach ([
            $book->resolve('openai', 'gpt-5'),
            $book->resolve('openai', 'gpt-5-2025-08-07'),
            $book->resolve('openai', 'gpt-5', withoutOwnRow: true),
            $book->resolveReranking('cohere', 'rank'),
            $book->resolveReranking('cohere', 'rank-2025-08-07'),
            $book->resolveReranking('cohere', 'rank', withoutOwnRow: true),
        ] as $resolution) {
            expect($resolution->source)->toBe(PriceSource::None)
                ->and($resolution->rate)->toBeNull();
        }

        expect($book->rateFor('openai', 'gpt-5'))->toBeNull();
    });

    it('leaves out the entries an application added itself', function () {
        config(['trail.pricing.acme' => ['tiny' => ['input' => 1.0, 'output' => 2.0]]]);

        expect(currencyBook()->resolve('acme', 'tiny')->source)->toBe(PriceSource::None);
    });

    it('still lists the models of the configuration, so they can be priced', function () {
        $models = array_map(fn (array $entry) => $entry['provider'].'/'.$entry['model'], currencyBook()->catalogue());

        expect($models)->toBe(['cohere/rank', 'openai/embed', 'openai/gpt-5']);
    });

    it('uses a saved price, exactly and through a version suffix', function () {
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => 2, 'output' => 20]);

        $exact = currencyBook()->resolve('openai', 'gpt-5');
        $prefix = currencyBook()->resolve('openai', 'gpt-5-2025-08-07');

        expect($exact->source)->toBe(PriceSource::Saved)
            ->and($exact->rate?->input)->toBe(2.0)
            ->and($prefix->source)->toBe(PriceSource::Prefix)
            ->and($prefix->rate?->custom)->toBeTrue()
            ->and($prefix->rate?->output)->toBe(20.0);
    });

    it('returns a model without its own saved row to the other saved rows, and otherwise to nothing', function () {
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => 2]);
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5-2025-08-07', 'input' => 9]);

        $alone = currencyBook()->resolve('openai', 'gpt-5', withoutOwnRow: true);
        $through = currencyBook()->resolve('openai', 'gpt-5-2025-08-07', withoutOwnRow: true);

        expect($alone->source)->toBe(PriceSource::None)
            ->and($alone->rate)->toBeNull()
            ->and($through->source)->toBe(PriceSource::Prefix)
            ->and($through->rate?->input)->toBe(2.0);
    });

    it('does the same for the reranking group', function () {
        Rows::price(['provider' => 'cohere', 'model' => 'rank', 'reranking_rates_set' => true, 'reranking_basis' => 'input_tokens', 'reranking_input' => 0.3]);
        Rows::price(['provider' => 'cohere', 'model' => 'rank-2025-08-07', 'reranking_rates_set' => true, 'reranking_basis' => 'input_tokens', 'reranking_input' => 0.9]);

        $book = currencyBook();

        expect($book->resolveReranking('cohere', 'rank')->source)->toBe(PriceSource::Saved)
            ->and($book->resolveReranking('cohere', 'rank-2025-08-07')->source)->toBe(PriceSource::Saved)
            ->and($book->resolveReranking('cohere', 'rank-2025-08-08')->source)->toBe(PriceSource::Prefix)
            ->and($book->resolveReranking('cohere', 'rank', withoutOwnRow: true)->source)->toBe(PriceSource::None)
            ->and($book->resolveReranking('cohere', 'rank-2025-08-07', withoutOwnRow: true)->source)->toBe(PriceSource::Prefix)
            ->and($book->resolveReranking('cohere', 'rank-2025-08-07', withoutOwnRow: true)->rate?->rerankingInput)->toBe(0.3);
    });

    it('prices the token and the reranking group of a model apart, and keeps a saved zero', function () {
        Rows::price(['provider' => 'cohere', 'model' => 'rank', 'input' => 0, 'output' => 0, 'token_rates_set' => true, 'reranking_rates_set' => false]);
        Rows::price(['provider' => 'cohere', 'model' => 'rank-only', 'token_rates_set' => false, 'reranking_rates_set' => true, 'reranking_basis' => 'search_units', 'reranking_search_unit' => 0]);

        $book = currencyBook();

        expect($book->resolve('cohere', 'rank')->source)->toBe(PriceSource::Saved)
            ->and($book->resolve('cohere', 'rank')->rate?->input)->toBe(0.0)
            ->and($book->resolveReranking('cohere', 'rank')->source)->toBe(PriceSource::None)
            ->and($book->resolve('cohere', 'rank-only')->source)->toBe(PriceSource::None)
            ->and($book->resolveReranking('cohere', 'rank-only')->source)->toBe(PriceSource::Saved)
            ->and($book->resolveReranking('cohere', 'rank-only')->rate?->rerankingSearchUnit)->toBe(0.0);
    });

    it('reports nothing', function () {
        Exceptions::fake();

        currencyBook()->resolve('openai', 'gpt-5');

        Exceptions::assertNothingReported();
    });

    it('prices from nothing in a book that reads no saved prices, with no query', function () {
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => 2]);
        $queries = [];
        DB::listen(function (QueryExecuted $query) use (&$queries) {
            $queries[] = $query->sql;
        });

        $book = currencyBook()->configOnly();

        expect($book->resolve('openai', 'gpt-5')->source)->toBe(PriceSource::None)
            ->and($book->resolve('openai', 'gpt-5-2025-08-07')->source)->toBe(PriceSource::None)
            ->and($book->resolveReranking('cohere', 'rank')->source)->toBe(PriceSource::None)
            ->and($queries)->toBe([]);
    });
});

describe('a currency that is not a code', function () {
    it('leaves the bundled prices out and uses the saved ones', function (mixed $currency) {
        config(['trail.currency' => $currency]);
        Exceptions::fake();
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => 2]);
        $book = currencyBook();

        expect($book->resolve('openai', 'gpt-5')->source)->toBe(PriceSource::Saved)
            ->and($book->resolve('openai', 'gpt-5-2025-08-07')->source)->toBe(PriceSource::Prefix)
            ->and($book->resolve('openai', 'embed')->source)->toBe(PriceSource::None)
            ->and($book->resolveReranking('cohere', 'rank')->source)->toBe(PriceSource::None)
            ->and($book->resolve('openai', 'gpt-5', withoutOwnRow: true)->source)->toBe(PriceSource::None);
    })->with(['null' => [null], 'too long' => ['EURO'], 'digits' => ['12'], 'an integer' => [123], 'a list' => [[]]]);

    it('is reported once by a price book, however many prices it looks up and flushes', function () {
        config(['trail.currency' => 'EURO']);
        Exceptions::fake();
        $book = currencyBook();

        $book->resolve('openai', 'gpt-5');
        $book->resolve('openai', 'embed');
        $book->flush();
        $book->resolveReranking('cohere', 'rank');
        $book->configOnly()->resolve('openai', 'gpt-5');

        Exceptions::assertReportedCount(2);
        Exceptions::assertReported(fn (InvalidArgumentException $e) => $e->getMessage() === 'Trail ignored trail.currency: it must be a three-letter currency code such as USD. The prices in trail.pricing are not used.');
    });

    it('does not put the configured value in the report', function () {
        config(['trail.currency' => 'secret-value']);
        Exceptions::fake();

        currencyBook()->resolve('openai', 'gpt-5');

        Exceptions::assertReported(fn (InvalidArgumentException $e) => ! str_contains($e->getMessage(), 'secret-value'));
    });

    it('resolves a price when the exception handler itself throws', function () {
        config(['trail.currency' => 'EURO']);
        Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => 2]);
        $this->app->make(ExceptionHandler::class)->reportable(function (InvalidArgumentException $e): never {
            throw new LogicException('the handler is broken');
        });
        $book = currencyBook();

        expect($book->resolve('openai', 'gpt-5')->rate?->input)->toBe(2.0)
            ->and($book->resolve('openai', 'embed')->rate)->toBeNull();
    });
});
