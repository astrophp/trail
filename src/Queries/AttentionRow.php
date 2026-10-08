<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\IssueKind;
use DateTimeImmutable;

/**
 * The failed runs of one issue kind: a row of the breakdown of the `failed` item.
 */
final readonly class AttentionRow
{
    /**
     * @param  array<string, string>  $filters
     */
    public function __construct(
        public IssueKind $issueKind,
        public int $count,
        public ?DateTimeImmutable $latestAt,
        public array $filters,
    ) {}
}
