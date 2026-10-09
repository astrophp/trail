<?php

namespace Astro\Trail\Storage;

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Contracts\TraceStore;
use DateTimeInterface;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\ConnectionResolverInterface;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use InvalidArgumentException;

class DatabaseTraceStore implements TraceStore
{
    private const JSON_FLAGS = JSON_UNESCAPED_UNICODE
        | JSON_UNESCAPED_SLASHES
        | JSON_PRESERVE_ZERO_FRACTION
        | JSON_INVALID_UTF8_SUBSTITUTE
        | JSON_PARTIAL_OUTPUT_ON_ERROR;

    private const MAX_ID_LENGTH = 64;

    private const MAX_STRING_LENGTH = 255;

    // The bytes of span rows one insert statement may carry before another is started.
    private const SPAN_INSERT_BYTES = 1_048_576;

    // Keeps one insert under SQLite's old limit of 999 bound parameters.
    private const SPAN_INSERT_CHUNK = 25;

    private const SPAN_LOOKUP_CHUNK = 500;

    private const MAX_EXCERPT_LENGTH = 10000;

    private const PRUNE_CHUNK = 500;

    public function __construct(
        private readonly ConnectionResolverInterface $resolver,
        private readonly ?string $connection = null,
    ) {}

    public function start(TraceRecord $trace): void
    {
        $this->assertId($trace->id);

        $db = $this->db();

        try {
            if ($db->transactionLevel() === 0) {
                // A single insert needs no transaction of its own: that would cost a round trip each way.
                $this->insertTrace($db, $trace);
            } else {
                // Inside the application's transaction this is a savepoint, so a duplicate does not poison it.
                $db->transaction(fn () => $this->insertTrace($db, $trace), 3);
            }
        } catch (UniqueConstraintViolationException) {
            // Already stored by an earlier or concurrent write; never overwritten here.
        }
    }

    public function store(TraceRecord $trace, array $spans): void
    {
        $this->assertId($trace->id);

        foreach ($spans as $span) {
            if ($span->traceId !== $trace->id) {
                throw new InvalidArgumentException("Span [{$span->id}] belongs to trace [{$span->traceId}], not [{$trace->id}].");
            }

            $this->assertId($span->id);

            if ($span->parentId !== null) {
                $this->assertId($span->parentId);
            }
        }

        $db = $this->db();

        $db->transaction(function () use ($db, $trace, $spans) {
            $stored = $this->lockedStatus($db, $trace->id);

            if ($stored === null) {
                try {
                    // A savepoint, so losing a race to another first writer leaves the outer transaction usable.
                    $db->transaction(fn () => $this->insertTrace($db, $trace));
                } catch (UniqueConstraintViolationException) {
                    $stored = $this->lockedStatus($db, $trace->id);
                }
            }

            if ($stored !== null && ! ($this->isFinal($stored) && $trace->status === Status::Running)) {
                $update = $db->table('trail_traces')->where('id', $trace->id);

                if ($trace->status === Status::Running) {
                    $update->where('status', Status::Running->value);
                }

                $update->update($this->traceColumns($trace));
            }

            $this->storeSpans($db, $trace->id, $spans);
            $this->writeTotals($db, $trace->id);
            $this->writeSummaries($db, $trace->id);
        }, 3);
    }

    public function sweep(int $olderThanSeconds): int
    {
        $cutoff = StaleRuns::cutoffColumn($olderThanSeconds);
        $now = $this->now();
        $db = $this->db();

        return $db->transaction(function () use ($db, $cutoff, $now) {
            $changes = [
                'status' => Status::Incomplete->value,
                'issue_kind' => IssueKind::Abandoned->value,
                'updated_at' => $now,
            ];

            $traces = $db->table('trail_traces')
                ->where('status', Status::Running->value)
                ->where('created_at', '<', $cutoff)
                ->update($changes);

            $db->table('trail_spans')
                ->where('status', Status::Running->value)
                ->where('created_at', '<', $cutoff)
                ->update($changes);

            // A step swept as incomplete is no longer open, whatever age the sweep was run with.
            $db->table('trail_trace_models')
                ->where('open_at', '<', $cutoff)
                ->update(['open_at' => null]);

            return $traces;
        }, 3);
    }

