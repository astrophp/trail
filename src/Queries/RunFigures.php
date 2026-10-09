<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\StaleRuns;
use Illuminate\Database\Query\Builder;

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

    /**
     * Add the aggregates that fromRow() reads to a grouped read over `trail_traces`. The stale rule is
     * applied to every run before it is counted.
     *
     * @param  Builder  $query  a base query on `trail_traces`, grouped by the caller
     */
    public static function select(Builder $query): void
    {
        $running = Status::Running->value;
        $cutoff = StaleRuns::cutoffColumn();

        $query->selectRaw(self::count('status = ?').' as completed', [Status::Completed->value])
            ->selectRaw(self::count('status = ?').' as failed', [Status::Failed->value])
            ->selectRaw(self::count('status = ? or (status = ? and created_at < ?)').' as incomplete', [Status::Incomplete->value, $running, $cutoff])
            ->selectRaw(self::count('status = ? and created_at >= ?').' as running', [$running, $cutoff])
            ->selectRaw(self::count('status = ?').' as awaiting_approval', [Status::AwaitingApproval->value])
            ->selectRaw('count(duration_ms) as measured')
            ->selectRaw('sum(duration_ms) as duration_sum')
            ->selectRaw('sum(input_tokens) as input_tokens')
            ->selectRaw('sum(output_tokens) as output_tokens')
            ->selectRaw('sum(cache_read_tokens) as cache_read_tokens')
            ->selectRaw('sum(cache_write_tokens) as cache_write_tokens')
            ->selectRaw('sum(reasoning_tokens) as reasoning_tokens')
            ->selectRaw(self::count('input_tokens is not null or output_tokens is not null or cache_read_tokens is not null or cache_write_tokens is not null or reasoning_tokens is not null').' as reported')
            ->selectRaw('sum(cost) as cost_sum')
            ->selectRaw('sum(unpriced_span_count) as unpriced_spans')
            ->selectRaw(self::count('unpriced_span_count > 0').' as unpriced_runs')
            ->selectRaw(self::count('cost is null').' as without_amount');
    }

    /**
     * The sum of a condition: how many rows meet it.
     *
     * @param  literal-string  $condition
     * @return literal-string
     */
    private static function count(string $condition): string
    {
        return 'sum(case when '.$condition.' then 1 else 0 end)';
    }

    /** Decimal places of an error rate and of a money amount. */
    public const PLACES = 10;

    /**
     * Completed, failed and incomplete runs: those that are over. A run that stopped without an
     * answer is in it and is not known to have failed.
     */
    public function finished(): int
    {
        return $this->runs['completed'] + $this->runs['failed'] + $this->runs['incomplete'];
    }

    /**
     * Failed over finished, as a fraction; null, never 0, when no run is finished.
     */
    public function errorRate(): ?float
    {
        $finished = $this->finished();

        return $finished === 0 ? null : round($this->runs['failed'] / $finished, self::PLACES);
    }

    /**
     * The mean duration of the runs that have one, rounded to 3 decimals; null when none has.
     */
    public function meanDuration(): ?float
    {
        return $this->measured === 0 || $this->durationSum === null ? null : round($this->durationSum / $this->measured, 3);
    }

    /**
     * The summed cost, rounded; null when no run has one.
     */
    public function costAmount(): ?float
    {
        return $this->costSum === null ? null : round($this->costSum, self::PLACES);
    }

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
