<?php

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Http\Resources\Cost;
use Astro\Trail\Http\Resources\TraceResource;
use Astro\Trail\Http\Resources\Usage;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Astro\Trail\Tests\Fixtures\Users\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    Carbon::setTestNow('2026-01-02 12:00:00');
});

afterEach(fn () => Carbon::setTestNow());

function shown(Trace $trace): array
{
    // Read back, as the endpoint reads it: a created model lacks the defaults the database fills in.
    $trace = Trace::query()->findOrFail($trace->id);

    return TraceResource::of([$trace])->toArray($trace);
}

it('shapes a fully populated trace key for key', function () {
    $id = DB::table('users')->insertGetId(['name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);

    $trace = Rows::trace([
        'id' => '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30',
        'type' => SpanType::Agent,
        'name' => 'SupportAssistant',
        'agent_class' => 'App\\Ai\\Agents\\SupportAssistant',
        'status' => Status::Failed,
        'issue_kind' => IssueKind::RateLimited,
        'streamed' => true,
        'recovered' => true,
        'child_failed' => true,
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
        'user_id' => (string) $id,
        'user_type' => User::class,
        'started_at' => '2026-01-01 12:00:00',
        'ended_at' => '2026-01-01 12:00:01.840',
    ]);
    Rows::bookmark($trace);

    $shown = shown($trace);

    expect(array_keys($shown))->toBe([
        'id', 'type', 'name', 'agent_class', 'status', 'issue_kind', 'streamed', 'recovered', 'child_failed',
        'provider', 'model', 'duration_ms', 'usage', 'cost', 'span_count', 'prompt_excerpt', 'response_excerpt',
        'conversation_id', 'user', 'bookmarked', 'started_at', 'ended_at',
    ])->and($shown)->toBe([
        'id' => '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30',
        'type' => 'agent',
        'name' => 'SupportAssistant',
        'agent_class' => 'App\\Ai\\Agents\\SupportAssistant',
        'status' => 'failed',
        'issue_kind' => 'rate_limited',
        'streamed' => true,
        'recovered' => true,
        'child_failed' => true,
        'provider' => 'anthropic',
        'model' => 'claude-sonnet-4-5',
        'duration_ms' => 1840.412,
        'usage' => [
            'state' => 'reported',
            'input_tokens' => 1200,
            'output_tokens' => 310,
            'cache_read_tokens' => 5,
            'cache_write_tokens' => 6,
            'reasoning_tokens' => 7,
            'total_tokens' => 1510,
        ],
        'cost' => ['state' => 'estimated', 'amount' => 0.00825],
        'span_count' => 4,
        'prompt_excerpt' => 'Where is my order?',
        'response_excerpt' => 'Your order shipped on Monday.',
        'conversation_id' => 'conversation-1',
        'user' => ['id' => (string) $id, 'type' => User::class, 'name' => 'Ada', 'email' => 'ada@example.test'],
        'bookmarked' => true,
        'started_at' => '2026-01-01T12:00:00.000Z',
        'ended_at' => '2026-01-01T12:00:01.840Z',
    ]);
});

it('writes dates in UTC whatever the application timezone is', function () {
    // What the framework does at boot: the timezone of the application is the one PHP reads dates in.
    config(['app.timezone' => 'Europe/Istanbul']);
    date_default_timezone_set('Europe/Istanbul');

    try {
        $trace = Rows::trace(['started_at' => '2026-01-01 12:00:00', 'ended_at' => '2026-01-01 12:00:02.500']);

        expect(shown($trace))->toMatchArray(['started_at' => '2026-01-01T09:00:00.000Z', 'ended_at' => '2026-01-01T09:00:02.500Z']);
    } finally {
        date_default_timezone_set('UTC');
    }
});

it('answers null, not zero, for everything that was not captured', function () {
    $trace = Rows::trace(['status' => Status::Completed]);

    expect(shown($trace))->toBe([
        'id' => $trace->id,
        'type' => 'agent',
        'name' => 'Support agent',
        'agent_class' => null,
        'status' => 'completed',
        'issue_kind' => null,
        'streamed' => false,
        'recovered' => false,
        'child_failed' => false,
        'provider' => null,
        'model' => null,
        'duration_ms' => null,
        'usage' => [
            'state' => 'not_reported',
            'input_tokens' => null,
            'output_tokens' => null,
            'cache_read_tokens' => null,
            'cache_write_tokens' => null,
            'reasoning_tokens' => null,
            'total_tokens' => null,
        ],
        'cost' => ['state' => 'not_captured', 'amount' => null],
        'span_count' => 0,
        'prompt_excerpt' => null,
        'response_excerpt' => null,
        'conversation_id' => null,
        'user' => null,
        'bookmarked' => false,
        'started_at' => '2026-01-01T12:00:00.000Z',
        'ended_at' => null,
    ]);
});

it('keeps the id of a user that cannot be resolved', function () {
    $trace = Rows::trace(['user_id' => '9999', 'user_type' => User::class]);

    expect(shown($trace)['user'])->toBe(['id' => '9999', 'type' => User::class, 'name' => null, 'email' => null]);
});

it('decides the cost state in one place', function (?float $amount, int $unpriced, bool $running, string $state) {
    expect(Cost::of($amount, $unpriced, $running))->toBe(['state' => $state, 'amount' => $amount]);
})->with([
    'estimated' => [0.5, 0, false, 'estimated'],
    'a real zero' => [0.0, 0, false, 'estimated'],
    'partial' => [0.5, 1, false, 'partial'],
    'unpriced' => [null, 2, false, 'unpriced'],
    'not captured' => [null, 0, false, 'not_captured'],
    'pending without an amount' => [null, 0, true, 'pending'],
    'pending with what was recorded so far' => [0.25, 1, true, 'pending'],
]);

it('keeps an amount of zero as zero', function () {
    $trace = Rows::trace(['status' => Status::Completed, 'cost' => 0]);

    expect(shown($trace)['cost'])->toBe(['state' => 'estimated', 'amount' => 0.0]);
});

it('decides the usage state and total in one place', function (bool $running, ?int $input, ?int $output, ?int $cache, string $state, ?int $total) {
    $usage = Usage::of($running, $input, $output, $cache, null, null);

    expect($usage)->toMatchArray(['state' => $state, 'input_tokens' => $input, 'output_tokens' => $output, 'cache_read_tokens' => $cache, 'total_tokens' => $total]);
})->with([
    'reported' => [false, 10, 5, null, 'reported', 15],
    'input only, like an embedding' => [false, 10, null, null, 'reported', 10],
    'output only' => [false, null, 5, null, 'reported', 5],
    'only a cache count' => [false, null, null, 3, 'reported', null],
    'zero is reported' => [false, 0, 0, null, 'reported', 0],
    'pending' => [true, null, null, null, 'pending', null],
    'pending with counts so far' => [true, 4, null, null, 'pending', 4],
    'not reported' => [false, null, null, null, 'not_reported', null],
]);

it('shows a running run as pending, with nothing turned into zero', function () {
    $trace = Rows::trace(['status' => Status::Running]);

    $shown = shown($trace);

    expect($shown['status'])->toBe('running')
        ->and($shown['cost'])->toBe(['state' => 'pending', 'amount' => null])
        ->and($shown['usage']['state'])->toBe('pending')
        ->and($shown['usage']['total_tokens'])->toBeNull();
});

it('shows a stale running run as incomplete and abandoned, not pending', function () {
    $trace = Rows::trace(['status' => Status::Running, 'created_at' => Carbon::now()->subHours(2)]);

    $shown = shown($trace);

    expect($shown['status'])->toBe('incomplete')
        ->and($shown['issue_kind'])->toBe('abandoned')
        ->and($shown['cost'])->toBe(['state' => 'not_captured', 'amount' => null])
        ->and($shown['usage']['state'])->toBe('not_reported');
});

it('marks partial and unpriced costs from the stored unpriced count', function () {
    $partial = Rows::trace(['status' => Status::Completed, 'cost' => 0.1, 'unpriced_span_count' => 1]);
    $unpriced = Rows::trace(['status' => Status::Completed, 'input_tokens' => 10, 'unpriced_span_count' => 1]);

    expect(shown($partial)['cost'])->toBe(['state' => 'partial', 'amount' => 0.1])
        ->and(shown($unpriced)['cost'])->toBe(['state' => 'unpriced', 'amount' => null]);
});

it('looks up users and bookmarks once for a whole set', function () {
    $ada = DB::table('users')->insertGetId(['name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);
    foreach (range(1, 5) as $i) {
        Rows::trace(['user_id' => (string) $ada, 'user_type' => User::class, 'started_at' => Carbon::now()->subMinutes($i)]);
    }

    $traces = Trace::query()->orderByDesc('started_at')->get();
    Rows::bookmark($traces[1]);

    $queries = 0;
    DB::listen(function () use (&$queries) {
        $queries++;
    });

    $resource = TraceResource::of($traces);

    expect($queries)->toBe(2)
        ->and(array_column($resource->collection($traces), 'bookmarked'))->toBe([false, true, false, false, false]);
});
