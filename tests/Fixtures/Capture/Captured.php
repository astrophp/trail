<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use PHPUnit\Framework\Assert;

/**
 * The rows Trail stored for one run, split into the columns a test can state exactly and the
 * volatile ones (generated ids, timestamps, durations) that can only be checked for shape.
 *
 * Stable rows replace the run's id with "<run>", so expected rows read the same in every test.
 */
final class Captured
{
    public const RUN = '<run>';

    /** The options a step records when the agent configures nothing. */
    public const NO_OPTIONS = [
        'max_steps' => null,
        'max_tokens' => null,
        'temperature' => null,
        'top_p' => null,
        'tool_choice' => null,
        'provider_options' => null,
    ];

    private const VOLATILE = ['id', 'started_at', 'ended_at', 'duration_ms', 'created_at', 'updated_at'];

    /**
     * @param  array<string, mixed>  $trace
     * @param  list<array<string, mixed>>  $spans
     */
    private function __construct(
        private readonly string $id,
        private readonly array $trace,
        private readonly array $spans,
    ) {}

    public static function read(string $invocationId): self
    {
        $probe = new DatabaseStoreProbe;
        $trace = $probe->trace($invocationId);

        Assert::assertNotNull($trace, "No trace was stored for run [{$invocationId}].");

        return new self($invocationId, $trace, $probe->spans($invocationId));
    }

    /**
     * The trace row without its volatile columns.
     *
     * @return array<string, mixed>
     */
    public function trace(): array
    {
        return $this->stable($this->trace);
    }

    /**
     * The span rows in sequence order, without their volatile columns.
     *
     * @return list<array<string, mixed>>
     */
    public function spans(): array
    {
        return array_map(fn (array $span): array => $this->stable($span), $this->spans);
    }

    /**
     * The stored id of the span at the given 0-based position in sequence order.
     */
    public function spanId(int $position): string
    {
        $id = $this->spans[$position]['id'] ?? null;

        Assert::assertIsString($id);

        return $id;
    }

    /**
     * The stored duration of the span at the given 0-based position in sequence order.
     */
    public function duration(int $position): float
    {
        $duration = $this->spans[$position]['duration_ms'] ?? null;

        Assert::assertIsFloat($duration);

        return $duration;
    }

    /**
     * Check the columns that cannot be stated exactly: the trace id, generated span ids, and that
     * timing was captured and is consistent.
     */
    public function assertVolatileColumns(): self
    {
        $trace = $this->trace;

        Assert::assertSame($this->id, $trace['id']);
        Assert::assertIsString($trace['started_at']);
        Assert::assertIsString($trace['ended_at']);
        Assert::assertIsFloat($trace['duration_ms']);
        Assert::assertGreaterThanOrEqual(0.0, $trace['duration_ms']);
        Assert::assertGreaterThanOrEqual($trace['started_at'], $trace['ended_at']);

        $ids = [];
        $sequence = 0;

        foreach ($this->spans as $span) {
            $id = $span['id'];

            Assert::assertIsString($id);
            Assert::assertSame(36, strlen($id), 'Span ids are 36 characters.');
            Assert::assertArrayNotHasKey($id, $ids, 'Span ids are unique.');
            $ids[$id] = true;

            Assert::assertSame(++$sequence, $span['sequence'], 'Sequences count up from 1 in open order.');

            Assert::assertIsString($span['started_at']);
            Assert::assertGreaterThanOrEqual($trace['started_at'], $span['started_at']);
            Assert::assertIsString($span['ended_at'], "Span [{$span['name']}] has no end time.");
            Assert::assertGreaterThanOrEqual($span['started_at'], $span['ended_at']);
            Assert::assertIsFloat($span['duration_ms'], "Span [{$span['name']}] has no duration.");
            Assert::assertGreaterThanOrEqual(0.0, $span['duration_ms']);
        }

        Assert::assertSame($this->id, $this->spans[0]['id'], 'The agent span has the run id.');
        Assert::assertSame($trace['duration_ms'], $this->spans[0]['duration_ms'], 'The trace and its agent span share one duration.');

        return $this;
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function expectedTrace(array $overrides = []): array
    {
        return self::format(array_merge([
            'type' => 'agent',
            'name' => 'AssistantAgent',
            'agent_class' => null,
            'status' => 'completed',
            'streamed' => false,
            'recovered' => false,
            'child_failed' => false,
            'issue_kind' => null,
            'error_class' => null,
            'error_message' => null,
            'error_source' => null,
            'error_http_status' => null,
            'provider' => 'anthropic',
            'model' => null,
            'conversation_id' => null,
            'user_id' => null,
            'user_type' => null,
            'input_tokens' => null,
            'output_tokens' => null,
            'cache_read_tokens' => null,
            'cache_write_tokens' => null,
            'reasoning_tokens' => null,
            'cost' => null,
            'span_count' => 0,
            'unpriced_span_count' => 0,
            'prompt_excerpt' => null,
            'response_excerpt' => null,
            'metadata' => null,
        ], $overrides));
    }

    /**
     * A stored span with every column at its default for a completed span of the run.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function expectedSpan(array $overrides = []): array
    {
        return self::format(array_merge([
            'trace_id' => self::RUN,
            'parent_id' => self::RUN,
            'type' => 'step',
            'name' => 'step',
            'agent_class' => null,
            'status' => 'completed',
            'attempt' => 1,
            'sequence' => 0,
            'step_number' => null,
            'provider' => 'anthropic',
            'model' => null,
            'responding_model' => null,
            'input_tokens' => null,
            'output_tokens' => null,
            'cache_read_tokens' => null,
            'cache_write_tokens' => null,
            'reasoning_tokens' => null,
            'cost' => null,
            'input' => null,
            'output' => null,
            'metadata' => null,
            'redacted' => false,
            'truncated' => false,
            'issue_kind' => null,
            'error_class' => null,
            'error_message' => null,
            'error_source' => null,
            'error_http_status' => null,
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function stable(array $row): array
    {
        $stable = [];

        foreach ($row as $column => $value) {
            if (in_array($column, self::VOLATILE, true)) {
                continue;
            }

            $stable[$column] = $value === $this->id ? self::RUN : $value;
        }

        return self::format($stable);
    }

    /**
     * Costs are decimals in the database, so they are compared at the column's own precision.
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private static function format(array $row): array
    {
        if (isset($row['cost'])) {
            Assert::assertIsFloat($row['cost']);

            $row['cost'] = sprintf('%.10f', $row['cost']);
        }

        return $row;
    }
}
