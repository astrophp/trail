<?php

namespace Astro\Trail\Transcript;

/**
 * What one turn said, read from its spans: the messages in the order they were exchanged, and how
 * much of the turn they cover.
 */
final readonly class Transcript
{
    public const STORED = 'stored';

    public const PARTIAL = 'partial';

    public const NOT_STORED = 'not_stored';

    /**
     * @param  list<array<string, mixed>>  $attempts
     * @param  list<array<string, mixed>>  $messages  with `truncated_paths` still a map, not yet an object
     */
    public function __construct(
        public ?string $rootSpanId,
        public ?int $shownAttempt,
        public array $attempts,
        public string $state,
        public ?string $reason,
        public ?int $historyCount,
        public array $messages,
    ) {}

    /**
     * A turn with no agent span to read: nothing of it is known.
     */
    public static function none(): self
    {
        return new self(null, null, [], self::NOT_STORED, null, null, []);
    }
}
