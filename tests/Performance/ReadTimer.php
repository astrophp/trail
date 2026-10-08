<?php

namespace Astro\Trail\Tests\Performance;

use Closure;
use Illuminate\Database\Connection;
use Illuminate\Database\Events\QueryExecuted;

/**
 * Times a read as a whole and query by query, a number of times, and keeps what the last run
 * executed so that a plan can be read for it.
 */
final class ReadTimer
{
    /** A read whose first run takes longer than this many milliseconds is repeated at most three times. */
    private const SLOW_FIRST_RUN = 10000.0;

    private bool $capturing = false;

    /** @var list<QueryExecuted> */
    private array $captured = [];

    private bool $listening = false;

    public function __construct(private readonly int $repeats) {}

    /**
     * @return array{median: float, repeats: int, per_query: list<float>, statements: list<QueryExecuted>, result: mixed, error: ?string}
     */
    public function time(Connection $db, Closure $read): array
    {
        $this->listen($db);

        $totals = [];
        $perQuery = [];
        $statements = [];
        $result = null;
        $repeats = $this->repeats;

        for ($run = 0; $run < $repeats; $run++) {
            $this->captured = [];
            $this->capturing = true;
            $start = hrtime(true);

            try {
                $result = $read();
            } catch (\Throwable $exception) {
                $this->capturing = false;

                return ['median' => 0.0, 'repeats' => $run, 'per_query' => [], 'statements' => [], 'result' => null, 'error' => mb_substr(preg_replace('/\s+/', ' ', $exception->getMessage()) ?? '', 0, 160)];
            }

            $totals[] = (hrtime(true) - $start) / 1e6;
            $this->capturing = false;
            $statements = $this->captured;

            foreach ($statements as $index => $executed) {
                $perQuery[$index][] = (float) $executed->time;
            }

            if ($run === 0 && $totals[0] > self::SLOW_FIRST_RUN) {
                $repeats = min($repeats, 3);
            }
        }

        return [
            'median' => self::median($totals),
            'repeats' => count($totals),
            'per_query' => array_values(array_map(self::median(...), $perQuery)),
            'statements' => $statements,
            'result' => $result,
            'error' => null,
        ];
    }

    /**
     * @param  list<float>  $values
     */
    public static function median(array $values): float
    {
        sort($values);

        return $values[intdiv(count($values), 2)] ?? 0.0;
    }

    private function listen(Connection $db): void
    {
        if ($this->listening) {
            return;
        }

        $this->listening = true;
        $db->listen(function (QueryExecuted $executed) {
            if ($this->capturing) {
                $this->captured[] = $executed;
            }
        });
    }
}
