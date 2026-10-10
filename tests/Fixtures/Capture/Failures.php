<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

use Closure;
use LogicException;
use Throwable;

/**
 * Helpers for tests of runs that fail.
 */
final class Failures
{
    /** The columns of a trace that say how a run ended. */
    public const TRACE = ['status', 'recovered', 'issue_kind', 'error_class', 'error_message', 'error_source', 'error_http_status', 'input_tokens', 'output_tokens', 'cost', 'span_count', 'unpriced_span_count'];

    /** The columns of a span that say how it went. */
    public const SPAN = ['type', 'attempt', 'step_number', 'status', 'issue_kind', 'error_class', 'error_message', 'error_source', 'error_http_status', 'input_tokens', 'output_tokens', 'cost'];

    /**
     * Run the callback and return what it throws, failing the test when it does not throw.
     */
    public static function thrown(Closure $run): Throwable
    {
        try {
            $run();
        } catch (Throwable $exception) {
            return $exception;
        }

        throw new LogicException('Expected the run to throw.');
    }

    /**
     * A span's expected columns, with the five error columns and no usage unless given.
     *
     * @param  array<string, mixed>  $extra
     * @param  array<string, mixed>  $failure
     * @return array<string, mixed>
     */
    public static function span(string $type, int $attempt, ?int $step, string $status, array $failure = [], array $extra = []): array
    {
        return array_merge(
            ['type' => $type, 'attempt' => $attempt, 'step_number' => $step, 'status' => $status],
            $failure === [] ? Captured::noFailure() : $failure,
            ['input_tokens' => null, 'output_tokens' => null, 'cost' => null],
            $extra,
        );
    }

    /**
     * A trace's expected columns.
     *
     * @param  array<string, mixed>  $failure
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    public static function trace(string $status, bool $recovered, int $spans, array $failure = [], array $extra = []): array
    {
        return array_merge(
            ['status' => $status, 'recovered' => $recovered],
            $failure === [] ? Captured::noFailure() : $failure,
            ['input_tokens' => null, 'output_tokens' => null, 'cost' => null, 'span_count' => $spans, 'unpriced_span_count' => 0],
            $extra,
        );
    }
}
