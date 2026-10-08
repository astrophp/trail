<?php

namespace Astro\Trail\Queries;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * What a request narrows the list of conversations to. An empty parameter is the same as an
 * absent one.
 */
final readonly class ConversationFilters
{
    public const SORTS = ['last_activity', 'turns', 'cost'];

    private const MAXIMUM_SEARCH = 200;

    private const SWITCHES = ['1', 'true', '0', 'false'];

    public function __construct(
        public ?string $agent = null,
        public ?string $userId = null,
        public ?string $userType = null,
        public bool $failed = false,
        public ?string $search = null,
        public string $sort = 'last_activity',
        public bool $descending = true,
    ) {}

    /**
     * @throws ValidationException when a parameter is invalid
     */
    public static function fromRequest(Request $request): self
    {
        // The pattern refuses bytes that are not UTF-8 and the NUL byte, which a database rejects or cuts at.
        $text = ['string', 'regex:/\\A[^\\x00]*\\z/u'];
        $string = [...$text, 'max:255'];

        $data = Validator::make(array_filter($request->query(), fn (mixed $value) => $value !== '' && $value !== null), [
            'agent' => $string,
            'user_id' => ['required_with:user_type', ...$string],
            'user_type' => $string,
            'failed' => ['string', Rule::in(self::SWITCHES)],
            'search' => [...$text, 'max:'.self::MAXIMUM_SEARCH],
            'sort' => ['string', Rule::in([...self::SORTS, ...array_map(fn (string $sort) => '-'.$sort, self::SORTS)])],
        ])->validate();

        $text = fn (string $name): ?string => is_string($data[$name] ?? null) ? $data[$name] : null;
        $sort = $text('sort') ?? '-last_activity';

        return new self(
            $text('agent'),
            $text('user_id'),
            $text('user_type'),
            in_array($data['failed'] ?? null, ['1', 'true'], true),
            $text('search'),
            ltrim($sort, '-'),
            str_starts_with($sort, '-'),
        );
    }
}
