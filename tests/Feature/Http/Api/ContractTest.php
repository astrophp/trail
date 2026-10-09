<?php

use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Http\AgentRows;
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
 * Conversations of every kind the list tells apart: one with a turn still running, one priced in
 * part, one with two users, and one with nothing captured.
 */
function conversationContractDataset(): void
{
    DB::table('users')->insert([
        ['id' => 7, 'name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x'],
        ['id' => 8, 'name' => 'Grace', 'email' => 'grace@example.test', 'password' => 'x'],
    ]);

    $turn = fn (string $id, string $conversation, string $started, array $attributes = []) => Rows::trace([...[
        'id' => $id, 'name' => 'SupportAssistant', 'status' => Status::Completed, 'conversation_id' => $conversation, 'started_at' => $started,
    ], ...$attributes]);

    // A turn still running: usage and cost are what has been recorded so far.
    $turn('turn-p1', 'conversation-pending', '2026-01-02 11:00:00', [
        'input_tokens' => 1200, 'output_tokens' => 310, 'cost' => 0.00825, 'prompt_excerpt' => 'Where is my order?', 'user_id' => '7', 'user_type' => User::class,
    ]);
    $turn('turn-p2', 'conversation-pending', '2026-01-02 11:55:00', [
        'status' => Status::Running, 'input_tokens' => 300, 'cost' => 0.0012, 'prompt_excerpt' => 'And the invoice?', 'user_id' => '7', 'user_type' => User::class,
    ]);

    // One turn priced, one not.
    $turn('turn-q1', 'conversation-partial', '2026-01-02 10:00:00', [
        'name' => 'TicketTriage', 'input_tokens' => 800, 'output_tokens' => 120, 'cost' => 0.004, 'span_count' => 3, 'prompt_excerpt' => 'Close this ticket',
    ]);
    $turn('turn-q2', 'conversation-partial', '2026-01-02 10:30:00', [
        'name' => 'TicketTriage', 'status' => Status::Failed, 'input_tokens' => 90, 'unpriced_span_count' => 1, 'prompt_excerpt' => 'Reopen it',
    ]);

    // Two users and two agents, the first turn before the range.
    $turn('turn-u1', 'conversation-shared', '2025-12-31 09:00:00', ['name' => 'Refunds', 'user_id' => '8', 'user_type' => User::class, 'prompt_excerpt' => 'Refund order 1042']);
    $turn('turn-u2', 'conversation-shared', '2026-01-02 09:00:00', [
        'user_id' => '7', 'user_type' => User::class, 'status' => Status::AwaitingApproval, 'prompt_excerpt' => 'Approve it',
    ]);

    // Nothing but the row's own fields.
    $turn('turn-n1', 'conversation-bare', '2026-01-02 08:00:00', ['name' => 'Bare']);
}

/**
 * A conversation of three turns that shows every shape of its transcript: a tool and a delegated
 * agent with a cut result, a failover that recovered on a history of earlier turns, and a turn
 * waiting for approval. Spans are laid out by hand, with the ids and values chosen to be read.
 */
