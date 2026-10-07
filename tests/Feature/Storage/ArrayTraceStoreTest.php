<?php

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\ArrayTraceStore;
use Astro\Trail\Tests\Fixtures\Storage\Records;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\ExpectationFailedException;

it('lists traces in the order they were first stored', function () {
    $store = new ArrayTraceStore;

    $store->store(Records::trace(['id' => 'trace-b']), []);
    $store->store(Records::trace(['id' => 'trace-a']), []);
    $store->store(Records::trace(['id' => 'trace-b', 'name' => 'Again']), []);

    expect(array_map(fn ($trace) => $trace->id, $store->traces()))->toBe(['trace-b', 'trace-a'])
        ->and($store->trace('trace-b')?->name)->toBe('Again')
        ->and($store->trace('missing'))->toBeNull();
});

it('lists spans by sequence then id, optionally for one trace', function () {
    $store = new ArrayTraceStore;

    $store->store(Records::trace(['id' => 'trace-1']), [
        Records::span('trace-1', ['id' => 'span-c', 'sequence' => 1]),
        Records::span('trace-1', ['id' => 'span-b', 'sequence' => 0]),
        Records::span('trace-1', ['id' => 'span-a', 'sequence' => 1]),
    ]);
    $store->store(Records::trace(['id' => 'trace-2']), [Records::span('trace-2', ['id' => 'span-x', 'sequence' => 0])]);

    expect(array_map(fn ($span) => $span->id, $store->spans('trace-1')))->toBe(['span-b', 'span-a', 'span-c'])
        ->and(array_map(fn ($span) => $span->id, $store->spans('trace-2')))->toBe(['span-x'])
        ->and(array_map(fn ($span) => $span->id, $store->spans()))->toBe(['span-b', 'span-x', 'span-a', 'span-c'])
        ->and($store->spans('missing'))->toBe([]);
});

it('returns empty totals for a trace that is not stored', function () {
    $totals = (new ArrayTraceStore)->totals('missing');

    expect($totals->inputTokens)->toBeNull()
        ->and($totals->cost)->toBeNull()
        ->and($totals->spanCount)->toBe(0)
        ->and($totals->unpricedSpanCount)->toBe(0);
});

it('exposes totals and times', function () {
    $store = new ArrayTraceStore;

    $this->travelTo(Carbon::parse('2026-03-01 10:00:00.123456'));
    $store->store(Records::trace(['id' => 'trace-1']), [Records::span('trace-1', ['id' => 'span-1', 'inputTokens' => 5, 'cost' => 0.5])]);

    $this->travelTo(Carbon::parse('2026-03-01 10:05:00'));
    $store->store(Records::trace(['id' => 'trace-1']), []);

    expect($store->totals('trace-1')->inputTokens)->toBe(5)
        ->and($store->totals('trace-1')->cost)->toBe(0.5)
        ->and($store->storedAt('trace-1')?->format('Y-m-d H:i:s.u'))->toBe('2026-03-01 10:00:00.123000')
        ->and($store->updatedAt('trace-1')?->format('Y-m-d H:i:s'))->toBe('2026-03-01 10:05:00')
        ->and($store->spanStoredAt('span-1')?->format('Y-m-d H:i:s'))->toBe('2026-03-01 10:00:00')
        ->and($store->spanUpdatedAt('span-1')?->format('Y-m-d H:i:s'))->toBe('2026-03-01 10:00:00')
        ->and($store->storedAt('missing'))->toBeNull()
        ->and($store->spanUpdatedAt('missing'))->toBeNull();
});

it('keeps records exactly as given', function () {
    $store = new ArrayTraceStore;
    $name = "Name \0 with a null byte and ".str_repeat('x', 400);

    $trace = Records::trace(['id' => 'trace-1', 'name' => $name, 'durationMs' => INF, 'errorHttpStatus' => 999, 'metadata' => ['a' => NAN]]);
    $span = Records::span('trace-1', ['id' => 'span-1', 'inputTokens' => -3, 'attempt' => 0, 'cost' => 1.0e9]);

    $store->store($trace, [$span]);

    expect($store->trace('trace-1'))->toBe($trace)
        ->and($store->spans('trace-1')[0])->toBe($span)
        ->and($store->totals('trace-1')->inputTokens)->toBe(-3);
});