    public function prune(DateTimeInterface $before): int
    {
        $cutoff = $this->format($before);
        $db = $this->db();
        $deleted = 0;

        while (true) {
            $ids = $db->table('trail_traces')
                ->where('created_at', '<', $cutoff)
                ->limit(self::PRUNE_CHUNK)
                ->pluck('id')
                ->all();

            if ($ids === []) {
                return $deleted;
            }

            $deleted += $db->transaction(function () use ($db, $ids) {
                $db->table('trail_spans')->whereIn('trace_id', $ids)->delete();
                $db->table('trail_trace_models')->whereIn('trace_id', $ids)->delete();
                $db->table('trail_trace_tools')->whereIn('trace_id', $ids)->delete();
                $db->table('trail_bookmarks')->whereIn('trace_id', $ids)->delete();

                return $db->table('trail_traces')->whereIn('id', $ids)->delete();
            });
        }
    }

    public function clear(): void
    {
        $db = $this->db();

        $db->transaction(function () use ($db) {
            $db->table('trail_spans')->delete();
            $db->table('trail_trace_models')->delete();
            $db->table('trail_trace_tools')->delete();
            $db->table('trail_bookmarks')->delete();
            $db->table('trail_traces')->delete();
        });
    }

    private function db(): ConnectionInterface
    {
        return $this->resolver->connection($this->connection);
    }

    private function lockedStatus(ConnectionInterface $db, string $id): mixed
    {
        return $db->table('trail_traces')->where('id', $id)->lockForUpdate()->value('status');
    }

