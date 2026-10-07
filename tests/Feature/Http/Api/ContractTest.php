<?php

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Astro\Trail\Tests\Fixtures\Users\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/*
 * The JSON the API sends, frozen in tests/Contract. The dashboard's tests read the same files and
 * check them against its TypeScript types, so a field renamed on either side fails a test.
 *
 * After changing a response on purpose: UPDATE_CONTRACT=1 vendor/bin/pest tests/Feature/Http/Api/ContractTest.php
 */

beforeEach(function () {
    $this->app['env'] = 'local';
    config(['app.name' => 'Laravel']);
    Carbon::setTestNow('2026-01-02 12:00:00');
});

afterEach(fn () => Carbon::setTestNow());

/**
 * One run of every kind the API tells apart, each with its own start so the order is the same on
 * every database. Names start with distinct capitals because databases sort text their own way.
 */
function contractDataset(): void
{
    DB::table('users')->insert(['id' => 7, 'name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);

    $full = Rows::trace([
        'id' => '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30',
        'name' => 'SupportAssistant',
        'agent_class' => 'App\\Ai\\Agents\\SupportAssistant',
        'status' => Status::Completed,
        'streamed' => true,
        'provider' => 'anthropic',
        'model' => 'claude-sonnet-4-5',
        'duration_ms' => 1840.412,
        'input_tokens' => 1200,
        'output_tokens' => 310,
        'cache_read_tokens' => 5,
        'cache_write_tokens' => 6,
        'reasoning_tokens' => 7,
        'cost' => 0.00825,
        'span_count' => 4,
        'prompt_excerpt' => 'Where is my order?',
        'response_excerpt' => 'Your order shipped on Monday.',
        'conversation_id' => 'conversation-1',
        'user_id' => '7',
        'user_type' => User::class,
        'started_at' => '2026-01-02 11:00:00',
        'ended_at' => '2026-01-02 11:00:01.840',
    ]);
    Rows::bookmark($full);
    Rows::span($full, ['id' => 'span-1', 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5', 'started_at' => '2026-01-02 11:00:00']);
    Rows::span($full, ['id' => 'span-2', 'provider' => 'openai', 'model' => 'gpt-5', 'started_at' => '2026-01-02 11:00:00']);

    // Some steps priced, some not.
    Rows::trace([
        'id' => 'trace-partial', 'name' => 'TicketTriage', 'status' => Status::Completed, 'provider' => 'openai', 'model' => 'gpt-5',
        'duration_ms' => 950.5, 'input_tokens' => 800, 'output_tokens' => 120, 'cost' => 0.004, 'unpriced_span_count' => 1, 'span_count' => 3,
        'started_at' => '2026-01-02 10:50:00', 'ended_at' => '2026-01-02 10:50:00.950',
    ]);

    // Usage reported, nothing could be priced; only one count came back.
    Rows::trace([
        'id' => 'trace-unpriced', 'name' => 'TicketTriage', 'status' => Status::Completed, 'duration_ms' => 400.25,
        'input_tokens' => 90, 'unpriced_span_count' => 1, 'span_count' => 1,
        'started_at' => '2026-01-02 10:40:00', 'ended_at' => '2026-01-02 10:40:00.400',
    ]);

    // A finished run with nothing captured but what the row needs.
    Rows::trace(['id' => 'trace-bare', 'name' => 'Bare', 'status' => Status::Completed, 'started_at' => '2026-01-02 10:30:00']);

    // Still running, with some cost so far and with none.
    Rows::trace([
        'id' => 'trace-running-priced', 'name' => 'SupportAssistant', 'status' => Status::Running, 'input_tokens' => 300, 'cost' => 0.0012, 'span_count' => 2,
        'started_at' => '2026-01-02 11:50:00',
    ]);
    Rows::trace(['id' => 'trace-running-bare', 'name' => 'SupportAssistant', 'status' => Status::Running, 'started_at' => '2026-01-02 11:55:00']);

    // Running for longer than stale_after: reported as abandoned.
    Rows::trace(['id' => 'trace-stale', 'name' => 'Retired', 'status' => Status::Running, 'started_at' => '2026-01-02 05:00:00']);

    // A user who can no longer be found.
    Rows::trace([
        'id' => 'trace-failed', 'name' => 'SupportAssistant', 'status' => Status::Failed, 'issue_kind' => IssueKind::RateLimited,
        'recovered' => true, 'child_failed' => true, 'duration_ms' => 120.75, 'user_id' => '999', 'user_type' => User::class,
        'started_at' => '2026-01-02 10:20:00', 'ended_at' => '2026-01-02 10:20:00.120',
    ]);

    Rows::trace([
        'id' => 'trace-incomplete', 'name' => 'TicketTriage', 'status' => Status::Incomplete, 'issue_kind' => IssueKind::ProviderConnection,
        'started_at' => '2026-01-02 10:10:00',
    ]);

    Rows::trace(['id' => 'trace-approval', 'name' => 'Refunds', 'status' => Status::AwaitingApproval, 'started_at' => '2026-01-02 10:00:00']);

    Rows::trace([
        'id' => 'trace-embedding', 'type' => SpanType::Embedding, 'name' => 'Embeddings', 'status' => Status::Completed, 'provider' => 'openai',
        'model' => 'text-embedding-3-small', 'duration_ms' => 210.5, 'input_tokens' => 64, 'cost' => 0.000002, 'span_count' => 1,
        'started_at' => '2026-01-02 09:00:00', 'ended_at' => '2026-01-02 09:00:00.210',
    ]);
}

/**
 * @param  array<string, mixed>  $body
 */
function assertContract(string $name, array $body): void
{
    $path = __DIR__.'/../../../Contract/'.$name.'.json';
    $json = json_encode($body, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)."\n";

    if (getenv('UPDATE_CONTRACT') === '1') {
        file_put_contents($path, $json);

        return;
    }

    expect(file_exists($path))->toBeTrue("tests/Contract/{$name}.json is missing. Regenerate it with UPDATE_CONTRACT=1 vendor/bin/pest tests/Feature/Http/Api/ContractTest.php");
    expect($json)->toBe(file_get_contents($path), "The {$name} response no longer matches tests/Contract/{$name}.json. If the change is intended, regenerate the file with UPDATE_CONTRACT=1 vendor/bin/pest tests/Feature/Http/Api/ContractTest.php and review the diff.");
}

it('sends the meta response the dashboard expects', function () {
    contractDataset();

    $body = $this->getJson('/trail/api/meta')->assertOk()->json();

    // The installed version differs from one install to the next.
    $body['data']['version'] = '0.1.0';

    assertContract('meta', $body);
});

it('sends the traces response the dashboard expects', function () {
    contractDataset();

    assertContract('traces', $this->getJson('/trail/api/traces')->assertOk()->json());
});

it('sends the bookmark response the dashboard expects', function () {
    Rows::trace(['id' => '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30', 'status' => Status::Completed, 'started_at' => '2026-01-02 11:00:00']);

    // The environment is "local", where the framework checks CSRF tokens even in tests.
    $response = $this->withSession(['_token' => 'token'])->putJson('/trail/api/traces/0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30/bookmark', [], ['X-CSRF-TOKEN' => 'token']);

    assertContract('bookmark', $response->assertOk()->json());
});

it('lists the values of the enums the dashboard mirrors', function () {
    assertContract('enums', [
        'status' => array_column(Status::cases(), 'value'),
        'issue_kind' => array_column(IssueKind::cases(), 'value'),
    ]);
});
