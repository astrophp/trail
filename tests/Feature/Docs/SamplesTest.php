<?php

use App\Ai\Agents\HealthCheckAgent;
use App\Ai\Agents\SupportAgent;
use Astro\Trail\Capture\Payload;
use Astro\Trail\Capture\Recorder;
use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Tests\Fixtures\Docs\Pages;
use Astro\Trail\TrailApplicationServiceProvider;
use Illuminate\Auth\GenericUser;
use Illuminate\Console\Scheduling\Schedule as ScheduleManager;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;

require_once __DIR__.'/../../Fixtures/Docs/Agents.php';

uses(RefreshDatabase::class);

/*
|--------------------------------------------------------------------------
| The code samples in the documentation are run
|--------------------------------------------------------------------------
|
| A PHP block in a guide carries a marker, `<!-- sample: name -->`, on the line before it, and each
| marker has a test here that runs the block's own code, read from the page. Nothing is copied: if
| a page changes, the test runs the changed code. Samples that name `App\Ai\Agents\SupportAgent`
| run against a stand-in declared in tests/Fixtures/Docs/Agents.php.
|
| The tests that follow the samples check what the prose around them says.
|
*/

/**
 * Runs a sample's code as the body of a function and returns the variables it defined.
 *
 * @return array<string, mixed>
 */
function runSample(string $name): array
{
    $sample = Pages::sample($name);

    return eval($sample['uses']."\nreturn (function () {\n".$sample['code']."\nreturn get_defined_vars();\n})();");
}

/**
 * Evaluates a sample that is a fragment of an array, such as the entries of a config file.
 *
 * @return array<array-key, mixed>
 */
function sampleEntries(string $name): array
{
    $sample = Pages::sample($name);

    return eval($sample['uses']."\nreturn [\n".$sample['code']."\n];");
}

/** A service provider whose methods are the sample's code. */
function sampleProvider(string $name): TrailApplicationServiceProvider
{
    $sample = Pages::sample($name);

    return eval($sample['uses']."\nreturn new class(app()) extends \\Astro\\Trail\\TrailApplicationServiceProvider {\n".$sample['code']."\n};");
}

afterEach(function () {
    Trail::auth(null);
    Trail::filter(null);
    Trail::resolveUsersUsing(null);
});

it('has a marker on every PHP block of the guides, and a test for every marker', function () {
    $known = [
        'access.gate', 'access.auth', 'payloads.capture-off', 'payloads.redaction', 'payloads.filter',
        'payloads.without', 'cost.config', 'operations.schedule', 'operations.sqlite', 'operations.connection',
        'testing.fake', 'testing.assertions', 'testing.nothing', 'installation.fake', 'readme.fake', 'limits.users',
    ];

    $unmarked = [];

    foreach (Pages::guides() as $page) {
        foreach (Pages::blocks($page) as $block) {
            if ($block['language'] === 'php' && $block['sample'] === null) {
                $unmarked[] = basename($page).': '.strtok($block['code'], "\n");
            }
        }
    }

    expect($unmarked)->toBe([])
        ->and(array_values(array_unique(Pages::sampleNames())))->toEqualCanonicalizing($known);
});

it('runs the access.gate sample: the gate admits the listed email only', function () {
    sampleProvider('access.gate')->boot();

    expect(Gate::forUser(new GenericUser(['email' => 'ada@example.com']))->check('viewTrail'))->toBeTrue()
        ->and(Gate::forUser(new GenericUser(['email' => 'grace@example.com']))->check('viewTrail'))->toBeFalse();
});

it('runs the access.auth sample: only a request the callback accepts passes', function () {
    sampleProvider('access.auth')->boot();

    $as = fn (?object $user) => Request::create('/trail')->setUserResolver(fn () => $user);

    expect(Trail::check($as((object) ['is_admin' => true])))->toBeTrue()
        ->and(Trail::check($as((object) ['is_admin' => false])))->toBeFalse()
        ->and(Trail::check($as((object) ['is_admin' => 1])))->toBeFalse()
        ->and(Trail::check($as(null)))->toBeFalse();
});

