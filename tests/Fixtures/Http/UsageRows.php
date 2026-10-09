<?php

namespace Astro\Trail\Tests\Fixtures\Http;

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Tests\Fixtures\Storage\Stored;
use Illuminate\Support\Carbon;

/**
 * Runs the tests of the usage endpoints share, written through the store so that the spans, the
 * totals of each run and the per-run summaries agree.
 */
class UsageRows
{
    /**
     * A completed run unless told otherwise. The steps take the start of the run.
     *
     * @param  list<array<string, mixed>>  $spans  the attributes of Records::span()
     * @param  array<string, mixed>  $trace  the attributes of Records::trace()
     * @param  ?string  $storedAt  the moment the run is written at, when it is not the current one
     */
    public static function run(string $name, string $started, array $spans = [], array $trace = [], ?string $storedAt = null): string
    {
        $start = Carbon::parse($started);
        $now = Carbon::getTestNow();

        if ($storedAt !== null) {
            Carbon::setTestNow($storedAt);
        }

        try {
            return Stored::run(
                ['name' => $name, 'status' => Status::Completed, 'startedAt' => $start, ...$trace],
                array_map(fn (array $span) => ['startedAt' => $start, ...$span], $spans),
            );
        } finally {
            Carbon::setTestNow($now);
        }
    }

    /**
     * A step of a model.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    public static function step(?string $provider, ?string $model, array $attributes = []): array
    {
        return ['type' => SpanType::Step, 'provider' => $provider, 'model' => $model, ...$attributes];
    }

    /**
     * An embeddings call of a model.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    public static function embedding(string $provider, string $model, array $attributes = []): array
    {
        return ['type' => SpanType::Embedding, 'provider' => $provider, 'model' => $model, ...$attributes];
    }

    /**
     * An agent span, which records the model the agent asked for and bills nothing.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    public static function agent(string $provider, string $model, array $attributes = []): array
    {
        return ['type' => SpanType::Agent, 'provider' => $provider, 'model' => $model, ...$attributes];
    }

    /**
     * Twelve runs in the default range (the clock is 2026-01-02 12:00:00, so the range starts at
     * 2026-01-01 12:00:00, and a step is stale when it was written before 11:00:00):
     *
     * - Alpha: a completed run with four models, a step of a sub-agent among them, and a run still running.
     * - Beta: a model priced at 0 and a model without a cost for an amount that is a fraction.
     * - Host and Delta: the same model as Alpha's second one, in a completed run and in a run left
     *   running past the cutoff, which is not pending.
     * - Embedder: an embeddings run. Askonly: an agent span that asked for a model nobody called.
     *   Streamer: a streamed step with output tokens only. Reasoner: a step with cache and reasoning
     *   tokens only, in a failed run. Orphan: steps without a model, and without a provider and a model.
     *   Edge: a run that starts exactly where the range does. Bare: a run with no span at all.
     *
     * And what must stay out: a run before the range and a run that starts exactly where it ends.
     */
    public static function dataset(): void
    {
        self::run('Alpha', '2026-01-02 10:00:00', [
            self::agent('openai', 'gpt-5', ['id' => 'run-1-agent', 'name' => 'Alpha']),
            self::step('openai', 'gpt-5', ['inputTokens' => 100, 'outputTokens' => 50, 'cacheWriteTokens' => 3, 'reasoningTokens' => 2, 'cost' => 0.01]),
            self::step('openai', 'gpt-5', ['inputTokens' => 200, 'outputTokens' => 10, 'cacheReadTokens' => 20, 'cost' => 0.02]),
            self::step('anthropic', 'claude-sonnet', ['inputTokens' => 50, 'outputTokens' => 5]),
            self::step('openai', 'gpt-5-mini'),
            // A sub-agent's step is a span of the run that delegated.
            self::agent('openai', 'gpt-5', ['id' => 'run-1-sub', 'name' => 'Beta', 'parentId' => 'run-1-agent']),
            self::step('openai', 'gpt-5', ['inputTokens' => 10, 'outputTokens' => 1, 'cost' => 0.001, 'parentId' => 'run-1-sub']),
        ], ['id' => 'run-1']);
        self::run('Alpha', '2026-01-02 11:00:00', [self::step('openai', 'gpt-5', ['status' => Status::Running])], ['id' => 'run-2', 'status' => Status::Running]);
        self::run('Beta', '2026-01-02 09:00:00', [
            self::step('openai', 'gpt-5', ['inputTokens' => 1, 'cacheWriteTokens' => 4, 'reasoningTokens' => 3, 'cost' => 0.0001]),
            self::step('openai', 'free-model', ['inputTokens' => 1000, 'outputTokens' => 100, 'cost' => 0.0]),
        ], ['id' => 'run-3']);
        self::run('Host', '2026-01-02 10:30:00', [
            self::agent('anthropic', 'claude-sonnet'),
            self::step('anthropic', 'claude-sonnet', ['inputTokens' => 4, 'cost' => 0.004]),
        ], ['id' => 'run-4']);
        self::run('Embedder', '2026-01-02 08:00:00', [self::embedding('openai', 'text-embedding-3-small', ['inputTokens' => 7, 'cost' => 0.0001])], ['id' => 'run-5', 'type' => SpanType::Embedding]);
        // Written at 09:00, so it is two hours past the cutoff of 11:00.
        self::run('Delta', '2026-01-02 07:00:00', [
            self::step('anthropic', 'claude-sonnet', ['inputTokens' => 3, 'cost' => 0.003, 'status' => Status::Running]),
        ], ['id' => 'run-6', 'status' => Status::Running], storedAt: '2026-01-02 09:00:00');
        self::run('Askonly', '2026-01-02 06:00:00', [self::agent('anthropic', 'claude-opus')], ['id' => 'run-7']);
        self::run('Streamer', '2026-01-02 05:00:00', [self::step('openai', 'gpt-5-mini', ['outputTokens' => 40])], ['id' => 'run-8', 'streamed' => true]);
        self::run('Reasoner', '2026-01-02 04:00:00', [
            self::step('openai', 'o3', ['cacheReadTokens' => 5, 'reasoningTokens' => 30]),
        ], ['id' => 'run-9', 'status' => Status::Failed]);
        self::run('Orphan', '2026-01-02 03:00:00', [
            self::step(null, null, ['inputTokens' => 8, 'cost' => 0.0008]),
            self::step('acme', null, ['inputTokens' => 6]),
        ], ['id' => 'run-10']);
        self::run('Edge', '2026-01-01 12:00:00', [self::step('openai', 'edge-in', ['inputTokens' => 2, 'cost' => 0.0002])], ['id' => 'run-11']);
        self::run('Bare', '2026-01-02 03:30:00', [], ['id' => 'run-13']);

        self::run('Alpha', '2026-01-01 11:00:00', [self::step('openai', 'gpt-5', ['inputTokens' => 999, 'cost' => 9.99])], ['id' => 'run-before']);
        self::run('Edge', '2026-01-02 12:00:00', [self::step('openai', 'edge-out', ['inputTokens' => 3, 'cost' => 0.0003])], ['id' => 'run-after']);
    }
}
