<?php

namespace Astro\Trail\Tests\Performance;

use Illuminate\Database\Connection;

/**
 * What a flush would do to keep the per-run summaries (`trail_trace_models` and `trail_trace_tools`)
 * current, as a prototype that issues the same statements: inside one transaction, the read of the
 * run's spans that `writeTotals` already makes (here widened with the columns the summaries need),
 * the grouping in PHP, then for each summary a delete of the run's rows and one multi-row insert, or
 * one upsert. It is not part of the package.
 *
 * The modes are `baseline` (the statements `writeTotals` issues today: the read and the update of the
 * run's totals), `delete-insert` and `upsert`.
 */
final class SummaryWriter
{
    private const BASE_COLUMNS = ['type', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'cost'];

    private const WIDE_COLUMNS = ['type', 'name', 'provider', 'model', 'status', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'cost'];

    public function __construct(private readonly Connection $db) {}

    /**
     * Write the totals of a run and, unless the mode is the baseline, its summaries.
     */
    public function flush(string $traceId, string $runName, string $startedAt, string $mode): void
    {
        $this->db->transaction(function () use ($traceId, $runName, $startedAt, $mode) {
            $rows = $this->db->table('trail_spans')->where('trace_id', $traceId)
                ->get($mode === 'baseline' ? self::BASE_COLUMNS : self::WIDE_COLUMNS);

            $totals = array_fill_keys(UsageReads::TOKENS, null);
            $totals['cost'] = null;
            $models = [];
            $tools = [];

            foreach ($rows as $row) {
                $bills = in_array($row->type, UsageReads::BILLING, true);

                if ($bills) {
                    foreach (UsageReads::TOKENS as $token) {
                        $totals[$token] = self::add($totals[$token], $row->{$token}, 0);
                    }

                    $totals['cost'] = self::add($totals['cost'], $row->cost);
                }

                if ($mode === 'baseline') {
                    continue;
                }

                if ($row->type === 'tool') {
                    $tool = &$tools[(string) $row->name];
                    $tool ??= ['trace_id' => $traceId, 'name' => (string) $row->name, 'started_at' => $startedAt, 'run_name' => $runName, 'calls' => 0, 'failed' => 0];
                    $tool['calls']++;
                    $tool['failed'] += $row->status === 'failed' ? 1 : 0;
                    unset($tool);
                }

                if ($row->provider === null || $row->model === null) {
                    continue;
                }

                $model = &$models[$row->provider."\0".$row->model];
                $model ??= ['trace_id' => $traceId, 'provider' => (string) $row->provider, 'model' => (string) $row->model, 'started_at' => $startedAt, 'name' => $runName, 'steps' => 0, 'unpriced_steps' => 0, 'running_steps' => 0, ...array_fill_keys(UsageReads::TOKENS, null), 'cost' => null];

                if ($bills) {
                    $model['steps']++;
                    $reported = array_filter(UsageReads::TOKENS, fn (string $token) => $row->{$token} !== null) !== [];
                    $model['unpriced_steps'] += $row->cost === null && $reported ? 1 : 0;
                    $model['running_steps'] += $row->status === 'running' ? 1 : 0;

                    foreach (UsageReads::TOKENS as $token) {
                        $model[$token] = self::add($model[$token], $row->{$token}, 0);
                    }

                    $model['cost'] = self::add($model['cost'], $row->cost);
                }

                unset($model);
            }

            $this->db->table('trail_traces')->where('id', $traceId)->update([...$totals, 'span_count' => count($rows), 'updated_at' => $startedAt]);

            if ($mode !== 'baseline') {
                $this->write('trail_trace_models', ['trace_id', 'provider', 'model'], array_values($models), $traceId, $mode);
                $this->write('trail_trace_tools', ['trace_id', 'name'], array_values($tools), $traceId, $mode);
            }
        });
    }

    /**
     * @param  list<string>  $unique
     * @param  list<array<string, mixed>>  $rows
     */
    private function write(string $table, array $unique, array $rows, string $traceId, string $mode): void
    {
        if ($mode === 'upsert') {
            if ($rows !== []) {
                $this->db->table($table)->upsert($rows, $unique, array_values(array_diff(array_keys($rows[0]), $unique)));
            }

            return;
        }

        $this->db->table($table)->where('trace_id', $traceId)->delete();

        if ($rows !== []) {
            $this->db->table($table)->insert($rows);
        }
    }

    /**
     * A sum in which a missing value adds nothing and a sum of only missing values stays missing.
     */
    private static function add(mixed $sum, mixed $value, int $scale = 10): int|string|null
    {
        if ($value === null) {
            return is_int($sum) || is_string($sum) ? $sum : null;
        }

        return bcadd((string) ($sum ?? '0'), (string) $value, $scale);
    }

    /**
     * The spans of a bench run: a root agent span, steps over the first $models models (at least
     * three steps) and two tool calls with different names.
     *
     * @param  array<string, mixed>  $template  a row of SpanFixture, for the columns every row carries
     * @return list<array<string, mixed>>
     */
    public static function benchSpans(string $traceId, int $models, int $startedAt, array $template, int $seed): array
    {
        $names = array_keys(SpanFixture::MODELS);
        $tools = array_keys(SpanFixture::TOOLS);
        $blank = array_fill_keys(array_keys($template), null) + ['attempt' => 1, 'redacted' => 0, 'truncated' => 0];
        $moment = fn (int $ms): string => gmdate('Y-m-d H:i:s', intdiv($ms, 1000)).sprintf('.%03d', $ms % 1000);
        $row = fn (string $id, string $type, string $name, int $offset): array => [...$blank,
            'id' => $traceId.'-'.$id, 'trace_id' => $traceId, 'type' => $type, 'name' => $name, 'status' => 'completed', 'sequence' => $offset,
            'started_at' => $moment($startedAt + $offset), 'ended_at' => $moment($startedAt + $offset + 100), 'duration_ms' => 100.0,
            'created_at' => $moment($startedAt + $offset), 'updated_at' => $moment($startedAt + $offset),
        ];

        $spans = [$row('a', 'agent', 'BenchAgent', 0)];

        for ($step = 0; $step < max($models, 3); $step++) {
            $model = $names[$step % $models];
            $spans[] = [...$row("s{$step}", 'step', 'step', 10 + $step), 'step_number' => $step, 'provider' => SpanFixture::MODELS[$model][0], 'model' => $model,
                'input_tokens' => 1000 + $step, 'output_tokens' => 200, 'cache_read_tokens' => 50, 'cache_write_tokens' => 0, 'reasoning_tokens' => 10,
                'cost' => $step % 5 === 4 ? null : sprintf('%.10f', 0.0123456789 + $step / 1000)];
        }

        foreach ([0, 1] as $tool) {
            $spans[] = [...$row("t{$tool}", 'tool', $tools[($seed + $tool) % 5], 30 + $tool), 'status' => $tool === 1 && $seed % 20 === 0 ? 'failed' : 'completed'];
        }

        return $spans;
    }
}
