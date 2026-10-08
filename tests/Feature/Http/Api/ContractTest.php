<?php

use Astro\Trail\Enums\ErrorSource;
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
 * One run that shows every shape of the run's page: all four span types, a sub-agent under a tool,
 * a span in each cost and usage state, a failed span and a failed tool, cut and redacted payloads,
 * a step that never learnt which model answered, and the run's error beside approvals. A real run
 * holds only some of this; the response is built to cover the shapes, not to be one run.
 */
function traceContractDataset(): void
{
    DB::table('users')->insert(['id' => 7, 'name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);

    $trace = Rows::trace([
        'id' => '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30',
        'name' => 'SupportAssistant',
        'agent_class' => 'App\\Ai\\Agents\\SupportAssistant',
        'status' => Status::Failed,
        'issue_kind' => IssueKind::RateLimited,
        'error_class' => 'Laravel\\Ai\\Exceptions\\RateLimitedException',
        'error_message' => 'Application rate limited by AI provider [anthropic].',
        'error_source' => ErrorSource::Run,
        'error_http_status' => 429,
        'child_failed' => false,
        'provider' => 'anthropic',
        'model' => 'claude-sonnet-4-5',
        'duration_ms' => 3000.5,
        'input_tokens' => 1764,
        'output_tokens' => 410,
        'cache_read_tokens' => 5,
        'cache_write_tokens' => 6,
        'reasoning_tokens' => 7,
        'cost' => 0.008752,
        'span_count' => 11,
        'unpriced_span_count' => 1,
        'prompt_excerpt' => 'Where is my order?',
        'conversation_id' => 'conversation-1',
        'user_id' => '7',
        'user_type' => User::class,
        'metadata' => [
            'resolved_tool_call_ids' => ['toolu_01'],
            'pending_approvals' => [['tool_call_id' => 'toolu_02', 'tool' => 'refund_order', 'arguments' => ['order' => 1042], 'reason' => 'Moves money']],
        ],
        'started_at' => '2026-01-02 11:00:00',
        'ended_at' => '2026-01-02 11:00:03.000',
    ]);
    Rows::bookmark($trace);

    $span = fn (int $sequence, array $attributes) => Rows::span($trace, [...[
        'id' => sprintf('span-%02d', $sequence), 'sequence' => $sequence, 'status' => Status::Completed,
        'started_at' => '2026-01-02 11:00:00', 'ended_at' => '2026-01-02 11:00:01', 'duration_ms' => 1000.0,
    ], ...$attributes]);

    $span(1, [
        'type' => SpanType::Agent, 'name' => 'SupportAssistant', 'agent_class' => 'App\\Ai\\Agents\\SupportAssistant', 'status' => Status::Failed,
        'issue_kind' => IssueKind::RateLimited, 'error_class' => 'Laravel\\Ai\\Exceptions\\RateLimitedException',
        'error_message' => 'Application rate limited by AI provider [anthropic].', 'error_source' => ErrorSource::Run, 'error_http_status' => 429,
        'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5', 'duration_ms' => 3000.5, 'ended_at' => '2026-01-02 11:00:03.000',
        'input' => ['prompt' => 'Where is my order?', 'attachments' => [['type' => 'image', 'name' => 'receipt.png']]],
    ]);
    $span(2, [
        'parent_id' => 'span-01', 'name' => 'step', 'attempt' => 1, 'step_number' => 0, 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5',
        'responding_model' => 'claude-sonnet-4-5-20250929', 'input_tokens' => 1200, 'output_tokens' => 310, 'cache_read_tokens' => 5,
        'cache_write_tokens' => 6, 'reasoning_tokens' => 7, 'cost' => 0.00825, 'started_at' => '2026-01-02 11:00:00.100', 'duration_ms' => 840.25, 'ended_at' => '2026-01-02 11:00:00.940',
        'input' => ['messages' => [['role' => 'user', 'content' => 'Where is my order?']], 'messages_offset' => 0, 'options' => ['max_tokens' => null]],
        'output' => ['text' => '', 'tool_calls' => [['id' => 'toolu_01', 'name' => 'search', 'arguments' => ['query' => 'order 1042']]], 'finish_reason' => 'tool_use'],
        'metadata' => ['truncated' => ['input.messages.0.content' => 12000]], 'redacted' => true, 'truncated' => true,
    ]);
    $span(3, [
        'parent_id' => 'span-01', 'type' => SpanType::Tool, 'name' => 'search', 'started_at' => '2026-01-02 11:00:01', 'duration_ms' => 1500.0,
        'ended_at' => '2026-01-02 11:00:02.500',
        'input' => ['arguments' => ['query' => 'order 1042']], 'output' => ['result' => 'Order 1042 shipped on Monday.'],
    ]);
    $span(4, [
        'parent_id' => 'span-03', 'type' => SpanType::Agent, 'name' => 'ResearchAgent', 'agent_class' => 'App\\Ai\\Agents\\ResearchAgent',
        'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5', 'started_at' => '2026-01-02 11:00:01.100', 'duration_ms' => 1200.0, 'ended_at' => '2026-01-02 11:00:02.300',
        'input' => ['prompt' => 'Find order 1042', 'system' => null], 'output' => ['text' => 'It shipped on Monday.'],
    ]);
    $span(5, [
        'parent_id' => 'span-04', 'name' => 'step', 'step_number' => 0, 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5', 'responding_model' => null,
        'input_tokens' => 400, 'output_tokens' => 90, 'started_at' => '2026-01-02 11:00:01.200', 'duration_ms' => 700.0, 'ended_at' => '2026-01-02 11:00:01.900',
        'input' => ['messages' => [['role' => 'user', 'content' => 'Find order 1042']], 'messages_offset' => 0, 'options' => null],
        'output' => ['text' => 'It shipped on Monday.', 'tool_calls' => [], 'finish_reason' => 'stop'],
    ]);
    $span(6, [
        'parent_id' => 'span-04', 'name' => 'step', 'step_number' => 1, 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5',
        'responding_model' => 'claude-sonnet-4-5-20250929', 'input_tokens' => 100, 'output_tokens' => 10, 'cost' => 0.0005,
        'started_at' => '2026-01-02 11:00:01.900', 'duration_ms' => 300.0, 'ended_at' => '2026-01-02 11:00:02.200',
        'input' => ['messages' => [], 'messages_offset' => 2, 'options' => null], 'output' => ['text' => 'Done', 'tool_calls' => [], 'finish_reason' => 'stop'],
    ]);
    $span(7, [
        'parent_id' => 'span-03', 'type' => SpanType::Embedding, 'name' => 'embeddings', 'provider' => 'openai', 'model' => 'text-embedding-3-small',
        'input_tokens' => 64, 'cost' => 0.000002, 'started_at' => '2026-01-02 11:00:01.050', 'duration_ms' => 210.5, 'ended_at' => '2026-01-02 11:00:01.260',
        'input' => ['count' => 2, 'dimensions' => 1536], 'output' => ['count' => 2],
    ]);
    // Cut, but with nothing to say where.
    $span(8, [
        'parent_id' => 'span-01', 'name' => 'step', 'step_number' => 2, 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5',
        'responding_model' => 'claude-sonnet-4-5-20250929', 'started_at' => '2026-01-02 11:00:02.500', 'duration_ms' => 100.0, 'ended_at' => '2026-01-02 11:00:02.600',
        'input' => ['messages' => [], 'messages_offset' => 4, 'options' => null], 'truncated' => true,
    ]);
    $span(9, [
        'parent_id' => 'span-01', 'status' => Status::Running, 'name' => 'step', 'step_number' => 3, 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5',
        'started_at' => '2026-01-02 11:00:02.600', 'ended_at' => null, 'duration_ms' => null, 'input' => ['messages' => [], 'messages_offset' => 5, 'options' => null],
    ]);
    $span(10, [
        'parent_id' => 'span-01', 'status' => Status::Failed, 'name' => 'step', 'attempt' => 2, 'step_number' => 0, 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5',
        'issue_kind' => IssueKind::RateLimited, 'error_class' => 'Laravel\\Ai\\Exceptions\\RateLimitedException',
        'error_message' => 'Application rate limited by AI provider [anthropic].', 'error_source' => ErrorSource::Step, 'error_http_status' => 429,
        'started_at' => '2026-01-02 11:00:02.700', 'duration_ms' => null, 'ended_at' => '2026-01-02 11:00:02.750', 'input' => ['messages' => [], 'messages_offset' => 0, 'options' => null],
    ]);
    $span(11, [
        'parent_id' => 'span-01', 'status' => Status::Failed, 'type' => SpanType::Tool, 'name' => 'lookup', 'issue_kind' => IssueKind::ToolError,
        'error_class' => 'RuntimeException', 'error_message' => 'Disk full', 'error_source' => ErrorSource::Tool,
        'started_at' => '2026-01-02 11:00:02.800', 'duration_ms' => 50.0, 'ended_at' => '2026-01-02 11:00:02.850', 'input' => ['arguments' => ['query' => 'stock']],
    ]);
}

/**
 * @param  array<string, mixed>|object  $body  decoded as objects where an empty object must stay one
 */
function assertContract(string $name, array|object $body): void
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

it('sends the trace response the dashboard expects', function () {
    traceContractDataset();

    $response = $this->getJson('/trail/api/traces/0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30')->assertOk();

    // Decoded as objects: the span's truncated paths are an empty object when nothing was cut.
    assertContract('trace', json_decode($response->getContent(), false, flags: JSON_THROW_ON_ERROR));
});

it('sends the bookmark response the dashboard expects', function () {
    Rows::trace(['id' => '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30', 'status' => Status::Completed, 'started_at' => '2026-01-02 11:00:00']);

    // The environment is "local", where the framework checks CSRF tokens even in tests.
    $response = $this->withSession(['_token' => 'token'])->putJson('/trail/api/traces/0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30/bookmark', [], ['X-CSRF-TOKEN' => 'token']);

    assertContract('bookmark', $response->assertOk()->json());
});

it('sends the neighbours response the dashboard expects', function () {
    contractDataset();

    // Newest first: the run just before it in the list is the later one, and the one after it the earlier.
    assertContract('neighbours', $this->getJson('/trail/api/traces/trace-partial/neighbours')->assertOk()->json());
});

it('lists the values of the enums the dashboard mirrors', function () {
    assertContract('enums', [
        'status' => array_column(Status::cases(), 'value'),
        'issue_kind' => array_column(IssueKind::cases(), 'value'),
        'span_type' => array_column(SpanType::cases(), 'value'),
        'error_source' => array_column(ErrorSource::cases(), 'value'),
    ]);
});
