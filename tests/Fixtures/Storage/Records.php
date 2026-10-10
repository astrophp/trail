<?php

namespace Astro\Trail\Tests\Fixtures\Storage;

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\SpanRecord;
use Astro\Trail\Storage\TraceRecord;
use Illuminate\Support\Carbon;

class Records
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    public static function trace(array $attributes = []): TraceRecord
    {
        return new TraceRecord(...array_merge([
            'id' => 'trace-'.str()->uuid(),
            'type' => SpanType::Agent,
            'name' => 'Support agent',
            'status' => Status::Running,
            'startedAt' => Carbon::parse('2026-01-01 12:00:00'),
        ], $attributes));
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public static function span(string $traceId, array $attributes = []): SpanRecord
    {
        return new SpanRecord(...array_merge([
            'id' => 'span-'.str()->uuid(),
            'traceId' => $traceId,
            'type' => SpanType::Step,
            'name' => 'step',
            'status' => Status::Completed,
            'startedAt' => Carbon::parse('2026-01-01 12:00:00'),
        ], $attributes));
    }
}
