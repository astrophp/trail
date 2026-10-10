<?php

namespace Astro\Trail\Storage;

/**
 * Token, cost and span totals of a trace. Only step and embedding spans
 * contribute usage; a total nobody reported stays null instead of becoming zero.
 */
final readonly class TraceTotals
{
    public function __construct(
        public ?int $inputTokens,
        public ?int $outputTokens,
        public ?int $cacheReadTokens,
        public ?int $cacheWriteTokens,
        public ?int $reasoningTokens,
        public ?float $cost,
        public int $spanCount,
        public int $unpricedSpanCount,
    ) {}

    /**
     * @param  iterable<SpanRecord>  $spans
     */
    public static function ofRecords(iterable $spans): self
    {
        $usages = [];

        foreach ($spans as $span) {
            $usages[] = SpanUsage::fromRecord($span);
        }

        return self::of($usages);
    }

    /**
     * @param  iterable<SpanUsage>  $spans
     */
    public static function of(iterable $spans): self
    {
        $input = $output = $cacheRead = $cacheWrite = $reasoning = null;
        $cost = null;
        $count = 0;
        $unpriced = 0;

        foreach ($spans as $span) {
            $count++;

            if (! $span->contributes()) {
                continue;
            }

            $input = self::add($input, $span->inputTokens);
            $output = self::add($output, $span->outputTokens);
            $cacheRead = self::add($cacheRead, $span->cacheReadTokens);
            $cacheWrite = self::add($cacheWrite, $span->cacheWriteTokens);
            $reasoning = self::add($reasoning, $span->reasoningTokens);

            if ($span->cost !== null) {
                $cost = ($cost ?? 0.0) + $span->cost;
            } elseif ($span->reportedUsage()) {
                $unpriced++;
            }
        }

        return new self(
            $input,
            $output,
            $cacheRead,
            $cacheWrite,
            $reasoning,
            $cost === null ? null : round($cost, 10),
            $count,
            $unpriced,
        );
    }

    private static function add(?int $total, ?int $value): ?int
    {
        if ($value === null) {
            return $total;
        }

        return ($total ?? 0) + $value;
    }
}