it('runs the payloads.capture-off sample: no payload is stored, the run still is', function () {
    config(['trail' => array_merge(config('trail'), sampleEntries('payloads.capture-off'))]);
    app()->forgetInstance(Payload::class);
    app()->forgetInstance(Recorder::class);

    $trail = Trail::fake();
    SupportAgent::fake(['A secret answer.']);
    (new SupportAgent)->prompt('A secret question.');
    Trail::flush();

    $trace = $trail->traces()[0];

    expect($trace->status)->toBe(Status::Completed)
        ->and($trace->promptExcerpt)->toBeNull()
        ->and($trace->responseExcerpt)->toBeNull()
        ->and($trail->spans())->not->toBeEmpty();

    foreach ($trail->spans() as $span) {
        expect($span->input)->toBeNull()->and($span->output)->toBeNull();
    }
});

it('runs the payloads.redaction sample: the added key and pattern are redacted beside the defaults', function () {
    $added = sampleEntries('payloads.redaction');
    $defaults = require Pages::root().'/config/trail.php';

    config(['trail.redaction' => [
        'enabled' => true,
        'keys' => array_merge($defaults['redaction']['keys'], $added['keys']),
        'patterns' => array_merge($defaults['redaction']['patterns'], $added['patterns']),
    ]]);

    $captured = Payload::fromConfig(app('config'))->capture([
        'ssn' => '078-05-1120',
        'api_key' => 'abc',
        'note' => 'Order ACME-12345678 has shipped.',
        'plain' => 'nothing to hide',
    ]);

    expect($captured->value)->toBe([
        'ssn' => '[redacted]',
        'api_key' => '[redacted]',
        'note' => 'Order [redacted] has shipped.',
        'plain' => 'nothing to hide',
    ]);

    // A list that is set replaces the defaults, as the page says.
    config(['trail.redaction' => ['keys' => $added['keys'], 'patterns' => $added['patterns']]]);

    expect(Payload::fromConfig(app('config'))->capture(['api_key' => 'abc', 'ssn' => '1'])->value)
        ->toBe(['api_key' => 'abc', 'ssn' => '[redacted]']);
});

it('runs the payloads.filter sample: the filtered agent is not recorded, others are', function () {
    $trail = Trail::fake();

    runSample('payloads.filter');

    SupportAgent::fake(['One']);
    (new SupportAgent)->prompt('Hi');
    HealthCheckAgent::fake(['Two']);
    (new HealthCheckAgent)->prompt('Ping');
    Trail::flush();

    $trail->assertRecordedCount(1)->assertRecorded(SupportAgent::class)->assertNotRecorded(HealthCheckAgent::class);
});

it('runs the payloads.without sample: the callback returns its value and nothing is recorded', function () {
    $trail = Trail::fake();
    SupportAgent::fake(['A summary.']);

    $variables = runSample('payloads.without');
    Trail::flush();

    expect($variables['answer'])->toBe('A summary.');
    $trail->assertNothingRecorded();
});

it('runs the cost.config sample: the model is priced, and a published table replaces the package table', function () {
    $defaults = require Pages::root().'/config/trail.php';

    // The service provider merges config one level deep, so a published `pricing` replaces the table.
    config(['trail.pricing' => sampleEntries('cost.config')['pricing']]);

    $calculator = app(CostCalculator::class);

    expect($calculator->cost('openai', 'my-fine-tune', 1000, 500))->toBe(0.009)
        ->and(app(PriceBook::class)->rateFor('openai', 'gpt-5'))->toBeNull()
        ->and($defaults['pricing']['openai'])->toHaveKey('gpt-5');
});

it('runs the operations.schedule sample: it schedules real commands, daily and every five minutes', function () {
    runSample('operations.schedule');

    $events = collect(app(ScheduleManager::class)->events());
    $find = fn (string $command) => $events->first(fn ($event) => str_contains($event->command, $command));

    expect($find('trail:prune')->expression)->toBe('0 0 * * *')
        ->and($find('trail:sweep')->expression)->toBe('*/5 * * * *')
        ->and(array_keys(Artisan::all()))->toContain('trail:prune', 'trail:sweep');
});