    private function insertTrace(ConnectionInterface $db, TraceRecord $trace): void
    {
        $now = $this->now();

        $db->table('trail_traces')->insert($this->traceColumns($trace) + [
            'input_tokens' => null,
            'output_tokens' => null,
            'cache_read_tokens' => null,
            'cache_write_tokens' => null,
            'reasoning_tokens' => null,
            'cost' => null,
            'span_count' => 0,
            'unpriced_span_count' => 0,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    /**
     * @param  list<SpanRecord>  $spans
     */
    private function storeSpans(ConnectionInterface $db, string $traceId, array $spans): void
    {
        if ($spans === []) {
            return;
        }

        $existing = [];

        foreach (array_chunk(array_map(fn (SpanRecord $span) => $span->id, $spans), self::SPAN_LOOKUP_CHUNK) as $ids) {
            foreach ($db->table('trail_spans')->whereIn('id', $ids)->pluck('status', 'id') as $id => $status) {
                $existing[(string) $id] = $status;
            }
        }

        $now = $this->now();
        $new = [];

        foreach ($spans as $span) {
            if (! array_key_exists($span->id, $existing)) {
                $new[] = $this->spanColumns($span) + ['created_at' => $now, 'updated_at' => $now];

                continue;
            }

            if ($this->isFinal($existing[$span->id]) && $span->status === Status::Running) {
                continue;
            }

            $update = $db->table('trail_spans')->where('id', $span->id)->where('trace_id', $traceId);

            if ($span->status === Status::Running) {
                $update->where('status', Status::Running->value);
            }

            $update->update(array_diff_key($this->spanColumns($span), ['id' => true, 'trace_id' => true]) + ['updated_at' => $now]);
        }

        foreach ($this->insertChunks($new) as $rows) {
            $db->table('trail_spans')->insert($rows);
        }
    }

    /**
     * Rows grouped into statements by count and by size, so that no statement approaches the packet
     * limit of a server (16 MB by default on MariaDB). A single row larger than the budget goes alone.
     *
     * @param  list<array<string, mixed>>  $rows
     * @return list<list<array<string, mixed>>>
     */
    private function insertChunks(array $rows): array
    {
        $chunks = [];
        $chunk = [];
        $bytes = 0;

        foreach ($rows as $row) {
            $size = 0;

            foreach ($row as $value) {
                $size += is_string($value) ? strlen($value) : 16;
            }

            if ($chunk !== [] && (count($chunk) >= self::SPAN_INSERT_CHUNK || $bytes + $size > self::SPAN_INSERT_BYTES)) {
                $chunks[] = $chunk;
                $chunk = [];
                $bytes = 0;
            }

            $chunk[] = $row;
            $bytes += $size;
        }

        if ($chunk !== []) {
            $chunks[] = $chunk;
        }

        return $chunks;
    }

    private function writeTotals(ConnectionInterface $db, string $traceId): void
    {
        $usages = [];

        foreach ($db->table('trail_spans')->where('trace_id', $traceId)->get([
            'type', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'cost',
        ]) as $row) {
            $type = SpanType::tryFrom($this->asString($row->type));

            if ($type === null) {
                continue;
            }

            $usages[] = new SpanUsage(
                $type,
                $this->asInt($row->input_tokens),
                $this->asInt($row->output_tokens),
                $this->asInt($row->cache_read_tokens),
                $this->asInt($row->cache_write_tokens),
                $this->asInt($row->reasoning_tokens),
                $this->asFloat($row->cost),
            );
        }

        $totals = TraceTotals::of($usages);

        $db->table('trail_traces')->where('id', $traceId)->update([
            'input_tokens' => $totals->inputTokens,
            'output_tokens' => $totals->outputTokens,
            'cache_read_tokens' => $totals->cacheReadTokens,
            'cache_write_tokens' => $totals->cacheWriteTokens,
            'reasoning_tokens' => $totals->reasoningTokens,
            'cost' => $this->decimal($totals->cost),
            'span_count' => $totals->spanCount,
            'unpriced_span_count' => $totals->unpricedSpanCount,
            'updated_at' => $this->now(),
        ]);
    }

    /**
     * Rebuild the run's rows of what it used, from its spans, in statements the database runs by itself.
     *
     * Each table is filled by one insert-select. That reads the spans as the database holds them now
     * and not as the transaction first saw them (on MySQL an insert-select is a current read), so a
     * flush inside an application's transaction that began before another process flushed the same run
     * still counts that process's spans. It also sends no rows through PHP, so it needs no chunking
     * for the number of bound parameters, and it lets the database's own comparison of text decide
     * what one model, one provider and one tool are, as every grouped read of spans does.
     *
     * The run's name and start are those of its stored row, which is what reads compare against.
     */
    private function writeSummaries(ConnectionInterface $db, string $traceId): void
    {
        $running = Status::Running->value;
        $failed = Status::Failed->value;
        $bills = SpanSql::bills('trail_spans');
        $reported = SpanSql::reported('trail_spans');
        $unpriced = "{$bills} and trail_spans.cost is null and {$reported}";
        $input = 'trail_spans.input_tokens';
        $cached = '(coalesce(trail_spans.cache_read_tokens, 0) + coalesce(trail_spans.cache_write_tokens, 0))';
        $stored = fn () => $db->table('trail_traces')->select('id', 'name', 'started_at')->where('id', $traceId);

        $models = $db->table('trail_spans')
            ->select('provider', 'model')
            ->selectRaw("sum(case when {$bills} then 1 else 0 end) as steps")
            ->selectRaw("sum(case when {$bills} and {$reported} then 1 else 0 end) as reported_steps")
            ->selectRaw("sum(case when {$unpriced} then 1 else 0 end) as unpriced_steps")
            ->selectRaw("sum(case when {$unpriced} then coalesce(trail_spans.input_tokens, 0) + coalesce(trail_spans.output_tokens, 0) end) as unpriced_tokens")
            ->selectRaw("max(case when {$bills} and trail_spans.status = ? then trail_spans.created_at end) as open_at", [$running])
            ->selectRaw("sum(case when {$bills} then trail_spans.input_tokens end) as input_tokens")
            // The comparison comes first so that the unsigned columns are never subtracted below zero.
            ->selectRaw("sum(case when {$bills} and {$input} is not null then case when {$input} > {$cached} then {$input} - {$cached} else 0 end end) as uncached_input_tokens")
            ->selectRaw("sum(case when {$bills} then trail_spans.output_tokens end) as output_tokens")
            ->selectRaw("sum(case when {$bills} then trail_spans.cache_read_tokens end) as cache_read_tokens")
            ->selectRaw("sum(case when {$bills} then trail_spans.cache_write_tokens end) as cache_write_tokens")
            ->selectRaw("sum(case when {$bills} then trail_spans.reasoning_tokens end) as reasoning_tokens")
            ->selectRaw("sum(case when {$bills} then trail_spans.cost end) as cost")
            ->where('trace_id', $traceId)
            ->where(fn (Builder $spans) => $spans->whereNotNull('provider')->orWhereNotNull('model')->orWhereRaw($bills))
            ->groupBy('provider', 'model');

        // The first model of each provider, by the database's own ordering, marks the row that counts the provider.
        $firsts = $db->table('trail_spans')
            ->select('provider')
            ->selectRaw('min(model) as first_model')
            ->where('trace_id', $traceId)
            ->whereNotNull('provider')
            ->groupBy('provider');

        $db->table('trail_trace_models')->where('trace_id', $traceId)->delete();

        $db->table('trail_trace_models')->insertUsing([
            'trace_id', 'provider', 'model', 'run_name', 'started_at', 'provider_first', 'steps', 'reported_steps', 'unpriced_steps',
            'unpriced_tokens', 'open_at', 'input_tokens', 'uncached_input_tokens', 'output_tokens', 'cache_read_tokens',
            'cache_write_tokens', 'reasoning_tokens', 'cost',
        ], $db->table($models, 'g')
            ->crossJoinSub($stored(), 't')
            ->leftJoinSub($firsts, 'p', 'p.provider', '=', 'g.provider')
            ->select('t.id', 'g.provider', 'g.model', 't.name', 't.started_at')
            ->selectRaw('case when g.provider is not null and (g.model = p.first_model or (p.first_model is null and g.model is null)) then true else false end as provider_first')
            ->addSelect('g.steps', 'g.reported_steps', 'g.unpriced_steps', 'g.unpriced_tokens', 'g.open_at', 'g.input_tokens', 'g.uncached_input_tokens', 'g.output_tokens', 'g.cache_read_tokens', 'g.cache_write_tokens', 'g.reasoning_tokens', 'g.cost'));

        $tools = $db->table('trail_spans')
            ->select('name')
            ->selectRaw('count(*) as calls')
            ->selectRaw('sum(case when status = ? then 1 else 0 end) as failed', [$failed])
            ->where('trace_id', $traceId)
            ->where('type', SpanType::Tool->value)
            ->groupBy('name');

        $db->table('trail_trace_tools')->where('trace_id', $traceId)->delete();

        $db->table('trail_trace_tools')->insertUsing(
            ['trace_id', 'name', 'run_name', 'started_at', 'calls', 'failed'],
            $db->table($tools, 'g')
                ->crossJoinSub($stored(), 't')
                ->select('t.id', 'g.name', 't.name', 't.started_at', 'g.calls', 'g.failed'),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function traceColumns(TraceRecord $trace): array
    {
        return [
            'id' => $trace->id,
            'type' => $trace->type->value,
            'name' => $this->string($trace->name, self::MAX_STRING_LENGTH),
            'agent_class' => $this->string($trace->agentClass, self::MAX_STRING_LENGTH),
            'status' => $trace->status->value,
            'streamed' => $trace->streamed,
            'recovered' => $trace->recovered,
            'child_failed' => $trace->childFailed,
            'issue_kind' => $trace->issueKind?->value,
            'error_class' => $this->string($trace->errorClass, self::MAX_STRING_LENGTH),
            'error_message' => $this->string($trace->errorMessage),
            'error_source' => $trace->errorSource?->value,
            'error_http_status' => $this->httpStatus($trace->errorHttpStatus),
            'provider' => $this->string($trace->provider, self::MAX_STRING_LENGTH),
            'model' => $this->string($trace->model, self::MAX_STRING_LENGTH),
            'conversation_id' => $this->string($trace->conversationId, self::MAX_STRING_LENGTH),
            'user_id' => $this->string($trace->userId, self::MAX_STRING_LENGTH),
            'user_type' => $this->string($trace->userType, self::MAX_STRING_LENGTH),
            'duration_ms' => $this->finite($trace->durationMs),
            'prompt_excerpt' => $this->string($trace->promptExcerpt, self::MAX_EXCERPT_LENGTH),
            'response_excerpt' => $this->string($trace->responseExcerpt, self::MAX_EXCERPT_LENGTH),
            'metadata' => $this->json($trace->metadata),
            'started_at' => $this->format($trace->startedAt),
            'ended_at' => $trace->endedAt === null ? null : $this->format($trace->endedAt),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function spanColumns(SpanRecord $span): array
    {
        return [
            'id' => $span->id,
            'trace_id' => $span->traceId,
            'parent_id' => $span->parentId,
            'type' => $span->type->value,
            'name' => $this->string($span->name, self::MAX_STRING_LENGTH),
            'agent_class' => $this->string($span->agentClass, self::MAX_STRING_LENGTH),
            'status' => $span->status->value,
            'attempt' => min(32767, max(1, $span->attempt)),
            'sequence' => $this->clamp($span->sequence, 0, 2147483647),
            'step_number' => $span->stepNumber === null ? null : $this->clamp($span->stepNumber, 0, 2147483647),
            'provider' => $this->string($span->provider, self::MAX_STRING_LENGTH),
            'model' => $this->string($span->model, self::MAX_STRING_LENGTH),
            'responding_model' => $this->string($span->respondingModel, self::MAX_STRING_LENGTH),
            'input_tokens' => $this->tokens($span->inputTokens),
            'output_tokens' => $this->tokens($span->outputTokens),
            'cache_read_tokens' => $this->tokens($span->cacheReadTokens),
            'cache_write_tokens' => $this->tokens($span->cacheWriteTokens),
            'reasoning_tokens' => $this->tokens($span->reasoningTokens),
            'cost' => $this->decimal($span->cost),
            'input' => $this->json($span->input),
            'output' => $this->json($span->output),
            'metadata' => $this->json($span->metadata),
            'redacted' => $span->redacted,
            'truncated' => $span->truncated,
            'issue_kind' => $span->issueKind?->value,
            'error_class' => $this->string($span->errorClass, self::MAX_STRING_LENGTH),
            'error_message' => $this->string($span->errorMessage),
            'error_source' => $span->errorSource?->value,
            'error_http_status' => $this->httpStatus($span->errorHttpStatus),
            'duration_ms' => $this->finite($span->durationMs),
            'started_at' => $this->format($span->startedAt),
            'ended_at' => $span->endedAt === null ? null : $this->format($span->endedAt),
        ];
    }

    private function assertId(string $id): void
    {
        if (mb_strlen($id) > self::MAX_ID_LENGTH) {
            throw new InvalidArgumentException('Ids can be at most '.self::MAX_ID_LENGTH.' characters long.');
        }
    }

    private function isFinal(mixed $status): bool
    {
        return is_string($status) && (Status::tryFrom($status)?->isFinal() ?? false);
    }

    private function now(): string
    {
        return $this->format(Carbon::now());
    }

    private function format(DateTimeInterface $moment): string
    {
        return StaleRuns::format($moment);
    }

    private function string(?string $value, ?int $limit = null): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = mb_scrub(str_replace("\0", '', $value), 'UTF-8');

        return $limit === null ? $value : mb_substr($value, 0, $limit, 'UTF-8');
    }

    /**
     * @param  array<array-key, mixed>|null  $value
     */
    private function json(?array $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $encoded = json_encode($this->finiteOrNull($value), self::JSON_FLAGS);

        return $encoded === false ? null : $encoded;
    }

    private function decimal(?float $value): ?string
    {
        if ($value === null || ! is_finite($value) || $value < 0 || $value >= 100000000) {
            return null;
        }

        return number_format($value, 10, '.', '');
    }

    private function tokens(?int $value): ?int
    {
        return $value === null || $value < 0 ? null : $value;
    }

    private function clamp(int $value, int $min, int $max): int
    {
        return min($max, max($min, $value));
    }

    private function finiteOrNull(mixed $value): mixed
    {
        if (is_array($value)) {
            return array_map(fn (mixed $item) => $this->finiteOrNull($item), $value);
        }

        return is_float($value) && ! is_finite($value) ? null : $value;
    }

    private function finite(?float $value): ?float
    {
        return $value === null || ! is_finite($value) ? null : $value;
    }

    private function httpStatus(?int $status): ?int
    {
        return $status !== null && $status >= 100 && $status <= 599 ? $status : null;
    }

    private function asString(mixed $value): string
    {
        return is_scalar($value) ? (string) $value : '';
    }

    private function asInt(mixed $value): ?int
    {
        return is_numeric($value) ? (int) $value : null;
    }

    private function asFloat(mixed $value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }
}
