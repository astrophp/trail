<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Queries\Page;
use Astro\Trail\Queries\UsageGroup;
use Astro\Trail\Queries\UsageListing;

/**
 * The usage of a time range as the API sends it: the totals with how much of them is known, and one
 * view of the breakdown. A figure nobody has is null, never zero.
 */
final class UsageResource
{
    /**
     * @param  array<string, mixed>  $summary  the summary of the range, as the overview sends it
     * @param  array{steps: int, reported_steps: int, unpriced_steps: int, unpriced_tokens: ?int}  $coverage
     * @return array{summary: array<string, mixed>, coverage: array{steps: int, reported_steps: int, unpriced_steps: int, unpriced_tokens: ?int}}
     */
    public static function totals(array $summary, array $coverage): array
    {
        return ['summary' => $summary, 'coverage' => $coverage];
    }

    /**
     * @return array{data: list<array<string, mixed>>, by: string, pagination: array<string, int>, row_limit: array{limit: int, truncated: bool}}
     */
    public static function breakdown(UsageListing $listing, Page $page): array
    {
        return [
            'data' => self::rows($listing),
            'by' => $listing->by,
            'pagination' => $page->envelope($listing->total),
            'row_limit' => ['limit' => $listing->limit, 'truncated' => $listing->truncated],
        ];
    }

    /**
     * The rows of a listing as the breakdown sends them.
     *
     * @return list<array<string, mixed>>
     */
    public static function rows(UsageListing $listing): array
    {
        return array_map(fn (UsageGroup $group) => self::row($group, $listing->by), $listing->groups);
    }

    /**
     * @return array<string, mixed>
     */
    private static function row(UsageGroup $group, string $by): array
    {
        $tokens = $group->tokens;

        $figures = [
            'steps' => $group->steps,
            'runs' => $group->runs,
            'usage' => Usage::of($group->running, $tokens['input'], $tokens['output'], $tokens['cache_read'], $tokens['cache_write'], $tokens['reasoning']),
            'cost' => Cost::of($group->cost, $group->costUnpricedSteps, $group->running),
            'coverage' => [
                'reported_steps' => $group->reportedSteps,
                'unpriced_steps' => $group->unpricedSteps,
                'unpriced_tokens' => $group->unpricedTokens,
            ],
        ];

        return match ($by) {
            'agent' => ['agent' => $group->agent] + $figures + ['filters' => ['agent' => $group->agent]],
            'provider' => ['provider' => $group->provider] + $figures + ['filters' => ['provider' => $group->provider]],
            default => ['provider' => $group->provider, 'model' => $group->model] + $figures + ['filters' => ['provider' => $group->provider, 'model' => $group->model]],
        };
    }
}
