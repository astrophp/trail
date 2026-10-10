<?php

namespace Astro\Trail\Http\Resources;

/**
 * The cost of a run and why it is what it is. Decided here and nowhere else, so the amount is
 * never mistaken for a total nobody could compute.
 */
final class Cost
{
    /**
     * @param  bool  $running  whether the run is still running, as the status shown says (a stale one is not)
     * @param  int  $unpricedCount  how many steps reported usage and could not be priced
     * @return array{state: string, amount: ?float}
     */
    public static function of(?float $amount, int $unpricedCount, bool $running): array
    {
        return ['state' => self::state($amount, $unpricedCount, $running), 'amount' => $amount];
    }

    private static function state(?float $amount, int $unpricedCount, bool $running): string
    {
        return match (true) {
            $running => 'pending',
            $amount !== null && $unpricedCount === 0 => 'estimated',
            $amount !== null => 'partial',
            $unpricedCount > 0 => 'unpriced',
            default => 'not_captured',
        };
    }
}
