<?php

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\ArrayTraceStore;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\DatabaseTraceStore;
use Astro\Trail\Storage\SpanRecord;
use Astro\Trail\Storage\TraceRecord;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\ResearcherAgent;
use Astro\Trail\Tests\Fixtures\Storage\Records;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Ai\Responses\Data\ToolCall;
use PHPUnit\Framework\ExpectationFailedException;

uses(RefreshDatabase::class);

it('uses the database store by default', function () {
    expect(Trail::store())->toBeInstanceOf(DatabaseTraceStore::class)
        ->and(app(TraceStore::class))->toBeInstanceOf(DatabaseTraceStore::class);
});

it('registers the facade alias and resolves the manager through it', function () {
    $composer = json_decode((string) file_get_contents(__DIR__.'/../../composer.json'), true, 512, JSON_THROW_ON_ERROR);

    expect($composer['extra']['laravel']['aliases'] ?? null)->toBe(['Trail' => Trail::class])
        ->and(Trail::getFacadeRoot())->toBeInstanceOf(Astro\Trail\Trail::class)
        ->and(Trail::getFacadeRoot())->toBe(app(Astro\Trail\Trail::class));
});

it('swaps the bound store for an in-memory one', function () {
    $fake = Trail::fake();

    expect($fake)->toBeInstanceOf(ArrayTraceStore::class)
        ->and(Trail::store())->toBe($fake)
        ->and(app(TraceStore::class))->toBe($fake);
});

it('gives a new empty store on every fake', function () {
    $first = Trail::fake();
    $first->store(Records::trace(), []);

    $second = Trail::fake();

    expect($second)->not->toBe($first)
        ->and($second->traces())->toBe([])
        ->and(Trail::store())->toBe($second)
        ->and($first->traces())->toHaveCount(1);
});

it('runs no database queries once faked', function () {
    $queries = 0;
    DB::listen(function () use (&$queries) {
        $queries++;
    });

    Trail::fake();
    $trace = Records::trace(['id' => 'trace-1']);

    app(TraceStore::class)->start($trace);
    app(TraceStore::class)->store($trace, [Records::span('trace-1')]);
    app(TraceStore::class)->sweep(60);
    app(TraceStore::class)->prune(now());
    app(TraceStore::class)->clear();

    expect($queries)->toBe(0);
});

it('asserts what was recorded', function () {
    $fake = Trail::fake();
    $fake->store(Records::trace(['id' => 'trace-1', 'agentClass' => 'App\\Agents\\Support', 'status' => Status::Completed]), [Records::span('trace-1', ['id' => 'span-1'])]);

    expect($fake->assertRecorded('App\\Agents\\Support'))->toBe($fake)
        ->and($fake->assertNotRecorded('App\\Agents\\Other'))->toBe($fake);

    $fake->assertRecorded('App\\Agents\\Support', function (TraceRecord $trace, array $spans) {
        expect($spans)->toHaveCount(1)->and($spans[0])->toBeInstanceOf(SpanRecord::class);

        return $trace->status === Status::Completed;
    });
});

it('fails assertRecorded when no trace matches, naming the agent class', function () {
    $fake = Trail::fake();
    $fake->store(Records::trace(['agentClass' => 'App\\Agents\\Support']), []);

    expect(fn () => $fake->assertRecorded('App\\Agents\\Other'))
        ->toThrow(ExpectationFailedException::class, 'App\\Agents\\Other');
});

it('fails assertRecorded when the callback is false for every trace', function () {
    $fake = Trail::fake();
    $fake->store(Records::trace(['agentClass' => 'App\\Agents\\Support', 'status' => Status::Completed]), []);

    expect(fn () => $fake->assertRecorded('App\\Agents\\Support', fn (TraceRecord $trace) => $trace->status === Status::Failed))
        ->toThrow(ExpectationFailedException::class, 'App\\Agents\\Support');
});

it('passes assertRecorded when any trace satisfies the callback', function () {
    $fake = Trail::fake();
    $fake->store(Records::trace(['agentClass' => 'App\\Agents\\Support', 'status' => Status::Completed]), []);
    $fake->store(Records::trace(['agentClass' => 'App\\Agents\\Support', 'status' => Status::Failed]), []);

    expect($fake->assertRecorded('App\\Agents\\Support', fn (TraceRecord $trace) => $trace->status === Status::Failed))->toBe($fake);
});

it('fails assertNotRecorded when a trace was recorded, naming the agent class', function () {
    $fake = Trail::fake();
    $fake->store(Records::trace(['agentClass' => 'App\\Agents\\Support']), []);

    expect(fn () => $fake->assertNotRecorded('App\\Agents\\Support'))
        ->toThrow(ExpectationFailedException::class, 'App\\Agents\\Support');
});

