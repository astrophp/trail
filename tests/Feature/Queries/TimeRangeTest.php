<?php

use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

function rangeOf(array $query): TimeRange
{
    return TimeRange::fromRequest(Request::create('/', 'GET', $query));
}

beforeEach(fn () => Carbon::setTestNow('2026-01-02 12:00:00'));
afterEach(fn () => Carbon::setTestNow());

it('defaults to the last 24 hours ending now', function () {
    expect(rangeOf([])->toArray())->toBe(['preset' => '24h', 'from' => '2026-01-01T12:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z']);
});

it('reads each preset', function (string $preset, string $from) {
    expect(rangeOf(['range' => $preset])->toArray())->toBe(['preset' => $preset, 'from' => $from, 'to' => '2026-01-02T12:00:00.000Z']);
})->with([['1h', '2026-01-02T11:00:00.000Z'], ['24h', '2026-01-01T12:00:00.000Z'], ['7d', '2025-12-26T12:00:00.000Z']]);

it('reads explicit bounds with an offset', function () {
    $range = rangeOf(['from' => '2026-01-01T10:00:00+03:00', 'to' => '2026-01-01T12:30:00.5Z']);

    expect($range->toArray())->toBe(['preset' => null, 'from' => '2026-01-01T07:00:00.000Z', 'to' => '2026-01-01T12:30:00.500Z']);
});

it('reads a bound without an offset in the application timezone, and compares in it', function () {
    config(['app.timezone' => 'Europe/Istanbul']);

    $range = rangeOf(['from' => '2026-01-01 12:00:00', 'to' => '2026-01-01 13:00:00']);

    expect($range->toArray())->toMatchArray(['from' => '2026-01-01T09:00:00.000Z', 'to' => '2026-01-01T10:00:00.000Z']);

    $atFrom = Rows::trace(['started_at' => '2026-01-01 12:00:00.000']);
    $atTo = Rows::trace(['started_at' => '2026-01-01 13:00:00.000']);
    $inside = Rows::trace(['started_at' => '2026-01-01 12:59:59.999']);

    $query = Trace::query();
    $range->apply($query, 'started_at');

    expect($query->pluck('id')->all())->toEqualCanonicalizing([$atFrom->id, $inside->id])
        ->and($query->pluck('id')->all())->not->toContain($atTo->id);
});

it('applies to a query builder as well', function () {
    $trace = Rows::trace(['started_at' => '2026-01-02 11:30:00.000']);
    Rows::trace(['started_at' => '2026-01-01 11:30:00.000']);

    $query = Trace::query()->toBase();
    rangeOf(['range' => '1h'])->apply($query, 'started_at');

    expect($query->pluck('id')->all())->toBe([$trace->id]);
});

it('rejects an invalid range with a 422 keyed by the parameter', function (array $query, string $parameter) {
    try {
        rangeOf($query);
        $this->fail('Expected a validation error.');
    } catch (ValidationException $e) {
        expect(array_keys($e->errors()))->toBe([$parameter])
            ->and($e->status)->toBe(422);
    }
})->with([
    'unknown preset' => [['range' => '30d'], 'range'],
    'range with from' => [['range' => '1h', 'from' => '2026-01-01T00:00:00Z'], 'range'],
    'range with to' => [['range' => '1h', 'to' => '2026-01-01T00:00:00Z'], 'range'],
    'only from' => [['from' => '2026-01-01T00:00:00Z'], 'to'],
    'only to' => [['to' => '2026-01-01T00:00:00Z'], 'from'],
    'from after to' => [['from' => '2026-01-02T00:00:00Z', 'to' => '2026-01-01T00:00:00Z'], 'from'],
    'from equal to' => [['from' => '2026-01-01T00:00:00Z', 'to' => '2026-01-01T00:00:00Z'], 'from'],
    'garbage from' => [['from' => 'not a date', 'to' => '2026-01-01T00:00:00Z'], 'from'],
    'garbage to' => [['from' => '2026-01-01T00:00:00Z', 'to' => '31/31/2026'], 'to'],
    'absurd year' => [['from' => '2026-01-01T00:00:00Z', 'to' => '99999-01-01T00:00:00Z'], 'to'],
    'a day that does not exist' => [['from' => '2026-02-30T00:00:00Z', 'to' => '2026-03-05T00:00:00Z'], 'from'],
    'hour 24' => [['from' => '2026-01-01T00:00:00Z', 'to' => '2026-01-01T24:00:00Z'], 'to'],
    'trailing newline' => [['from' => "2026-01-01T00:00:00Z\n", 'to' => '2026-01-02T00:00:00Z'], 'from'],
    'year zero' => [['from' => '0000-01-01T00:00:00Z', 'to' => '2026-01-01T00:00:00Z'], 'from'],
    'array range' => [['range' => ['1h']], 'range'],
    'array from' => [['from' => ['2026-01-01'], 'to' => '2026-01-02T00:00:00Z'], 'from'],
    'array to' => [['from' => '2026-01-01T00:00:00Z', 'to' => ['x']], 'to'],
]);
