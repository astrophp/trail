<?php

namespace Astro\Trail\Http\Resources;

/**
 * Writes the rows of the usage breakdown as CSV from the arrays UsageResource builds, so a row in a
 * file says what the breakdown says. A value that was not captured is an empty cell, never a zero.
 */
final class UsageCsv extends Csv
{
    /** @var array<string, list<string>> view => the columns that name a row */
    private const KEYS = [
        'model' => ['provider', 'model'],
        'provider' => ['provider'],
        'agent' => ['agent'],
    ];

    private const FIGURES = [
        'runs', 'steps', 'usage_state',
        'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'total_tokens',
        'cost_state', 'estimated_cost_usd', 'reported_steps', 'unpriced_steps', 'unpriced_tokens',
    ];

    /**
     * @return list<string>
     */
    public static function columns(string $by): array
    {
        return [...(self::KEYS[$by] ?? self::KEYS['model']), ...self::FIGURES];
    }

    /** The header line of a view. */
    public static function header(string $by): string
    {
        return self::line(self::columns($by));
    }

    /**
     * The line of one row.
     *
     * @param  array<string, mixed>  $row  a row as UsageResource::rows() returns it
     */
    public static function row(string $by, array $row): string
    {
        $usage = self::object($row['usage'] ?? null);
        $cost = self::object($row['cost'] ?? null);
        $coverage = self::object($row['coverage'] ?? null);

        $values = [
            'provider' => $row['provider'] ?? null,
            'model' => $row['model'] ?? null,
            'agent' => $row['agent'] ?? null,
            'runs' => $row['runs'] ?? null,
            'steps' => $row['steps'] ?? null,
            'usage_state' => $usage['state'] ?? null,
            'input_tokens' => $usage['input_tokens'] ?? null,
            'output_tokens' => $usage['output_tokens'] ?? null,
            'cache_read_tokens' => $usage['cache_read_tokens'] ?? null,
            'cache_write_tokens' => $usage['cache_write_tokens'] ?? null,
            'reasoning_tokens' => $usage['reasoning_tokens'] ?? null,
            'total_tokens' => $usage['total_tokens'] ?? null,
            'cost_state' => $cost['state'] ?? null,
            'estimated_cost_usd' => $cost['amount'] ?? null,
            'reported_steps' => $coverage['reported_steps'] ?? null,
            'unpriced_steps' => $coverage['unpriced_steps'] ?? null,
            'unpriced_tokens' => $coverage['unpriced_tokens'] ?? null,
        ];

        return self::line(array_map(fn (string $column) => self::cell($values[$column]), self::columns($by)));
    }
}
