<?php

namespace Astro\Trail\Http\Resources;

/**
 * The token counts of a run. A count nobody reported stays null; none is ever turned into zero.
 */
final class Usage
{
    /**
     * Direct evidence from a run, a billable span or an agent's own subtotal. Aggregate readers
     * keep their token-only contract until they can actually aggregate search units.
     *
     * @return array{state: string, input_tokens: ?int, output_tokens: ?int, cache_read_tokens: ?int, cache_write_tokens: ?int, reasoning_tokens: ?int, total_tokens: ?int, search_units: ?string}
     */
    public static function direct(bool $running, ?int $input, ?int $output, ?int $cacheRead, ?int $cacheWrite, ?int $reasoning, ?string $searchUnits): array
    {
        $usage = self::of($running, $input, $output, $cacheRead, $cacheWrite, $reasoning);
        if (! $running && $searchUnits !== null) {
            $usage['state'] = 'reported';
        }

        return $usage + ['search_units' => $searchUnits];
    }

    /**
     * @param  bool  $running  whether the run is still running, as the status shown says (a stale one is not)
     * @return array{state: string, input_tokens: ?int, output_tokens: ?int, cache_read_tokens: ?int, cache_write_tokens: ?int, reasoning_tokens: ?int, total_tokens: ?int}
     */
    public static function of(bool $running, ?int $input, ?int $output, ?int $cacheRead, ?int $cacheWrite, ?int $reasoning): array
    {
        $reported = $input !== null || $output !== null || $cacheRead !== null || $cacheWrite !== null || $reasoning !== null;

        return [
            'state' => match (true) {
                $running => 'pending',
                $reported => 'reported',
                default => 'not_reported',
            },
            'input_tokens' => $input,
            'output_tokens' => $output,
            'cache_read_tokens' => $cacheRead,
            'cache_write_tokens' => $cacheWrite,
            'reasoning_tokens' => $reasoning,
            'total_tokens' => $input === null && $output === null ? null : ($input ?? 0) + ($output ?? 0),
        ];
    }
}