it('rejects ids longer than 64 characters and writes nothing', function () {
    $store = new ArrayTraceStore;
    $long = str_repeat('a', 65);

    expect(fn () => $store->store(Records::trace(['id' => $long]), []))->toThrow(InvalidArgumentException::class)
        ->and(fn () => $store->start(Records::trace(['id' => $long])))->toThrow(InvalidArgumentException::class)
        ->and(fn () => $store->store(Records::trace(['id' => 'trace-1']), [Records::span('trace-1', ['id' => $long])]))->toThrow(InvalidArgumentException::class)
        ->and(fn () => $store->store(Records::trace(['id' => 'trace-1']), [Records::span('trace-1', ['parentId' => $long])]))->toThrow(InvalidArgumentException::class);

    expect($store->traces())->toBe([])
        ->and($store->spans())->toBe([]);

    $store->store(Records::trace(['id' => str_repeat('a', 64)]), []);

    expect($store->traces())->toHaveCount(1);
});

it('does not write a span that belongs to another trace under the same id', function () {
    $store = new ArrayTraceStore;

    $store->store(Records::trace(['id' => 'trace-1', 'status' => Status::Completed]), [Records::span('trace-1', ['id' => 'span-1', 'name' => 'Mine'])]);
    $store->store(Records::trace(['id' => 'trace-2']), [Records::span('trace-2', ['id' => 'span-1', 'name' => 'Theirs'])]);

    expect($store->spans('trace-1')[0]->name)->toBe('Mine')
        ->and($store->spans('trace-2'))->toBe([]);
});

it('orders spans with the same sequence by id as strings', function () {
    $store = new ArrayTraceStore;
    $store->store(Records::trace(['id' => 'trace-1']), [
        Records::span('trace-1', ['id' => '9']),
        Records::span('trace-1', ['id' => '10']),
    ]);

    expect(array_map(fn ($span) => $span->id, $store->spans('trace-1')))->toBe(['10', '9']);
});

it('rejects a span id that appears twice in one call and stores nothing', function () {
    $store = new ArrayTraceStore;

    expect(fn () => $store->store(Records::trace(['id' => 'trace-1']), [
        Records::span('trace-1', ['id' => 'span-1']),
        Records::span('trace-1', ['id' => 'span-1']),
    ]))->toThrow(InvalidArgumentException::class);

    expect($store->traces())->toBe([])->and($store->spans())->toBe([]);
});

it('matches an agent class written with a leading backslash', function () {
    $store = new ArrayTraceStore;
    $store->store(Records::trace(['id' => 'trace-1', 'agentClass' => 'App\\Agents\\SupportAgent']), []);

    $store->assertRecorded('\\App\\Agents\\SupportAgent')->assertRecordedCount(1, '\\App\\Agents\\SupportAgent');

    expect(fn () => $store->assertNotRecorded('\\App\\Agents\\SupportAgent'))->toThrow(ExpectationFailedException::class);
});

it('matches an agent span class written with a leading backslash', function () {
    $store = new ArrayTraceStore;
    $store->store(Records::trace(['id' => 'trace-1']), [
        Records::span('trace-1', ['id' => 'span-1', 'type' => SpanType::Agent, 'agentClass' => 'App\\Agents\\ResearchAgent']),
    ]);

    $store->assertSpanRecorded('\\App\\Agents\\ResearchAgent', fn ($span) => $span->id === 'span-1');

    expect(fn () => $store->assertSpanNotRecorded('\\App\\Agents\\ResearchAgent'))->toThrow(ExpectationFailedException::class);
});

it('keeps every span of a trace however large they are, as the database store does', function () {
    $store = new ArrayTraceStore;
    $spans = [];

    for ($i = 0; $i < 10; $i++) {
        $spans[] = Records::span('trace-1', ['id' => "span-{$i}", 'sequence' => $i, 'input' => ['text' => str_repeat('x', 400_000)]]);
    }

    $store->store(Records::trace(['id' => 'trace-1']), $spans);

    expect($store->spans('trace-1'))->toHaveCount(10);
});