function transcriptContractDataset(): void
{
    DB::table('users')->insert(['id' => 7, 'name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);

    $turn = fn (string $id, string $started, array $attributes) => Rows::trace([...[
        'id' => $id, 'name' => 'SupportAssistant', 'agent_class' => 'App\\Ai\\Agents\\SupportAssistant', 'conversation_id' => 'support/ada 1042',
        'user_id' => '7', 'user_type' => User::class, 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5', 'started_at' => $started,
    ], ...$attributes]);

    $span = fn (Trace $trace, int $sequence, array $attributes) => Rows::span($trace, [...[
        'id' => sprintf('%s-s%02d', $trace->id, $sequence), 'sequence' => $sequence, 'status' => Status::Completed,
        'started_at' => $trace->started_at, 'ended_at' => $trace->started_at, 'duration_ms' => 100.0,
    ], ...$attributes]);

    $one = $turn('t1', '2026-01-02 11:00:00', [
        'status' => Status::Completed, 'duration_ms' => 4200.0, 'input_tokens' => 1500, 'output_tokens' => 220, 'cost' => 0.0078, 'span_count' => 7,
        'prompt_excerpt' => 'Where is order 1042?', 'response_excerpt' => 'Order 1042 shipped on 30 December and arrives tomorrow.', 'ended_at' => '2026-01-02 11:00:04.200',
    ]);
    $span($one, 1, ['type' => SpanType::Agent, 'name' => 'SupportAssistant', 'agent_class' => 'App\\Ai\\Agents\\SupportAssistant', 'input' => ['prompt' => 'Where is order 1042?', 'system' => null]]);
    $span($one, 2, [
        'parent_id' => 't1-s01', 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5',
        'input' => ['messages' => [['role' => 'user', 'content' => 'Where is order 1042?']], 'messages_offset' => 0, 'options' => null],
        'output' => ['text' => 'Let me check.', 'tool_calls' => [
            ['id' => 'toolu_01', 'name' => 'lookup_order', 'arguments' => ['order' => 1042]],
            ['id' => 'toolu_02', 'name' => 'ShippingAgent', 'arguments' => ['task' => 'Track parcel for order 1042']],
        ], 'finish_reason' => 'tool_calls'],
    ]);
    $span($one, 3, ['parent_id' => 't1-s01', 'type' => SpanType::Tool, 'name' => 'lookup_order', 'duration_ms' => 120.5, 'input' => ['arguments' => ['order' => 1042]], 'output' => ['result' => '{"status":"shipped","carrier":"DHL"}']]);
    $span($one, 4, ['parent_id' => 't1-s01', 'type' => SpanType::Tool, 'name' => 'ShippingAgent', 'duration_ms' => 1900.0, 'input' => ['arguments' => ['task' => 'Track parcel for order 1042']], 'output' => ['result' => 'Parcel is out for delivery tomorrow.']]);
    $span($one, 5, ['parent_id' => 't1-s04', 'type' => SpanType::Agent, 'name' => 'ShippingAgent', 'agent_class' => 'App\\Ai\\Agents\\ShippingAgent', 'provider' => 'anthropic', 'model' => 'claude-haiku-4-5', 'duration_ms' => 1850.0, 'input' => ['prompt' => 'Track parcel for order 1042', 'system' => null]]);
    $span($one, 6, ['parent_id' => 't1-s05', 'input' => ['messages' => [['role' => 'user', 'content' => 'Track parcel for order 1042']], 'messages_offset' => 0, 'options' => null], 'output' => ['text' => 'Parcel is out for delivery tomorrow.', 'tool_calls' => [], 'finish_reason' => 'stop']]);
    $span($one, 7, [
        'parent_id' => 't1-s01', 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5', 'truncated' => true,
        'input' => ['messages' => [
            ['role' => 'assistant', 'content' => 'Let me check.', 'tool_calls' => [
                ['id' => 'toolu_01', 'name' => 'lookup_order', 'arguments' => ['order' => 1042]],
                ['id' => 'toolu_02', 'name' => 'ShippingAgent', 'arguments' => ['task' => 'Track parcel for order 1042']],
            ]],
            ['role' => 'tool_result', 'content' => null, 'tool_results' => [
                ['id' => 'toolu_01', 'name' => 'lookup_order', 'result' => '{"status":"shipped","carrier":"DHL"}'],
                ['id' => 'toolu_02', 'name' => 'ShippingAgent', 'result' => 'Parcel is out for delivery tomorrow. Tracking notes follow: …'],
            ]],
        ], 'messages_offset' => 1, 'options' => null],
        'output' => ['text' => 'Order 1042 shipped on 30 December and arrives tomorrow.', 'tool_calls' => [], 'finish_reason' => 'stop'],
        'metadata' => ['truncated' => ['input.messages.1.tool_results.1.result' => 18422]],
    ]);

    $two = $turn('t2', '2026-01-02 11:05:00', [
        'status' => Status::Completed, 'recovered' => true, 'duration_ms' => 6100.0, 'input_tokens' => 2100, 'output_tokens' => 180, 'cost' => 0.009, 'span_count' => 3,
        'prompt_excerpt' => 'Can I still change the address?', 'response_excerpt' => 'Not once it is out for delivery.', 'ended_at' => '2026-01-02 11:05:06.100',
    ]);
    $span($two, 1, ['type' => SpanType::Agent, 'name' => 'SupportAssistant', 'attempt' => 2, 'agent_class' => 'App\\Ai\\Agents\\SupportAssistant', 'input' => ['prompt' => 'Can I still change the address?', 'system' => null]]);
    $span($two, 2, [
        'parent_id' => 't2-s01', 'attempt' => 1, 'status' => Status::Failed, 'provider' => 'openai', 'model' => 'gpt-5', 'issue_kind' => IssueKind::RateLimited,
        'error_class' => 'Laravel\\Ai\\Exceptions\\RateLimitedException', 'error_message' => 'Application rate limited by AI provider [openai].', 'error_source' => ErrorSource::Step, 'error_http_status' => 429,
        'input' => ['messages' => [['role' => 'user', 'content' => 'Can I still change the address?']], 'messages_offset' => 0, 'options' => null],
    ]);
    $span($two, 3, [
        'parent_id' => 't2-s01', 'attempt' => 2, 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5',
        'input' => ['messages' => [
            ['role' => 'user', 'content' => 'Where is order 1042?'], ['role' => 'assistant', 'content' => 'Order 1042 shipped on 30 December and arrives tomorrow.'],
            ['role' => 'user', 'content' => 'Thanks'], ['role' => 'assistant', 'content' => 'You are welcome.'],
            ['role' => 'user', 'content' => 'Can I still change the address?'],
        ], 'messages_offset' => 0, 'options' => null],
        'output' => ['text' => 'Not once it is out for delivery.', 'tool_calls' => [], 'finish_reason' => 'stop'],
    ]);

    $three = $turn('t3', '2026-01-02 11:09:00', [
        'status' => Status::AwaitingApproval, 'duration_ms' => 1300.0, 'input_tokens' => 2600, 'output_tokens' => 60, 'cost' => 0.0087, 'span_count' => 2,
        'prompt_excerpt' => 'Refund it', 'ended_at' => '2026-01-02 11:09:01.300',
        'metadata' => ['pending_approvals' => [['tool_call_id' => 'toolu_09', 'tool' => 'refund_order', 'arguments' => ['order' => 1042], 'reason' => 'Moves money']]],
    ]);
    $span($three, 1, ['type' => SpanType::Agent, 'name' => 'SupportAssistant', 'status' => Status::AwaitingApproval, 'agent_class' => 'App\\Ai\\Agents\\SupportAssistant', 'input' => ['prompt' => 'Refund it', 'system' => null]]);
    $span($three, 2, [
        'parent_id' => 't3-s01', 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5',
        'input' => ['messages' => [
            ['role' => 'user', 'content' => 'Where is order 1042?'], ['role' => 'assistant', 'content' => 'Order 1042 shipped on 30 December and arrives tomorrow.'],
            ['role' => 'user', 'content' => 'Can I still change the address?'], ['role' => 'assistant', 'content' => 'Not once it is out for delivery.'],
            ['role' => 'user', 'content' => 'Thanks'], ['role' => 'assistant', 'content' => 'You are welcome.'],
            ['role' => 'user', 'content' => 'Refund it'],
        ], 'messages_offset' => 0, 'options' => null],
        'output' => ['text' => '', 'tool_calls' => [['id' => 'toolu_09', 'name' => 'refund_order', 'arguments' => ['order' => 1042]]], 'finish_reason' => 'tool_calls'],
    ]);
}

/**
 * The runs of the shared dataset plus what the overview needs on top of them: a run that is
 * really stale, twenty runs with a duration so that the 95th percentile is computed, and the
 * period before the range, with runs in it.
 */
function overviewContractDataset(): void
{
    contractDataset();

    Rows::trace([
        'id' => 'trace-abandoned', 'name' => 'Retired', 'status' => Status::Running, 'started_at' => '2026-01-02 05:30:00',
        'created_at' => Carbon::now()->subHours(3),
    ]);

    foreach (range(1, 20) as $i) {
        Rows::trace([
            'id' => sprintf('trace-latency-%02d', $i), 'name' => 'Latency', 'status' => Status::Completed, 'duration_ms' => $i * 100,
            'input_tokens' => 10, 'output_tokens' => 5, 'cost' => 0.001, 'started_at' => '2026-01-02 08:00:00',
        ]);
    }

    Rows::trace(['id' => 'trace-before-1', 'name' => 'Latency', 'status' => Status::Completed, 'duration_ms' => 700.5, 'input_tokens' => 50, 'cost' => 0.0123456789, 'started_at' => '2026-01-01 09:00:00']);
    Rows::trace(['id' => 'trace-before-2', 'name' => 'Latency', 'status' => Status::Failed, 'duration_ms' => 90.25, 'unpriced_span_count' => 1, 'started_at' => '2026-01-01 09:30:00']);
}

/**
 * Models of every kind the prices list tells apart: priced by config, by a saved price over config, by a
 * saved price alone, through a shorter id, and not at all, observed or not.
 */
function priceContractDataset(): void
{
    config(['trail.pricing' => [
        'anthropic' => ['claude-sonnet-4-5' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75]],
        'openai' => [
            'gpt-4o' => ['input' => 2.5, 'output' => 10.0, 'cache_read' => 1.25],
            'gpt-5' => ['input' => 1.25, 'output' => 10.0, 'cache_read' => 0.125],
        ],
    ]]);

    Rows::price(['provider' => 'openai', 'model' => 'gpt-5', 'input' => '1.000000', 'output' => '8.000000']);
    Rows::price(['provider' => 'openai', 'model' => 'gpt-5-mini', 'input' => '0.250000', 'output' => '2.000000', 'cache_read' => '0.000000']);

    $trace = Rows::trace(['id' => 'trace-prices', 'status' => Status::Completed, 'started_at' => '2026-01-02 11:00:00']);
    foreach ([['anthropic', 'claude-sonnet-4-5'], ['anthropic', 'claude-sonnet-4-5-20250929'], ['openai', 'gpt-5-2025-08-07'], ['openai', 'mystery']] as $n => [$provider, $model]) {
        Rows::span($trace, ['id' => "price-span-{$n}", 'provider' => $provider, 'model' => $model, 'started_at' => '2026-01-02 11:00:00']);
    }
}

/**
 * Agents of every kind the agents endpoints tell apart: one with runs of its own in several states
 * and a period before the range, one that is both run and delegated to, one that is only delegated
 * to (once under a tool, once under the run's own span), and an embeddings run; with the steps and
 * tools their breakdowns are made of. Twenty timed runs give the first agent a 95th percentile.
 */
function agentContractDataset(): void
{
    $one = AgentRows::run('SupportAssistant', '2026-01-02 11:00:00', [
        'id' => 'run-support-1', 'agent_class' => 'App\\Ai\\Agents\\SupportAssistant', 'duration_ms' => 1840.412, 'input_tokens' => 1200, 'output_tokens' => 310,
        'cost' => 0.00825,
    ]);
    AgentRows::run('SupportAssistant', '2026-01-02 10:00:00', [
        'id' => 'run-support-2', 'agent_class' => 'App\\Ai\\Agents\\SupportAssistant', 'status' => Status::Failed, 'issue_kind' => IssueKind::RateLimited,
        'input_tokens' => 90, 'unpriced_span_count' => 1, 'recovered' => true,
    ]);
    AgentRows::run('SupportAssistant', '2026-01-02 12:10:00', ['id' => 'run-support-3', 'agent_class' => 'App\\Ai\\Agents\\SupportAssistant', 'status' => Status::Running]);
    AgentRows::run('SupportAssistant', '2026-01-01 09:00:00', ['id' => 'run-support-before', 'duration_ms' => 700.5, 'cost' => 0.01]);

    foreach (range(1, 20) as $i) {
        AgentRows::run('SupportAssistant', '2026-01-02 08:30:00', ['id' => sprintf('run-latency-%02d', $i), 'duration_ms' => $i * 100, 'input_tokens' => 10, 'output_tokens' => 5, 'cost' => 0.001]);
    }

    $research = AgentRows::run('ResearchAgent', '2026-01-02 09:00:00', [
        'id' => 'run-research', 'agent_class' => 'App\\Ai\\Agents\\ResearchAgent', 'duration_ms' => 900.0, 'input_tokens' => 400, 'output_tokens' => 90, 'cost' => 0.004,
    ]);
    AgentRows::run('Embeddings', '2026-01-02 08:00:00', ['id' => 'run-embeddings', 'type' => SpanType::Embedding, 'provider' => 'openai', 'model' => 'text-embedding-3-small', 'duration_ms' => 210.5, 'input_tokens' => 64, 'cost' => 0.000002]);

    $span = fn (Trace $run, SpanType $type, string $name, string $started, array $attributes = []) => AgentRows::span($run, $type, $name, $started, $attributes);

    $span($one, SpanType::Agent, 'SupportAssistant', '2026-01-02 11:00:00', ['id' => 'support-root', 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5']);
    $span($one, SpanType::Step, 'step', '2026-01-02 11:00:00.100', ['id' => 'support-step-1', 'parent_id' => 'support-root', 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5', 'input_tokens' => 1200, 'output_tokens' => 310, 'cost' => 0.00825]);
    $span($one, SpanType::Step, 'step', '2026-01-02 11:00:00.900', ['id' => 'support-step-2', 'parent_id' => 'support-root', 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5', 'input_tokens' => 30]);
    $span($one, SpanType::Tool, 'search', '2026-01-02 11:00:01', ['id' => 'support-tool-1', 'parent_id' => 'support-root']);
    $span($one, SpanType::Tool, 'lookup', '2026-01-02 11:00:02', ['id' => 'support-tool-2', 'parent_id' => 'support-root', 'status' => Status::Failed]);
    $span($one, SpanType::Embedding, 'embeddings', '2026-01-02 11:00:01.050', ['id' => 'support-embedding', 'parent_id' => 'support-tool-1', 'provider' => 'openai', 'model' => 'text-embedding-3-small', 'input_tokens' => 64, 'cost' => 0.000002]);
    // A sub-agent under a tool, with a step and a tool of its own; one under the run's own span, which failed; one under a tool.
    $span($one, SpanType::Agent, 'ResearchAgent', '2026-01-02 11:00:01.100', ['id' => 'research-1', 'parent_id' => 'support-tool-1', 'agent_class' => 'App\\Ai\\Agents\\ResearchAgent', 'provider' => 'anthropic', 'model' => 'claude-haiku-4-5']);
    $span($one, SpanType::Step, 'step', '2026-01-02 11:00:01.200', ['id' => 'research-step', 'parent_id' => 'research-1', 'provider' => 'anthropic', 'model' => 'claude-haiku-4-5', 'input_tokens' => 400, 'output_tokens' => 90, 'cost' => 0.0005]);
    $span($one, SpanType::Tool, 'search', '2026-01-02 11:00:01.300', ['id' => 'research-tool', 'parent_id' => 'research-1']);
    $span($one, SpanType::Agent, 'Summarizer', '2026-01-02 11:00:02.500', ['id' => 'summarizer-1', 'parent_id' => 'run-support-1', 'status' => Status::Failed, 'agent_class' => 'App\\Ai\\Agents\\Summarizer', 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5']);
    $span($one, SpanType::Agent, 'Summarizer', '2026-01-02 11:00:02.600', ['id' => 'summarizer-2', 'parent_id' => 'support-tool-2', 'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5']);

    $span($research, SpanType::Agent, 'ResearchAgent', '2026-01-02 09:00:00', ['id' => 'research-root', 'provider' => 'anthropic', 'model' => 'claude-haiku-4-5']);
    $span($research, SpanType::Step, 'step', '2026-01-02 09:00:00.100', ['id' => 'research-own-step', 'parent_id' => 'research-root', 'provider' => 'anthropic', 'model' => 'claude-haiku-4-5', 'input_tokens' => 400, 'output_tokens' => 90, 'cost' => 0.004]);
    $span($research, SpanType::Tool, 'search', '2026-01-02 09:00:00.500', ['id' => 'research-own-tool', 'parent_id' => 'research-root', 'status' => Status::Failed]);
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

it('sends the conversations response the dashboard expects', function () {
    conversationContractDataset();

    assertContract('conversations', $this->getJson('/trail/api/conversations')->assertOk()->json());
});

it('sends the conversation transcript response the dashboard expects', function () {
    transcriptContractDataset();

    // Decoded as objects: the truncated paths of a message are an empty object when nothing was cut.
    $response = $this->getJson('/trail/api/conversations/transcript?id='.rawurlencode('support/ada 1042'))->assertOk();

    assertContract('conversation', json_decode($response->getContent(), false, flags: JSON_THROW_ON_ERROR));
});

it('sends the overview response the dashboard expects', function () {
    // Not on an edge of the clock, so the first bucket is cut and the last one is still open.
    Carbon::setTestNow('2026-01-02 12:20:00');
    overviewContractDataset();

    assertContract('overview', $this->getJson('/trail/api/overview')->assertOk()->json());
});

it('sends the needs-attention response the dashboard expects', function () {
    contractDataset();

    // A run left running past the cutoff is incomplete; the shared dataset has one of every other kind.
    Rows::trace([
        'id' => 'trace-abandoned', 'name' => 'Retired', 'status' => Status::Running, 'started_at' => '2026-01-02 05:30:00',
        'created_at' => Carbon::now()->subHours(3),
    ]);
    // A second issue kind among the failed runs, and a run that completed although a sub-agent failed.
    Rows::trace(['id' => 'trace-exception', 'name' => 'Broken', 'status' => Status::Failed, 'issue_kind' => IssueKind::Exception, 'started_at' => '2026-01-02 09:00:00']);
    Rows::trace(['id' => 'trace-child-failed', 'name' => 'Parent', 'status' => Status::Completed, 'child_failed' => true, 'started_at' => '2026-01-02 09:30:00']);

    assertContract('attention', $this->getJson('/trail/api/overview/attention')->assertOk()->json());
});

it('sends the agents response the dashboard expects', function () {
    // Not on an edge of the clock, so the first bucket is cut and the last one is still open.
    Carbon::setTestNow('2026-01-02 12:20:00');
    agentContractDataset();

    assertContract('agents', $this->getJson('/trail/api/agents')->assertOk()->json());
});

it('sends the agent response the dashboard expects', function () {
    Carbon::setTestNow('2026-01-02 12:20:00');
    agentContractDataset();

    assertContract('agent', $this->getJson('/trail/api/agents/show?name=SupportAssistant')->assertOk()->json());
});

it('sends the agent breakdown response the dashboard expects', function () {
    Carbon::setTestNow('2026-01-02 12:20:00');
    agentContractDataset();

    assertContract('agent-breakdown', $this->getJson('/trail/api/agents/breakdown?name=ResearchAgent')->assertOk()->json());
});

it('sends the bookmark response the dashboard expects', function () {
    Rows::trace(['id' => '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30', 'status' => Status::Completed, 'started_at' => '2026-01-02 11:00:00']);

    // The environment is "local", where the framework checks CSRF tokens even in tests.
    $response = $this->withSession(['_token' => 'token'])->putJson('/trail/api/traces/0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30/bookmark', [], ['X-CSRF-TOKEN' => 'token']);

    assertContract('bookmark', $response->assertOk()->json());
});

it('sends the prices response the dashboard expects', function () {
    priceContractDataset();

    assertContract('prices', $this->getJson('/trail/api/prices')->assertOk()->json());
});

it('sends the saved price response the dashboard expects', function () {
    priceContractDataset();

    // The environment is "local", where the framework checks CSRF tokens even in tests.
    $response = $this->withSession(['_token' => 'token'])->putJson(
        '/trail/api/prices?provider=anthropic&model=claude-sonnet-4-5-20250929',
        ['input' => 3.5, 'output' => 16, 'cache_read' => '0.35'],
        ['X-CSRF-TOKEN' => 'token'],
    );

    assertContract('price', $response->assertOk()->json());
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
