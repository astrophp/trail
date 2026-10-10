<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\Status;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * What a request narrows the list of runs to. An empty parameter is the same as an absent one.
 */
final readonly class TraceFilters
{
    public const SORTS = ['started_at', 'duration', 'cost', 'agent'];

    private const MAXIMUM_SEARCH = 200;

    private const SWITCHES = ['1', 'true', '0', 'false'];

    public function __construct(
        public ?Status $status = null,
        public ?string $agent = null,
        public ?string $provider = null,
        public ?string $model = null,
        public ?string $conversation = null,
        public ?string $userId = null,
        public ?string $userType = null,
        public ?IssueKind $issueKind = null,
        public bool $streamed = false,
        public bool $recovered = false,
        public bool $childFailed = false,
        public bool $unpriced = false,
        public bool $slow = false,
        public bool $bookmarked = false,
        public ?string $search = null,
        public string $sort = 'started_at',
        public bool $descending = true,
        public ?string $tool = null,
    ) {}

    /**
     * @throws ValidationException when a parameter is invalid
     */
    public static function fromRequest(Request $request): self
    {
        $switch = ['string', Rule::in(self::SWITCHES)];
        // The pattern refuses bytes that are not UTF-8 and the NUL byte, which a database rejects or cuts at.
        $text = ['string', 'regex:/\\A[^\\x00]*\\z/u'];
        $string = [...$text, 'max:255'];

        $data = Validator::make(array_filter($request->query(), fn (mixed $value) => $value !== '' && $value !== null), [
            'status' => ['string', Rule::enum(Status::class)],
            'agent' => $string,
            'provider' => $string,
            'model' => $string,
            'tool' => $string,
            'conversation' => $string,
            'user_id' => ['required_with:user_type', ...$string],
            'user_type' => $string,
            'issue_kind' => ['string', Rule::enum(IssueKind::class)],
            'streamed' => $switch,
            'recovered' => $switch,
            'child_failed' => $switch,
            'unpriced' => $switch,
            'slow' => $switch,
            'bookmarked' => $switch,
            'search' => [...$text, 'max:'.self::MAXIMUM_SEARCH],
            'sort' => ['string', Rule::in([...self::SORTS, ...array_map(fn (string $sort) => '-'.$sort, self::SORTS)])],
        ])->validate();

        $on = fn (string $name) => in_array($data[$name] ?? null, ['1', 'true'], true);
        $text = fn (string $name): ?string => is_string($data[$name] ?? null) ? $data[$name] : null;
        $sort = $text('sort') ?? '-started_at';

        return new self(
            Status::tryFrom($text('status') ?? ''),
            $text('agent'),
            $text('provider'),
            $text('model'),
            $text('conversation'),
            $text('user_id'),
            $text('user_type'),
            IssueKind::tryFrom($text('issue_kind') ?? ''),
            $on('streamed'),
            $on('recovered'),
            $on('child_failed'),
            $on('unpriced'),
            $on('slow'),
            $on('bookmarked'),
            $text('search'),
            ltrim($sort, '-'),
            str_starts_with($sort, '-'),
            tool: $text('tool'),
        );
    }
}
