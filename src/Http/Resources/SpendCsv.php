<?php

namespace Astro\Trail\Http\Resources;

/**
 * Writes the estimated cost series and its projection as CSV from the arrays SpendResource builds.
 * A recorded bucket and a projected one are told apart by `kind` and by their columns: a projected
 * amount is never in a cost column, and a recorded one never in a projected column.
 */
final class SpendCsv extends Csv
{
    public const COLUMNS = [
        'kind', 'from', 'to', 'bucket', 'full', 'in_progress', 'runs',
        'cost_state', 'estimated_cost_usd', 'cumulative_state', 'cumulative_estimated_cost_usd',
        'projected_usd', 'projected_line_usd',
    ];

    /** The header line. */
    public static function header(): string
    {
        return self::line(self::COLUMNS);
    }

    /**
     * The line of a recorded bucket.
     *
     * @param  array<string, mixed>  $bucket  a bucket of the series as SpendResource builds it
     */
    public static function recorded(string $unit, array $bucket): string
    {
        $runs = self::object($bucket['runs'] ?? null);
        $cost = self::object($bucket['cost'] ?? null);
        $cumulative = self::object($bucket['cumulative'] ?? null);

        return self::values([
            'kind' => 'recorded',
            'from' => $bucket['from'] ?? null,
            'to' => $bucket['to'] ?? null,
            'bucket' => $unit,
            'full' => $bucket['full'] ?? null,
            'in_progress' => $bucket['in_progress'] ?? null,
            'runs' => $runs['all'] ?? null,
            'cost_state' => $cost['state'] ?? null,
            'estimated_cost_usd' => $cost['amount'] ?? null,
            'cumulative_state' => $cumulative['state'] ?? null,
            'cumulative_estimated_cost_usd' => $cumulative['amount'] ?? null,
        ]);
    }

    /**
     * The line of a projected bucket.
     *
     * @param  array<string, mixed>  $bucket  a bucket of the projection as SpendResource builds it
     */
    public static function projected(string $unit, array $bucket): string
    {
        return self::values([
            'kind' => 'projected',
            'from' => $bucket['from'] ?? null,
            'to' => $bucket['to'] ?? null,
            'bucket' => $unit,
            'projected_usd' => $bucket['amount'] ?? null,
            'projected_line_usd' => $bucket['cumulative'] ?? null,
        ]);
    }

    /**
     * @param  array<string, mixed>  $values  by column; a column left out is an empty cell
     */
    private static function values(array $values): string
    {
        return self::line(array_map(fn (string $column) => self::cell($values[$column] ?? null), self::COLUMNS));
    }
}
