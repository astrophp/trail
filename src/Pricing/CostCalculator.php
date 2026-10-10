<?php

namespace Astro\Trail\Pricing;

class CostCalculator
{
    public function __construct(private PriceBook $prices) {}

    /**
     * From now on price from `trail.pricing` alone, with no query for saved prices. Only this
     * calculator changes: the price book it was given stays as it is for everything else.
     */
    public function useConfigOnlyPrices(): void
    {
        $this->prices = $this->prices->configOnly();
    }

    /**
     * The cost in USD of one usage report, or null when it cannot be priced.
     *
     * Input tokens are the total sent, cached tokens included; cache read and
     * cache write tokens are parts of that total and are charged at their own
     * rates instead of the input rate. Reasoning tokens are already inside the
     * output tokens, so they have no argument here. Unreported cache counts
     * are taken as 0.
     *
     * Null means unpriced, never free. It is returned when the input count is
     * missing, when the model has no rate, when the model charges for output
     * and the output count is missing, and when any part that used tokens has
     * no rate. A part that used no tokens needs no rate, and a model with no
     * output rate (an embedding model) is priced from its input alone. A rate
     * of 0 is a real rate and gives a cost of 0.0.
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

        if ($input === null) {
            return null;
        }

        $rate = $this->prices->rateFor($provider, $model);

        if ($rate === null) {
            return null;
        }

        if ($output === null && $rate->output !== null) {
            return null;
        }

        $cacheRead = $this->reported($cacheReadTokens) ?? 0;
        $cacheWrite = $this->reported($cacheWriteTokens) ?? 0;
        $uncached = max(0, $input - $cacheRead - $cacheWrite);

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
