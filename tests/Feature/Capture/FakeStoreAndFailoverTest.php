<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\SpanRecord;
use Astro\Trail\Storage\TraceRecord;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Captured;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Laravel\Ai\Exceptions\RateLimitedException;

it('records into the fake store and touches no table once faked', function () {
    $fake = Trail::fake();
    AssistantAgent::fake(['Hello']);

    $response = (new AssistantAgent)->prompt('Hi');
    Trail::flush();

    $fake->assertRecordedCount(1)->assertRecorded(AssistantAgent::class, function (TraceRecord $trace, array $spans) use ($response) {
        expect($trace->id)->toBe($response->invocationId)
            ->and($trace->status)->toBe(Status::Completed)
            ->and($spans)->toHaveCount(2)
            ->and(array_map(fn (SpanRecord $span) => $span->sequence, $spans))->toBe([1, 2]);

        return true;
    });

    $probe = new DatabaseStoreProbe;

    expect([$probe->traceCount(), $probe->spanCount()])->toBe([0, 0]);
});

it('stores a failover as one trace whose agent span moves to the second attempt', function () {
    FakeAnthropic::script([FakeAnthropic::error(429, 'Slow down'), FakeAnthropic::text('ok')]);

    $response = (new AssistantAgent)->prompt('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']);
    Trail::flush();

    $run = Captured::read($response->invocationId);
    $spans = $run->spans();

    expect((new DatabaseStoreProbe)->traceCount())->toBe(1)
        ->and($run->trace()['status'])->toBe('completed')
        ->and($run->trace()['model'])->toBe('model-b')
        ->and(array_map(fn (array $span) => [$span['type'], $span['sequence'], $span['attempt'], $span['step_number'], $span['model']], $spans))->toBe([
            ['agent', 1, 2, null, 'model-b'],
            ['step', 2, 1, 0, 'model-a'],
            ['step', 3, 2, 0, 'model-b'],
        ])->and(Captured::pick([$spans[1]], ['status', 'issue_kind', 'error_class', 'error_source', 'error_http_status', 'input_tokens', 'cost'])[0])->toBe([
            'status' => 'failed',
            'issue_kind' => 'rate_limited',
            'error_class' => RateLimitedException::class,
            'error_source' => 'step',
            'error_http_status' => 429,
            'input_tokens' => null,
            'cost' => null,
        ])->and($spans[0]['status'])->toBe('completed')
        ->and($spans[2]['status'])->toBe('completed')
        ->and($spans[2]['output']['text'])->toBe('ok');
});
