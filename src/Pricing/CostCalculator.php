<?php

namespace Astro\Trail\Pricing;

class CostCalculator
{
    public function __construct(private readonly PriceBook $prices) {}

    /**
     * The cost in USD of one usage report, or null when it cannot be priced.
     *
     * Input tokens are the total sent, cached tokens included; cache read and
     * cache write tokens are parts of that total and are charged at their own
     * rates instead of the input rate. Reasoning tokens are already inside the
     * output tokens, so they have no argument here.
     *
     * Null means unpriced, never free: it is returned when no usage was
     * reported, when the model has no rate, and when any part that used tokens
     * has no rate. A part that used no tokens needs no rate. A rate of 0 is a
     * real rate and gives a cost of 0.0.
     */
    public function cost(
        string $provider,
        string $model,
        ?int $inputTokens,
        ?int $outputTokens,
        ?int $cacheReadTokens = null,
        ?int $cacheWriteTokens = null,
    ): ?float {
        $input = $this->reported($inputTokens);
        $output = $this->reported($outputTokens);

        if ($input === null && $output === null) {
            return null;
        }

        $rate = $this->prices->rateFor($provider, $model);

        if ($rate === null) {
            return null;
        }

        $cacheRead = $this->reported($cacheReadTokens) ?? 0;
        $cacheWrite = $this->reported($cacheWriteTokens) ?? 0;
        $uncached = max(0, ($input ?? 0) - $cacheRead - $cacheWrite);

        $total = 0.0;

        foreach ([
            [$uncached, $rate->input],
            [$output ?? 0, $rate->output],
            [$cacheRead, $rate->cacheRead],
            [$cacheWrite, $rate->cacheWrite],
        ] as [$tokens, $perMillion]) {
            if ($tokens === 0) {
                continue;
            }

            if ($perMillion === null) {
                return null;
            }

            $total += $tokens * $perMillion / 1_000_000;
        }

        return round($total, 10);
    }

    private function reported(?int $tokens): ?int
    {
        return $tokens !== null && $tokens >= 0 ? $tokens : null;
    }
}
