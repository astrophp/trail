<?php

namespace Astro\Trail\Tests\Performance;

use Random\Engine\Mt19937;
use Random\Randomizer;

/**
 * The spans of the runs OverviewFixture makes, for the measurement of the reads that cross
 * `trail_spans`. The spans come from a random stream of their own, so the runs are the same rows
 * whether spans are seeded or not.
 *
 * A run has a root agent span; one to four step spans (a skewed set of models over three
 * providers, usage and cost on most); none to three tool spans (a skewed set of tools, a few
 * failed); and, for about 8% of runs, a delegated agent span under one of its tool spans with its
 * own one or two steps and none or one tool. That is about five or six spans a run.
 *
 * The rows carry no payload (`input`, `output` and `metadata` are null), so they are narrower than
 * recorded ones. Defaulted columns (attempt, redacted, truncated) are left to their defaults.
 */
final class SpanFixture
{
    /** Rows to collect before a bulk insert; a row binds 24 values, and MySQL allows 65,535 in all. */
    public const CHUNK = 1500;

    /** About this many runs in a hundred delegate to another agent. */
    private const DELEGATING = 8;

    /** @var array<string, array{0: string, 1: int}> model => provider and share in per mille */
    public const MODELS = [
        'claude-sonnet-4-5' => ['anthropic', 350],
        'gpt-5' => ['openai', 250],
        'claude-haiku-4-5' => ['anthropic', 150],
        'gpt-5-mini' => ['openai', 150],
        'gemini-2.5-pro' => ['google', 60],
        'claude-opus-4-1' => ['anthropic', 40],
    ];

    /** @var array<string, int> tool => share in per mille; the first is the most common, the last the rarest */
    public const TOOLS = [
        'lookup_order' => 230, 'search_knowledge_base' => 180, 'get_customer' => 120, 'web_search' => 90,
        'create_ticket' => 80, 'send_email' => 60, 'fetch_url' => 50, 'run_sql' => 40, 'summarize_document' => 40,
        'translate_text' => 30, 'calculate_refund' => 25, 'check_inventory' => 20, 'update_crm' => 20,
        'schedule_meeting' => 10, 'get_weather' => 5,
    ];

    /** @var array<string, int> delegated agent => share in per mille; the last two are never run on their own */
    public const DELEGATED = [
        'ResearchAgent' => 300, 'SummaryAgent' => 200, 'TriageAgent' => 150, 'CodeReviewer' => 100,
        self::DELEGATED_ONLY => 150, 'FactChecker' => 100,
    ];

    /** An agent that is only ever seen as a sub-agent. */
    public const DELEGATED_ONLY = 'WebSearcher';

    private readonly Randomizer $random;

    /** @var list<string> */
    private readonly array $models;

    /** @var list<string> */
    private readonly array $tools;

    /** @var list<string> */
    private readonly array $delegates;

    public function __construct(int $seed)
    {
        $this->random = new Randomizer(new Mt19937($seed ^ 0x5EED));
        $this->models = self::wheel(array_map(fn (array $model) => $model[1], self::MODELS));
        $this->tools = self::wheel(self::TOOLS);
        $this->delegates = self::wheel(self::DELEGATED);
    }

    /**
     * @param  array<string, mixed>  $trace  the run's row
     * @param  int  $startedAt  when the run started, in epoch milliseconds
     * @return list<array<string, mixed>> the run's spans, the root first
     */
    public function forRun(array $trace, int $startedAt): array
    {
        $traceId = (string) $trace['id'];
        $status = (string) $trace['status'];
        $duration = is_numeric($trace['duration_ms']) ? (float) $trace['duration_ms'] : 2000.0;
        $running = $status === 'running';

        $spans = [];
        $sequence = 0;
        $cursor = 0;

        $root = $this->span($traceId, $traceId, null, 'agent', (string) $trace['name'], $status, $startedAt, $running ? null : $duration, ++$sequence);
        $spans[] = $root;

        $tools = [];
        $steps = $this->between(1, 4);
        $toolCount = $this->between(0, 3);
        $delegating = $this->between(0, 99) < self::DELEGATING;

        for ($step = 0; $step < $steps; $step++) {
            $last = $step === $steps - 1;
            $cursor += $this->between(5, 40);
            $spans[] = $this->step($traceId, $traceId, $step, $startedAt + $cursor, $last && $running ? 'running' : ($last && $status === 'failed' ? 'failed' : 'completed'), ++$sequence);
        }

        for ($tool = 0; $tool < max($toolCount, $delegating ? 1 : 0); $tool++) {
            $cursor += $this->between(5, 40);
            $tools[] = $this->tool($traceId, $traceId, $startedAt + $cursor, ++$sequence);
        }

        if ($delegating) {
            $parent = $tools[$this->between(0, count($tools) - 1)];
            $spans = [...$spans, ...$tools, ...$this->delegated($traceId, $parent, $sequence)];
        } else {
            $spans = [...$spans, ...$tools];
        }

        return $spans;
    }

