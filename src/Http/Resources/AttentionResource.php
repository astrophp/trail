<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Queries\AttentionItem;
use Astro\Trail\Queries\AttentionRow;

/**
 * The runs that need a look as the API sends them: one object for each kind that has runs.
 */
final class AttentionResource
{
    /**
     * @param  list<AttentionItem>  $items
     * @return list<array<string, mixed>>
     */
    public static function of(array $items): array
    {
        return array_map(fn (AttentionItem $item) => [
            'kind' => $item->kind->value,
            'count' => $item->count,
            'latest_at' => Timestamp::format($item->latestAt),
            'filters' => $item->filters,
            'breakdown' => array_map(fn (AttentionRow $row) => [
                'issue_kind' => $row->issueKind->value,
                'count' => $row->count,
                'latest_at' => Timestamp::format($row->latestAt),
                'filters' => $row->filters,
            ], $item->breakdown),
        ], $items);
    }
}
