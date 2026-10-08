<?php

namespace Astro\Trail\Tests\Performance;

use Carbon\CarbonImmutable;
use Illuminate\Database\Connection;

/**
 * Rows for the overview measurement. They are inserted in bulk and straight into `trail_traces`,
 * which is only acceptable here: the table lives in a throwaway database made for the measurement.
 *
 * Rows are spread evenly over the 14 days before $now, so that a 7d range and the period before
 * it together read every row. Running runs are the exception: half of them started in the last
 * 50 minutes (not yet stale) and half are spread like the others (stale).
 */
final class OverviewFixture
{
    public const DAYS = 14;

    public const CHUNK = 2000;

    /** The agent that holds about a tenth of the rows. */
    public const SCOPED_AGENT = 'BillingAssistant';

    /** The issue kinds failed runs are given, the first ones most often. */
    private const ISSUE_KINDS = ['rate_limited', 'rate_limited', 'rate_limited', 'provider_overloaded', 'provider_connection', 'insufficient_credits', 'tool_error', 'tool_error', 'exception', 'exception', 'exception', 'abandoned'];

    /** @var array<string, int> agent name => share in per mille */
    private const AGENTS = [
        'SupportAssistant' => 350,
        self::SCOPED_AGENT => 100,
        'ResearchAgent' => 90,
        'SummaryAgent' => 80,
        'TriageAgent' => 70,
        'CodeReviewer' => 60,
        'OnboardingGuide' => 50,
        'TranslationAgent' => 50,
        'FaqResponder' => 40,
        'SalesCoach' => 40,
        'DigestWriter' => 40,
        'ModerationAgent' => 30,
    ];

    /**
     * @return int how many rows were inserted
     */
    public static function seed(Connection $db, int $rows, CarbonImmutable $now, int $seed = 20261007): int
    {
        mt_srand($seed);

        $names = [];

        foreach (self::AGENTS as $name => $share) {
            array_push($names, ...array_fill(0, $share, $name));
        }

        $span = self::DAYS * 86400 * 1000;
        $start = $now->getTimestampMs() - $span;
        $nowMs = $now->getTimestampMs();
        $chunk = [];

        for ($index = 0; $index < $rows; $index++) {
            $startedAt = $start + intdiv($index * $span, max(1, $rows));
            $roll = mt_rand(0, 999);
            $status = match (true) {
                $roll < 900 => 'completed',
                $roll < 950 => 'failed',
                $roll < 970 => 'incomplete',
                $roll < 990 => 'running',
                default => 'awaiting_approval',
            };

            if ($status === 'running' && mt_rand(0, 1) === 1) {
                $startedAt = $nowMs - mt_rand(0, 50 * 60 * 1000);
            }

            $duration = $status === 'running' || mt_rand(0, 99) === 0
                ? null
                : round(100 + -log(mt_rand(1, 1000000) / 1000000) * 1500, 3);

            $tokens = mt_rand(0, 99) < 4
                ? [null, null, null, null, null]
                : [mt_rand(50, 8000), mt_rand(10, 2000), mt_rand(0, 5000), mt_rand(0, 1000), mt_rand(0, 1500)];

            $moment = gmdate('Y-m-d H:i:s', intdiv($startedAt, 1000)).sprintf('.%03d', $startedAt % 1000);

            $chunk[] = [
                'id' => sprintf('%08x-%04x-7%03x-%04x-%012x', ($startedAt >> 16) & 0xFFFFFFFF, $startedAt & 0xFFFF, mt_rand(0, 0xFFF), mt_rand(0x8000, 0xBFFF), mt_rand(0, 0xFFFFFFFFFFFF)),
                'type' => mt_rand(0, 99) < 8 ? 'embedding' : 'agent',
                'name' => $names[mt_rand(0, 999)],
                'status' => $status,
                // From the row's index and not the random stream, so the rows the overview reads are the same as before.
                'issue_kind' => $status === 'failed' && $index % 9 !== 0 ? self::ISSUE_KINDS[($index * 7) % count(self::ISSUE_KINDS)] : null,
                'child_failed' => ($status === 'completed' && $index % 40 === 0) || ($status === 'failed' && $index % 5 === 0),
                'recovered' => $index % 60 === 0,
                'input_tokens' => $tokens[0],
                'output_tokens' => $tokens[1],
                'cache_read_tokens' => $tokens[2],
                'cache_write_tokens' => $tokens[3],
                'reasoning_tokens' => $tokens[4],
                'cost' => mt_rand(0, 99) < 5 ? null : sprintf('%.10f', mt_rand(1, 500000000) / 10000000000),
                'span_count' => mt_rand(1, 8),
                'unpriced_span_count' => mt_rand(0, 99) < 3 ? mt_rand(1, 3) : 0,
                'duration_ms' => $duration,
                'started_at' => $moment,
                'created_at' => $moment,
                'updated_at' => $moment,
            ];

            if (count($chunk) === self::CHUNK) {
                $db->table('trail_traces')->insert($chunk);
                $chunk = [];
            }
        }

        if ($chunk !== []) {
            $db->table('trail_traces')->insert($chunk);
        }

        return $rows;
    }
}