    /**
     * The sub-agent a tool started: its agent span, one or two steps and none or one tool.
     *
     * @param  array<string, mixed>  $tool
     * @return list<array<string, mixed>>
     */
    private function delegated(string $traceId, array $tool, int $sequence): array
    {
        $startedAt = self::epoch($tool['started_at']) + 2;
        $agentId = $this->id($startedAt);
        $spans = [$this->span($traceId, $agentId, (string) $tool['id'], 'agent', $this->delegates[$this->between(0, 999)], 'completed', $startedAt, 400.0, ++$sequence)];
        $cursor = 0;

        for ($step = 0, $steps = $this->between(1, 2); $step < $steps; $step++) {
            $cursor += $this->between(5, 40);
            $spans[] = $this->step($traceId, $agentId, $step, $startedAt + $cursor, 'completed', ++$sequence);
        }

        if ($this->between(0, 1) === 1) {
            $cursor += $this->between(5, 40);
            $spans[] = $this->tool($traceId, $agentId, $startedAt + $cursor, ++$sequence);
        }

        return $spans;
    }

    /**
     * @return array<string, mixed>
     */
    private function step(string $traceId, string $parentId, int $number, int $startedAt, string $status, int $sequence): array
    {
        $model = $this->models[$this->between(0, 999)];
        $reported = $status !== 'failed' && $this->between(0, 99) >= 4;
        $priced = $reported && $this->between(0, 99) >= 5;

        return [
            ...$this->span($traceId, $this->id($startedAt), $parentId, 'step', 'step', $status, $startedAt, $status === 'running' ? null : (float) $this->between(200, 4000), $sequence),
            'step_number' => $number,
            'provider' => self::MODELS[$model][0],
            'model' => $model,
            'input_tokens' => $reported ? $this->between(50, 8000) : null,
            'output_tokens' => $reported ? $this->between(10, 2000) : null,
            'cache_read_tokens' => $reported ? $this->between(0, 5000) : null,
            'cache_write_tokens' => $reported ? $this->between(0, 1000) : null,
            'reasoning_tokens' => $reported ? $this->between(0, 1500) : null,
            'cost' => $priced ? sprintf('%.10f', $this->between(1, 100000000) / 10000000000) : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function tool(string $traceId, string $parentId, int $startedAt, int $sequence): array
    {
        $failed = $this->between(0, 99) < 5;

        return $this->span($traceId, $this->id($startedAt), $parentId, 'tool', $this->tools[$this->between(0, 999)], $failed ? 'failed' : 'completed', $startedAt, (float) $this->between(5, 900), $sequence);
    }

    /**
     * One row, with every column of every type so that rows can be inserted together.
     *
     * @return array<string, mixed>
     */
    private function span(string $traceId, string $id, ?string $parentId, string $type, string $name, string $status, int $startedAt, ?float $duration, int $sequence): array
    {
        $started = self::moment($startedAt);

        return [
            'id' => $id,
            'trace_id' => $traceId,
            'parent_id' => $parentId,
            'type' => $type,
            'name' => $name,
            'agent_class' => $type === 'agent' ? 'App\\Ai\\Agents\\'.$name : null,
            'status' => $status,
            'sequence' => $sequence,
            'step_number' => null,
            'provider' => null,
            'model' => null,
            'input_tokens' => null,
            'output_tokens' => null,
            'cache_read_tokens' => null,
            'cache_write_tokens' => null,
            'reasoning_tokens' => null,
            'cost' => null,
            'duration_ms' => $duration,
            'started_at' => $started,
            'ended_at' => $duration === null ? null : self::moment($startedAt + (int) $duration),
            'created_at' => $started,
            'updated_at' => $started,
        ];
    }

    /**
     * An id in the shape of the SDK's, ordered by time like a uuid7.
     */
    private function id(int $startedAt): string
    {
        return sprintf('%08x-%04x-7%03x-%04x-%012x', ($startedAt >> 16) & 0xFFFFFFFF, $startedAt & 0xFFFF, $this->between(0, 0xFFF), $this->between(0x8000, 0xBFFF), $this->between(0, 0xFFFFFFFFFFFF));
    }

    private function between(int $min, int $max): int
    {
        return $this->random->getInt($min, $max);
    }

    /**
     * A list of 1,000 names in which each appears as often as its share says.
     *
     * @param  array<string, int>  $shares
     * @return list<string>
     */
    private static function wheel(array $shares): array
    {
        $wheel = [];

        foreach ($shares as $name => $share) {
            array_push($wheel, ...array_fill(0, $share, (string) $name));
        }

        return $wheel;
    }

    private static function moment(int $milliseconds): string
    {
        return gmdate('Y-m-d H:i:s', intdiv($milliseconds, 1000)).sprintf('.%03d', $milliseconds % 1000);
    }

    private static function epoch(mixed $moment): int
    {
        return (int) round(((float) strtotime(substr((string) $moment, 0, 19).' UTC') * 1000) + (int) substr((string) $moment, 20, 3));
    }
}
