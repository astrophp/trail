<?php

use Astro\Trail\Capture\SpanDraft;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\ArrayTraceStore;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Storage\SearchUnits;
use Astro\Trail\Tests\Fixtures\Storage\Records;
use Astro\Trail\Tests\Fixtures\Storage\Summaries;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;

uses(RefreshDatabase::class);

it('round trips exact quantities across stores and model summaries', function (array $values, ?string $expected) {
    $trace = Records::trace(['status' => Status::Completed]);
    $spans = [];
    foreach ($values as $index => $value) {
        $spans[] = Records::span($trace->id, [
            'id' => "s-{$index}", 'searchUnits' => $value, 'provider' => 'cohere', 'model' => 'test-model',
        ]);
    }
    // Envelopes never duplicate usage.
    $spans[] = Records::span($trace->id, ['type' => SpanType::Agent, 'searchUnits' => 10]);

    $array = new ArrayTraceStore;
    $database = app(TraceStore::class);
    foreach ([$array, $database] as $store) {
        $store->store($trace, $spans);
        $store->store($trace, $spans);
    }

    expect($array->totals($trace->id)->searchUnits)->toBe($expected)
        ->and(SearchUnits::fromStorage(Trace::findOrFail($trace->id)->search_units))->toBe($expected)
        ->and(Trace::findOrFail($trace->id)->input_tokens)->toBeNull()
        ->and(Trace::findOrFail($trace->id)->output_tokens)->toBeNull()
        ->and(Summaries::models($trace->id)[0]['search_units'])->toBe($expected)
        ->and(Summaries::models($trace->id)[0]['unpriced_search_units'])->toBe($expected)
        ->and(DB::table('trail_spans')->where('trace_id', $trace->id)->count())->toBe(count($spans));

    foreach ($spans as $span) {
        expect(SearchUnits::fromStorage(Span::findOrFail($span->id)->search_units))->toBe($span->searchUnits);
    }
})->with([
    'absent' => [[null], null],
    'zero' => [[0], '0.000000'],
    'fractions' => [[0.1, 0.2], '0.300000'],
    'micro-unit' => [[0.000001], '0.000001'],
    'maximum' => [['999999999999.999999'], '999999999999.999999'],
    'carry' => [['999999.999999', '0.000001'], '1000000.000000'],
    'large carry' => [['999999999999.999998', '0.000001'], '999999999999.999999'],
    'mixed' => [[null, 0.1, null, 0.2], '0.300000'],
    'overflow' => [['999999999999.999999', '0.000001', 0.1], null],
    'BIGINT overflow' => [array_fill(0, 10, '999999999999.999999'), null],
]);

it('keeps invalid quantities unavailable and reports safe diagnostics', function () {
    Exceptions::fake();
    $trace = Records::trace();
    $spans = array_map(fn ($value) => Records::span($trace->id, ['searchUnits' => $value]), [
        -1, INF, NAN, '0.0000001', '1000000000000', 'payload-secret',
    ]);
    foreach ([new ArrayTraceStore, app(TraceStore::class)] as $store) {
        $store->store($trace, $spans);
    }
    expect(DB::table('trail_spans')->whereNotNull('search_units')->count())->toBe(0)
        ->and(Trace::findOrFail($trace->id)->search_units)->toBeNull();
    Exceptions::assertReportedCount(6);
    Exceptions::assertReported(fn (InvalidArgumentException $e) => ! str_contains($e->getMessage(), 'payload-secret'));
});

it('passes draft quantities through and preserves them during terminal protection and sweep', function () {
    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));
    $trace = Records::trace();
    $draft = new SpanDraft('span', SpanType::Step, 'step', Status::Running, Carbon::now(), traceId: $trace->id, searchUnits: 0.2);
    $array = new ArrayTraceStore;
    $database = app(TraceStore::class);
    foreach ([$array, $database] as $store) {
        $store->store($trace, [$draft->toRecord()]);
    }
    $this->travel(20)->minutes();
    foreach ([$array, $database] as $store) {
        $store->sweep(300);
        $store->store($trace, [$draft->toRecord()]);
    }
    expect($array->spans($trace->id)[0]->status)->toBe(Status::Incomplete)
        ->and($array->spans($trace->id)[0]->searchUnits)->toBe('0.200000')
        ->and($array->totals($trace->id)->searchUnits)->toBe('0.200000')
        ->and(Span::findOrFail('span')->status)->toBe(Status::Incomplete)
        ->and(SearchUnits::fromStorage(Span::findOrFail('span')->search_units))->toBe('0.200000');
});

