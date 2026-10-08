<?php

namespace Astro\Trail\Queries;

/**
 * What a set of runs adds up to: counts by the status the API shows, the durations, tokens and
 * cost that were recorded, and how many runs recorded none. A sum no run contributed to is null.
 */
final readonly class RunFigures
{
    /**
     * @param  array{all: int, completed: int, failed: int, incomplete: int, running: int, awaiting_approval: int}  $runs
     * @param  int  $measured  runs that have a duration
     * @param  ?float  $durationSum  milliseconds, over the measured runs
     * @param  array{input: ?int, output: ?int, cache_read: ?int, cache_write: ?int, reasoning: ?int}  $tokens
     * @param  int  $reported  runs with at least one token count
     * @param  int  $unpricedSpans  steps that reported usage and could not be priced
     * @param  int  $unpricedRuns  runs with at least one such step
     * @param  int  $withoutAmount  runs whose cost is null
     */
    public function __construct(
        public array $runs,
        public int $measured,
        public ?float $durationSum,
        public array $tokens,
        public int $reported,
        public ?float $costSum,
        public int $unpricedSpans,
        public int $unpricedRuns,
        public int $withoutAmount,
    ) {}

    public static function empty(): self
    {
        return self::sum([]);
    }

    /**
     * The figures of a row of the grouped read; none for a slot without runs.
     */
    public static function fromRow(?object $row): self
    {
        $int = fn (string $name): int => is_numeric($value = $row->{$name} ?? null) ? (int) $value : 0;
        $sum = fn (string $name): ?int => is_numeric($value = $row->{$name} ?? null) ? (int) $value : null;
        $float = fn (string $name): ?float => is_numeric($value = $row->{$name} ?? null) ? (float) $value : null;

        $runs = [
            'completed' => $int('completed'),
            'failed' => $int('failed'),
            'incomplete' => $int('incomplete'),
            'running' => $int('running'),
            'awaiting_approval' => $int('awaiting_approval'),
        ];

        return new self(
            runs: ['all' => array_sum($runs)] + $runs,
            measured: $int('measured'),
            durationSum: $float('duration_sum'),
            tokens: [
                'input' => $sum('input_tokens'),
                'output' => $sum('output_tokens'),
                'cache_read' => $sum('cache_read_tokens'),
                'cache_write' => $sum('cache_write_tokens'),
                'reasoning' => $sum('reasoning_tokens'),
            ],
            reported: $int('reported'),
            costSum: $float('cost_sum'),
            unpricedSpans: $int('unpriced_spans'),
            unpricedRuns: $int('unpriced_runs'),
            withoutAmount: $int('without_amount'),
        );
    }

    /**
     * @param  list<self>  $parts
     */
    public static function sum(array $parts): self
    {
        $runs = ['all' => 0, 'completed' => 0, 'failed' => 0, 'incomplete' => 0, 'running' => 0, 'awaiting_approval' => 0];
        $tokens = ['input' => null, 'output' => null, 'cache_read' => null, 'cache_write' => null, 'reasoning' => null];
        $measured = $reported = $unpricedSpans = $unpricedRuns = $withoutAmount = 0;
        $durationSum = $costSum = null;

        foreach ($parts as $part) {
            foreach ($runs as $status => $count) {
                $runs[$status] = $count + $part->runs[$status];
            }

            foreach ($tokens as $kind => $total) {
                $tokens[$kind] = $part->tokens[$kind] === null ? $total : ($total ?? 0) + $part->tokens[$kind];
            }

            $measured += $part->measured;
            $reported += $part->reported;
            $unpricedSpans += $part->unpricedSpans;
            $unpricedRuns += $part->unpricedRuns;
            $withoutAmount += $part->withoutAmount;
            $durationSum = $part->durationSum === null ? $durationSum : ($durationSum ?? 0.0) + $part->durationSum;
            $costSum = $part->costSum === null ? $costSum : ($costSum ?? 0.0) + $part->costSum;
        }

        return new self($runs, $measured, $durationSum, $tokens, $reported, $costSum, $unpricedSpans, $unpricedRuns, $withoutAmount);
    }
}
