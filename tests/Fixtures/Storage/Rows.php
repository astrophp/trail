<?php

namespace Astro\Trail\Tests\Fixtures\Storage;

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Bookmark;
use Astro\Trail\Storage\Models\Price;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

class Rows
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    public static function trace(array $attributes = []): Trace
    {
        return Trace::create(array_merge([
            'id' => 'trace-'.str()->uuid(),
            'type' => SpanType::Agent,
            'name' => 'Support agent',
            'status' => Status::Running,
            'started_at' => Carbon::parse('2026-01-01 12:00:00'),
        ], $attributes));
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public static function span(Trace $trace, array $attributes = []): Span
    {
        return Span::create(array_merge([
            'id' => 'span-'.str()->uuid(),
            'trace_id' => $trace->id,
            'type' => SpanType::Step,
            'name' => 'step',
            'status' => Status::Running,
            'started_at' => Carbon::parse('2026-01-01 12:00:00'),
        ], $attributes));
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public static function price(array $attributes = []): Price
    {
        return Price::create(array_merge([
            'provider' => 'openai',
            'model' => 'model-'.str()->uuid(),
        ], $attributes));
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public static function bookmark(Trace $trace, array $attributes = []): Bookmark
    {
        return Bookmark::create(array_merge(['trace_id' => $trace->id], $attributes));
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function columnsOf(string $table): array
    {
        $columns = [];

        foreach (Schema::getColumns($table) as $column) {
            $columns[$column['name']] = $column;
        }

        return $columns;
    }

    /**
     * @return list<list<string>>
     */
    public static function indexColumnsOf(string $table): array
    {
        return array_map(fn (array $index) => $index['columns'], Schema::getIndexes($table));
    }
}
