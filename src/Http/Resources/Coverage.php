<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;

/**
 * How much of what a run should have recorded was recorded, counted over the spans given. A gap is
 * counted and given a reason, never filled.
 */
final class Coverage
{
    /**
     * @param  iterable<Span>  $spans
     * @return array<string, array{state: string, captured: int, expected: int, reason: ?string}>
     */
    public static function of(Trace $trace, iterable $spans): array
    {
        // [captured, expected] of each item.
        $timing = $respondingModel = $usage = $cost = $systemPrompt = $payloads = [0, 0];
        $unfinished = true;

        foreach ($spans as $span) {
            $status = $span->effectiveStatus();
            $spanUsage = SpanResource::usageOf($span);
            $billable = $spanUsage->contributes();
            $reported = $spanUsage->reportedUsage();

            if ($status !== Status::Running) {
                self::count($timing, $span->duration_ms !== null);

                // Whether the spans without a duration all stopped short, rather than finished without one.
                if ($span->duration_ms === null && $status !== Status::Incomplete) {
                    $unfinished = false;
                }
            }

            if ($span->type === SpanType::Step && $status === Status::Completed) {
                self::count($respondingModel, $span->responding_model !== null);
            }

            if ($billable && $status === Status::Completed) {
                self::count($usage, $reported);
            }

            // A running span's cost is pending, not missing.
            if ($billable && $reported && $status !== Status::Running) {
                self::count($cost, $span->cost !== null);
            }

            if ($span->type === SpanType::Agent) {
                $system = is_array($span->input) ? ($span->input['system'] ?? null) : null;

                self::count($systemPrompt, is_string($system) && $system !== '');
            }

            self::count($payloads, $span->input !== null || $span->output !== null);
        }

        return [
            'timing' => self::item($timing, $unfinished ? 'unfinished' : 'not_reported'),
            'responding_model' => self::item($respondingModel, $trace->streamed ? 'streamed' : 'not_reported'),
            'usage' => self::item($usage, 'not_reported'),
            'cost' => self::item($cost, 'no_price'),
            'system_prompt' => self::item($systemPrompt, 'not_stored'),
            'payloads' => self::item($payloads, 'not_stored'),
        ];
    }

    /**
     * @param  array{0: int, 1: int}  $item
     */
    private static function count(array &$item, bool $captured): void
    {
        $item[1]++;

        if ($captured) {
            $item[0]++;
        }
    }

    /**
     * @param  array{0: int, 1: int}  $item
     * @return array{state: string, captured: int, expected: int, reason: ?string}
     */
    private static function item(array $item, string $reason): array
    {
        [$captured, $expected] = $item;

        return [
            'state' => match (true) {
                $expected === 0 => 'not_applicable',
                $captured === $expected => 'captured',
                $captured === 0 => 'not_captured',
                default => 'partial',
            },
            'captured' => $captured,
            'expected' => $expected,
            'reason' => $captured < $expected ? $reason : null,
        ];
    }
}
