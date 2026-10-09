<?php

namespace Astro\Trail\Queries;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * What a request asks of the usage breakdown: which view and in what order. An empty parameter is
 * the same as an absent one.
 */
final readonly class UsageFilters
{
    public const VIEWS = ['model', 'provider', 'agent'];

    public const SORTS = ['cost', 'tokens', 'runs', 'name'];

    public function __construct(
        public string $by = 'model',
        public string $sort = 'cost',
        public bool $descending = true,
    ) {}

    /**
     * @throws ValidationException when a parameter is invalid
     */
    public static function fromRequest(Request $request): self
    {
        $data = Validator::make(array_filter($request->query(), fn (mixed $value) => $value !== '' && $value !== null), [
            'by' => ['string', Rule::in(self::VIEWS)],
            'sort' => ['string', Rule::in([...self::SORTS, ...array_map(fn (string $sort) => '-'.$sort, self::SORTS)])],
        ])->validate();

        $sort = is_string($data['sort'] ?? null) ? $data['sort'] : '-cost';

        return new self(
            is_string($data['by'] ?? null) ? $data['by'] : 'model',
            ltrim($sort, '-'),
            str_starts_with($sort, '-'),
        );
    }
}