it('runs the operations.sqlite sample: WAL, a busy timeout and an immediate transaction', function () {
    $file = tempnam(sys_get_temp_dir(), 'trail-docs-');
    $settings = sampleEntries('operations.sqlite')['sqlite'];

    $config = fn (int $busy) => array_merge(config('database.connections.sqlite'), ['driver' => 'sqlite', 'database' => $file, 'prefix' => ''], $settings, ['busy_timeout' => $busy]);
    config(['database.connections.docs_first' => $config(5000), 'database.connections.docs_second' => $config(0)]);

    try {
        $first = DB::connection('docs_first');

        expect($settings)->toBe(['busy_timeout' => 5000, 'journal_mode' => 'WAL', 'transaction_mode' => 'IMMEDIATE'])
            ->and($first->selectOne('pragma journal_mode')->journal_mode)->toBe('wal')
            ->and($first->selectOne('pragma busy_timeout')->timeout)->toBe(5000);

        $first->statement('create table docs_t (id integer)');

        // Laravel's SQLite connection reads transaction_mode on PHP 8.4 and newer only. There, a
        // transaction that has not written yet already holds the write lock.
        if (PHP_VERSION_ID >= 80400) {
            $first->beginTransaction();

            expect(fn () => DB::connection('docs_second')->table('docs_t')->insert(['id' => 1]))->toThrow(QueryException::class, 'database is locked');

            $first->rollBack();
        }
    } finally {
        DB::purge('docs_first');
        DB::purge('docs_second');
        @unlink($file);
        @unlink($file.'-wal');
        @unlink($file.'-shm');
    }
});

it('runs the testing.fake sample', function () {
    runSample('testing.fake');
});

it('runs the testing.assertions sample', function () {
    runSample('testing.assertions');
});

it('runs the testing.nothing sample', function () {
    runSample('testing.nothing');
});

it('runs the installation.fake and readme.fake samples, and the fake run is recorded without usage', function () {
    foreach (['installation.fake', 'readme.fake'] as $name) {
        $trail = Trail::fake();

        runSample($name);
        Trail::flush();

        $trail->assertRecordedCount(1)->assertRecorded(SupportAgent::class, fn ($trace) => $trace->status === Status::Completed);

        // A fake reports no usage: the totals say nothing, not zero.
        $totals = $trail->totals($trail->traces()[0]->id);

        expect($totals->inputTokens)->toBeNull()->and($totals->cost)->toBeNull();
    }
});

it('runs the limits.users sample: the callback resolves the users', function () {
    runSample('limits.users');

    $resolved = Trail::users()->resolve([['id' => '7', 'type' => 'App\Models\User']]);

    expect($resolved)->toHaveCount(1)
        ->and(array_values($resolved)[0])->toHaveKeys(['name', 'email'])
        ->and(array_values($resolved)[0]['name'])->not->toBeNull();
});

it('records a run only once it is flushed, as the testing page says', function () {
    $trail = Trail::fake();

    SupportAgent::fake(['Hello']);
    (new SupportAgent)->prompt('Hi');

    expect($trail->traces()[0]->status)->toBe(Status::Running);

    Trail::flush();

    expect($trail->traces()[0]->status)->toBe(Status::Completed);
});

it('reaches a flush point at the end of a request made with the HTTP test helpers, as the testing page says', function () {
    $trail = Trail::fake();
    Route::get('/docs-agent', fn () => (new SupportAgent)->prompt('Hi')->text);
    SupportAgent::fake(['Hello']);

    $this->get('/docs-agent')->assertOk();

    $trail->assertRecorded(SupportAgent::class, fn ($trace) => $trace->status === Status::Completed);
});

it('prices the example of the cost page, and the prefix example', function () {
    $calculator = app(CostCalculator::class);

    // 1,000 input tokens (200 of them cache reads) and 300 output tokens on claude-sonnet-5.
    expect($calculator->cost('anthropic', 'claude-sonnet-5', 1000, 300, 200, 0))->toBe(0.00464)
        ->and(app(PriceBook::class)->rateFor('openai', 'gpt-5-2025-08-07'))->toEqual(app(PriceBook::class)->rateFor('openai', 'gpt-5'))
        ->and(app(PriceBook::class)->rateFor('openai', 'gpt-5-2025-08-07'))->not->toBeNull();
});
