<?php

namespace Astro\Trail\Tests\Fixtures\Storage;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use stdClass;

/**
 * The per-run summary rows as stored, read with the query builder and given one form on every
 * driver: whole numbers as integers, booleans as booleans, a cost as a string of ten decimals and a
 * moment with its milliseconds.
 */
final class Summaries
{
    private const INTEGERS = ['steps', 'reported_steps', 'unpriced_steps', 'unpriced_tokens', 'input_tokens', 'uncached_input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'calls', 'failed'];

    /**
     * The model rows of a run, by provider and model (a missing one first).
     *
     * @return list<array<string, mixed>>
     */
    public static function models(string $traceId): array
    {
        $rows = self::table('trail_trace_models')->where('trace_id', $traceId)->get()
            ->map(fn (stdClass $row) => self::normalise($row))->all();

        usort($rows, fn (array $a, array $b) => [$a['provider'] ?? '', $a['model'] ?? ''] <=> [$b['provider'] ?? '', $b['model'] ?? '']);

        return $rows;
    }

    /**
     * The tool rows of a run, by name.
     *
     * @return list<array<string, mixed>>
     */
    public static function tools(string $traceId): array
    {
        $rows = self::table('trail_trace_tools')->where('trace_id', $traceId)->get()
            ->map(fn (stdClass $row) => self::normalise($row))->all();

        usort($rows, fn (array $a, array $b) => $a['name'] <=> $b['name']);

        return $rows;
    }

    /**
     * Only the given columns of each row, in the order given.
     *
     * @param  list<array<string, mixed>>  $rows
     * @param  list<string>  $columns
     * @return list<array<string, mixed>>
     */
    public static function only(array $rows, array $columns): array
    {
        return array_map(fn (array $row) => array_replace(array_fill_keys($columns, null), array_intersect_key($row, array_flip($columns))), $rows);
    }

    public static function table(string $name): Builder
    {
        $connection = config('trail.storage.connection');

        return DB::connection(is_string($connection) ? $connection : null)->table($name);
    }

    /**
     * @return array<string, mixed>
     */
    private static function normalise(stdClass $row): array
    {
        $values = [];

        foreach (get_object_vars($row) as $column => $value) {
            $values[$column] = match (true) {
                $column === 'id' => $value,
                $value === null => null,
                $column === 'provider_first' => (bool) $value,
                in_array($column, self::INTEGERS, true) => (int) (is_numeric($value) ? $value : 0),
                $column === 'cost' => self::decimal($value),
                $column === 'open_at' || $column === 'started_at' => self::moment($value),
                default => $value,
            };
        }

        unset($values['id']);

        return $values;
    }

    public static function decimal(mixed $value): string
    {
        // SQLite hands a decimal back as a float; the others as the exact string.
        return is_float($value) || is_int($value) ? number_format((float) $value, 10, '.', '') : bcadd(is_numeric($value) ? (string) $value : '0', '0', 10);
    }

    private static function moment(mixed $value): string
    {
        $text = is_string($value) ? $value : '';

        return str_contains($text, '.') ? str_pad($text, 23, '0') : $text.'.000';
    }
}
