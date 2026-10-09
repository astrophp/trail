<?php

namespace Astro\Trail\Tests\Performance;

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\SpanRecord;
use Astro\Trail\Storage\TraceRecord;
use Carbon\CarbonImmutable;

/**
 * Finished runs to write through the store, for the measurement of what a write costs: a root agent
 * span, steps over the first few models of the fixture (at least three steps) and two tool calls
 * with different names.
 */
final class BenchRuns
{
    /**
     * @param  int  $models  how many distinct models the steps use
     * @param  int  $seed  varies the tools and which call fails
     * @return array{0: TraceRecord, 1: list<SpanRecord>}
     */
    public static function make(string $id, int $models, CarbonImmutable $startedAt, int $seed): array
    {
        $names = array_keys(SpanFixture::MODELS);
        $tools = array_keys(SpanFixture::TOOLS);
        $first = $names[0];

        $spans = [new SpanRecord($id.'-a', $id, SpanType::Agent, 'BenchAgent', Status::Completed, $startedAt, sequence: 1, provider: SpanFixture::MODELS[$first][0], model: $first)];

        for ($step = 0; $step < max($models, 3); $step++) {
            $model = $names[$step % $models];
            $spans[] = new SpanRecord(
                "{$id}-s{$step}", $id, SpanType::Step, 'step', Status::Completed, $startedAt->addMilliseconds(10 + $step),
                parentId: $id.'-a', sequence: 2 + $step, stepNumber: $step, provider: SpanFixture::MODELS[$model][0], model: $model,
                inputTokens: 1000 + $step, outputTokens: 200, cacheReadTokens: 50, cacheWriteTokens: 0, reasoningTokens: 10,
                cost: $step % 5 === 4 ? null : 0.0123456789 + $step / 1000,
            );
        }

        foreach ([0, 1] as $tool) {
            $spans[] = new SpanRecord(
                "{$id}-t{$tool}", $id, SpanType::Tool, $tools[($seed + $tool) % 5], $tool === 1 && $seed % 20 === 0 ? Status::Failed : Status::Completed,
                $startedAt->addMilliseconds(30 + $tool), parentId: $id.'-a', sequence: 20 + $tool,
            );
        }

        return [new TraceRecord($id, SpanType::Agent, 'BenchAgent', Status::Completed, $startedAt), $spans];
    }
}