it('asserts the number of recorded traces', function () {
    $fake = Trail::fake();
    $fake->store(Records::trace(['agentClass' => 'App\\Agents\\Support']), []);
    $fake->store(Records::trace(['agentClass' => 'App\\Agents\\Support']), []);
    $fake->store(Records::trace(['agentClass' => 'App\\Agents\\Other']), []);

    expect($fake->assertRecordedCount(3))->toBe($fake)
        ->and($fake->assertRecordedCount(2, 'App\\Agents\\Support'))->toBe($fake)
        ->and($fake->assertRecordedCount(0, 'App\\Agents\\Missing'))->toBe($fake)
        ->and(fn () => $fake->assertRecordedCount(2))->toThrow(ExpectationFailedException::class)
        ->and(fn () => $fake->assertRecordedCount(1, 'App\\Agents\\Support'))->toThrow(ExpectationFailedException::class, 'App\\Agents\\Support');
});

it('asserts nothing was recorded', function () {
    $fake = Trail::fake();

    expect($fake->assertNothingRecorded())->toBe($fake);

    $fake->store(Records::trace(), []);

    expect(fn () => $fake->assertNothingRecorded())->toThrow(ExpectationFailedException::class);
});

it('asserts an agent span was recorded in any trace, which is where a sub-agent is', function () {
    $fake = Trail::fake();
    $fake->store(Records::trace(['id' => 'trace-1', 'agentClass' => 'App\\Agents\\Support']), [
        Records::span('trace-1', ['id' => 'root', 'type' => SpanType::Agent, 'agentClass' => 'App\\Agents\\Support', 'sequence' => 1]),
        Records::span('trace-1', ['id' => 'child', 'type' => SpanType::Agent, 'agentClass' => 'App\\Agents\\Researcher', 'parentId' => 'tool', 'sequence' => 2, 'status' => Status::Failed]),
    ]);

    expect($fake->assertSpanRecorded('App\\Agents\\Researcher'))->toBe($fake)
        ->and($fake->assertSpanNotRecorded('App\\Agents\\Other'))->toBe($fake)
        ->and($fake->assertSpanRecorded('App\\Agents\\Support'))->toBe($fake);

    // The sub-agent is a span, so it is not a trace of its own.
    $fake->assertNotRecorded('App\\Agents\\Researcher');

    $fake->assertSpanRecorded('App\\Agents\\Researcher', function (SpanRecord $span, TraceRecord $trace) {
        expect($trace->id)->toBe('trace-1')->and($span->parentId)->toBe('tool');

        return $span->status === Status::Failed;
    });
});

it('fails assertSpanRecorded when no agent span matches, naming the agent class', function () {
    $fake = Trail::fake();
    $fake->store(Records::trace(['id' => 'trace-1']), [
        Records::span('trace-1', ['id' => 'child', 'type' => SpanType::Agent, 'agentClass' => 'App\\Agents\\Researcher']),
        Records::span('trace-1', ['id' => 'step', 'type' => SpanType::Step, 'agentClass' => 'App\\Agents\\Writer']),
    ]);

    expect(fn () => $fake->assertSpanRecorded('App\\Agents\\Other'))->toThrow(ExpectationFailedException::class, 'App\\Agents\\Other')
        // Only agent spans count.
        ->and(fn () => $fake->assertSpanRecorded('App\\Agents\\Writer'))->toThrow(ExpectationFailedException::class, 'App\\Agents\\Writer')
        ->and(fn () => $fake->assertSpanRecorded('App\\Agents\\Researcher', fn (SpanRecord $span) => $span->status === Status::Failed))
        ->toThrow(ExpectationFailedException::class, 'App\\Agents\\Researcher');
});

it('fails assertSpanNotRecorded when an agent span was recorded, naming the agent class', function () {
    $fake = Trail::fake();
    $fake->store(Records::trace(['id' => 'trace-1']), [
        Records::span('trace-1', ['id' => 'child', 'type' => SpanType::Agent, 'agentClass' => 'App\\Agents\\Researcher']),
    ]);

    expect(fn () => $fake->assertSpanNotRecorded('App\\Agents\\Researcher'))->toThrow(ExpectationFailedException::class, 'App\\Agents\\Researcher');
});

it('reaches a sub-agent recorded by a real run through the fake', function () {
    $fake = Trail::fake();

    AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
    ResearcherAgent::fake(['found it']);

    (new AssistantAgent([new ResearcherAgent]))->prompt('Hi');
    Trail::flush();

    $fake->assertRecordedCount(1)
        ->assertSpanRecorded(ResearcherAgent::class, fn (SpanRecord $span, TraceRecord $trace) => $span->status === Status::Completed && $trace->status === Status::Completed);
});
