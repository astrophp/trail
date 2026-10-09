<?php

namespace Astro\Trail\Queries;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * What a request narrows and orders the list of agents by. An empty parameter is the same as an
 * absent one.
 */
final readonly class AgentFilters
{
    public const SORTS = ['runs', 'name', 'error_rate', 'duration', 'cost', 'last_activity'];

    private const MAXIMUM_SEARCH = 200;

    public function __construct(
        public ?string $search = null,
        public string $sort = 'runs',
        public bool $descending = true,
    ) {}

    /**
     * @throws ValidationException when a parameter is invalid
     */
    public static function fromRequest(Request $request): self
    {
        // The pattern refuses bytes that are not UTF-8 and the NUL byte, which a database rejects or cuts at.
        $text = ['string', 'regex:/\\A[^\\x00]*\\z/u'];

        $data = Validator::make(array_filter($request->query(), fn (mixed $value) => $value !== '' && $value !== null), [
            'search' => [...$text, 'max:'.self::MAXIMUM_SEARCH],
            'sort' => ['string', Rule::in([...self::SORTS, ...array_map(fn (string $sort) => '-'.$sort, self::SORTS)])],
        ])->validate();

        $sort = is_string($data['sort'] ?? null) ? $data['sort'] : '-runs';

        return new self(
            is_string($data['search'] ?? null) ? $data['search'] : null,
            ltrim($sort, '-'),
            str_starts_with($sort, '-'),
        );
    }
}
