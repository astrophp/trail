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

        return ! is_finite($total) || $total >= 100_000_000 ? null : round($total, 10);
    }

    /** @return array{basis: ?string, cost: ?float} */
    public function reranking(string $provider, string $model, ?int $inputTokens, ?string $searchUnits): array
    {
        $rate = $this->prices->resolveReranking($provider, $model)->rate;
        if ($rate === null) {
            return ['basis' => null, 'cost' => null];
        }
        $basis = $rate->rerankingBasis;
        $quantity = match ($basis) {
            'input_tokens' => $this->reported($inputTokens),
            'search_units' => $searchUnits === null ? null : (float) $searchUnits,
            default => null,
        };
        $unitRate = $basis === 'input_tokens' ? $rate->rerankingInput : $rate->rerankingSearchUnit;
        $cost = $quantity === null || $unitRate === null ? null : $quantity * $unitRate / ($basis === 'input_tokens' ? 1_000_000 : 1);

        return ['basis' => $basis, 'cost' => $cost === null || ! is_finite($cost) || $cost >= 100_000_000 ? null : round($cost, 10)];
    }

    private function reported(?int $tokens): ?int
    {
        return $tokens !== null && $tokens >= 0 ? $tokens : null;
    }
}
