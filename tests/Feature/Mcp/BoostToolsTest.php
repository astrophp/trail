<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Mcp\Tools\TrailListTraces;
use Astro\Trail\Mcp\Tools\TrailShowConversation;
use Astro\Trail\Mcp\Tools\TrailShowTrace;
use Astro\Trail\Mcp\Tools\TrailUsageSummary;
use Astro\Trail\Tests\Fixtures\Http\UsageRows;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Laravel\Boost\Console\ExecuteToolCommand;
use Laravel\Boost\Mcp\ToolRegistry;
use Laravel\Mcp\Request;

beforeEach(fn () => Carbon::setTestNow('2026-01-02 12:00:00'));
afterEach(fn () => Carbon::setTestNow());

it('registers all Trail tools with Boost', function () {
    ToolRegistry::clearCache();

    expect(ToolRegistry::getAvailableTools())->toContain(
        TrailListTraces::class,
        TrailShowTrace::class,
        TrailShowConversation::class,
        TrailUsageSummary::class,
    );
});

it('executes a Trail tool through Boost command dispatch', function () {
    $this->app->make(Kernel::class)->registerCommand(app(ExecuteToolCommand::class));
    ob_start();

    try {
        $exit = Artisan::call('boost:execute-tool', [
            'tool' => TrailListTraces::class,
            'arguments' => base64_encode(json_encode(['limit' => 1], JSON_THROW_ON_ERROR)),
        ]);
        $output = ob_get_contents();
    } finally {
        ob_end_clean();
    }

    $result = json_decode((string) $output, true, flags: JSON_THROW_ON_ERROR);

    expect($exit)->toBe(0)
        ->and($result['isError'])->toBeFalse()
        ->and(json_decode($result['content'][0]['text'], true, flags: JSON_THROW_ON_ERROR)['traces'])->toBe([]);
});

it('lists filtered traces with a bounded result', function () {
    Rows::trace(['id' => 'older', 'status' => Status::Failed, 'started_at' => '2026-01-02 09:00:00']);
    Rows::trace(['id' => 'newer', 'status' => Status::Failed, 'started_at' => '2026-01-02 11:00:00']);
    Rows::trace(['id' => 'completed', 'status' => Status::Completed, 'started_at' => '2026-01-02 10:00:00']);

    $response = app(TrailListTraces::class)->handle(new Request(['status' => 'failed', 'limit' => 1]));
    $data = json_decode((string) $response->content(), true, flags: JSON_THROW_ON_ERROR);

    expect($response->isError())->toBeFalse()
        ->and($data['total'])->toBe(2)
        ->and(array_column($data['traces'], 'id'))->toBe(['newer'])
        ->and($data['traces'][0])->not->toHaveKeys(['prompt_excerpt', 'response_excerpt', 'user']);
});

it('shows a trace without span payloads and bounds the span list', function () {
    $trace = Rows::trace(['id' => 'run-1', 'status' => Status::Completed]);
    Rows::span($trace, ['sequence' => 1, 'input' => ['secret' => 'hidden'], 'output' => ['text' => 'private']]);
    Rows::span($trace, ['sequence' => 2]);

    $response = app(TrailShowTrace::class)->handle(new Request(['id' => 'run-1', 'span_limit' => 1]));
    $data = json_decode((string) $response->content(), true, flags: JSON_THROW_ON_ERROR);

    expect($response->isError())->toBeFalse()
        ->and($data['trace']['id'])->toBe('run-1')
        ->and($data['spans'])->toHaveCount(1)
        ->and($data['spans_truncated'])->toBeTrue()
        ->and($data['spans'][0])->not->toHaveKeys(['input', 'output', 'metadata']);
});

it('pages through conversation turns with bounded excerpts', function () {
    foreach (range(1, 3) as $number) {
        Rows::trace([
            'id' => 'turn-'.$number,
            'status' => Status::Completed,
            'conversation_id' => 'conversation-1',
            'started_at' => '2026-01-02 '.(8 + $number).':00:00',
            'prompt_excerpt' => str_repeat('p', 2100),
            'response_excerpt' => 'Answer '.$number,
        ]);
    }

    $response = app(TrailShowConversation::class)->handle(new Request(['id' => 'conversation-1', 'limit' => 2]));
    $data = json_decode((string) $response->content(), true, flags: JSON_THROW_ON_ERROR);

    expect($response->isError())->toBeFalse()
        ->and($data['conversation']['id'])->toBe('conversation-1')
        ->and($data['conversation'])->not->toHaveKeys(['users', 'prompt_excerpt'])
        ->and(array_column($data['turns'], 'id'))->toBe(['turn-2', 'turn-3'])
        ->and($data['turns'][0]['prompt_excerpt'])->toHaveLength(2000)
        ->and($data['turns'][0]['prompt_cut_by_tool'])->toBeTrue()
        ->and($data['window'])->toBe(['older' => 1, 'newer' => 0])
        ->and($data['next_before'])->toBe('turn-2');

    $older = app(TrailShowConversation::class)->handle(new Request(['id' => 'conversation-1', 'before' => $data['next_before']]));
    $olderData = json_decode((string) $older->content(), true, flags: JSON_THROW_ON_ERROR);

    expect(array_column($olderData['turns'], 'id'))->toBe(['turn-1'])
        ->and($olderData['next_before'])->toBeNull()
        ->and(app(TrailShowConversation::class)->handle(new Request(['id' => 'conversation-1', 'before' => 'missing']))->isError())->toBeTrue();
});

it('summarizes usage with a bounded breakdown and coverage', function () {
    UsageRows::run('Agent', '2026-01-02 10:00:00', [
        UsageRows::step('openai', 'gpt-5', ['inputTokens' => 10, 'outputTokens' => 5, 'cost' => 0.002]),
        UsageRows::step('anthropic', 'claude', ['inputTokens' => 4]),
    ]);

    $response = app(TrailUsageSummary::class)->handle(new Request(['by' => 'provider', 'limit' => 1]));
    $data = json_decode((string) $response->content(), true, flags: JSON_THROW_ON_ERROR);

    expect($response->isError())->toBeFalse()
        ->and($data['by'])->toBe('provider')
        ->and($data['groups'])->toHaveCount(1)
        ->and($data['pagination']['total'])->toBe(2)
        ->and($data['coverage']['steps'])->toBe(2)
        ->and($data['coverage']['unpriced_steps'])->toBe(1)
        ->and($data['summary'])->toHaveKeys(['usage', 'cost'])
        ->and(app(TrailUsageSummary::class)->handle(new Request(['by' => 'invalid']))->isError())->toBeTrue();
});

it('rejects invalid arguments and unknown trace IDs', function () {
    expect(app(TrailListTraces::class)->handle(new Request(['limit' => 0]))->isError())->toBeTrue()
        ->and(app(TrailShowTrace::class)->handle(new Request(['id' => 'missing']))->isError())->toBeTrue()
        ->and(app(TrailShowConversation::class)->handle(new Request(['limit' => 11]))->isError())->toBeTrue()
        ->and(app(TrailUsageSummary::class)->handle(new Request(['limit' => 21]))->isError())->toBeTrue();
});
