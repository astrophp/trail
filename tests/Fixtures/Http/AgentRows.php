<?php

namespace Astro\Trail\Tests\Fixtures\Http;

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Support\Facades\DB;

/**
 * Rows and counts the tests of the agents endpoints share.
 */
class AgentRows
{
    /**
     * A finished run unless told otherwise.
     *
     * @param  array<string, mixed>  $attributes
     */
    public static function run(string $name, string $started, array $attributes = []): Trace
    {
        return Rows::trace([...['id' => 'run-'.str()->uuid(), 'name' => $name, 'status' => Status::Completed, 'started_at' => $started], ...$attributes]);
    }

    /**
     * A completed span of a run unless told otherwise.
     *
     * @param  array<string, mixed>  $attributes
     */
    public static function span(Trace $run, SpanType $type, string $name, string $started, array $attributes = []): Span
    {
        return Rows::span($run, [...['type' => $type, 'name' => $name, 'status' => Status::Completed, 'started_at' => $started], ...$attributes]);
    }

    /**
     * @return array{all: int, completed: int, failed: int, incomplete: int, running: int, awaiting_approval: int}
     */
    public static function counts(int $completed = 0, int $failed = 0, int $incomplete = 0, int $running = 0, int $awaiting = 0): array
    {
        return ['all' => $completed + $failed + $incomplete + $running + $awaiting, 'completed' => $completed, 'failed' => $failed, 'incomplete' => $incomplete, 'running' => $running, 'awaiting_approval' => $awaiting];
    }

    /**
     * @return list<string> every statement the request ran
     */
    public static function statements(callable $request): array
    {
        $statements = [];
        DB::listen(function ($query) use (&$statements) {
            $statements[] = $query->sql;
        });

        $request();

        return $statements;
    }
}