it('keeps span inserts within the legacy SQLite parameter budget', function () {
    $bindings = [];
    DB::listen(function ($query) use (&$bindings) {
        if (preg_match('/^insert into ["`]?trail_spans/', $query->sql)) {
            $bindings[] = count($query->bindings);
        }
    });
    $trace = Records::trace();
    app(TraceStore::class)->store($trace, array_map(fn ($i) => Records::span($trace->id, ['id' => "span-{$i}", 'searchUnits' => 0.1]), range(1, 60)));
    expect($bindings)->toHaveCount(3);
    foreach ($bindings as $count) {
        expect($count)->toBeLessThanOrEqual(999);
    }
});

it('stores quantity coverage and partial costs without inventing absent quantities', function () {
    $trace = Records::trace();
    app(TraceStore::class)->store($trace, [
        Records::span($trace->id, ['provider' => 'cohere', 'model' => 'test-model', 'searchUnits' => 0, 'cost' => 0]),
        Records::span($trace->id, ['provider' => 'cohere', 'model' => 'test-model', 'searchUnits' => 0.1]),
        Records::span($trace->id, ['provider' => 'cohere', 'model' => 'test-model', 'searchUnits' => null, 'status' => Status::Incomplete]),
    ]);
    expect(Summaries::only(Summaries::models($trace->id), [
        'search_units', 'search_unit_calls', 'reported_search_unit_calls', 'unpriced_search_units', 'incomplete_calls', 'input_tokens', 'cost',
    ]))->toBe([[
        'search_units' => '0.100000', 'search_unit_calls' => 2, 'reported_search_unit_calls' => 2,
        'unpriced_search_units' => '0.100000', 'incomplete_calls' => 1, 'input_tokens' => null, 'cost' => '0.0000000000',
    ]]);
});

it('preserves exact quantity evidence when a summary savepoint fails', function () {
    Exceptions::fake();
    $broken = false;
    DB::beforeExecuting(function (string $query) use (&$broken) {
        if ($broken && preg_match('/^insert into ["`]?trail_trace_tools/', $query)) {
            throw new RuntimeException('Summary unavailable.');
        }
    });
    $trace = Records::trace();
    $store = app(TraceStore::class);
    $store->store($trace, [Records::span($trace->id, ['provider' => 'cohere', 'model' => 'test-model', 'searchUnits' => 0.1])]);
    $before = Summaries::models($trace->id);
    $broken = true;
    $store->store($trace, [Records::span($trace->id, ['provider' => 'cohere', 'model' => 'test-model', 'searchUnits' => 0.2])]);
    expect(Summaries::models($trace->id))->toBe($before)
        ->and(SearchUnits::fromStorage(Trace::findOrFail($trace->id)->search_units))->toBe('0.300000')
        ->and(DB::table('trail_spans')->where('trace_id', $trace->id)->count())->toBe(2);
    Exceptions::assertReportedCount(1);
    $broken = false;
    $store->store($trace, []);
    expect(Summaries::models($trace->id)[0]['search_units'])->toBe('0.300000');
});

it('keeps explicit incomplete evidence alongside running calls across partial and repeated sweeps', function () {
    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));
    $trace = Records::trace();
    $store = app(TraceStore::class);
    $span = fn ($id, $status) => Records::span($trace->id, ['id' => $id, 'status' => $status, 'searchUnits' => 0.1]);
    $store->store($trace, [$span('explicit', Status::Incomplete), $span('old', Status::Running)]);
    $this->travel(18)->minutes();
    $store->store($trace, [$span('new', Status::Running)]);
    $this->travel(2)->minutes();
    $store->sweep(300);
    $store->sweep(300);
    expect(Summaries::only(Summaries::models($trace->id), ['incomplete_calls', 'open_at', 'search_units']))->toBe([
        ['incomplete_calls' => 2, 'open_at' => '2026-03-01 12:18:00.000', 'search_units' => '0.300000'],
    ]);
    $this->travel(20)->minutes();
    $store->sweep(300);
    expect(Summaries::only(Summaries::models($trace->id), ['incomplete_calls', 'open_at', 'search_units']))->toBe([
        ['incomplete_calls' => 3, 'open_at' => null, 'search_units' => '0.300000'],
    ]);
});
