<?php

namespace Astro\Trail\Queries;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * What the search endpoint was asked for. An empty or missing `q` is the same as an absent one.
 */
final readonly class SearchTerm
{
    /** The fewest characters a search is run for: a single character matches most of what was recorded. */
    public const MINIMUM = 2;

    private const MAXIMUM = 200;

    public function __construct(public string $text = '') {}

    /**
     * @throws ValidationException when `q` is not one string of at most 200 characters without a NUL byte
     */
    public static function fromRequest(Request $request): self
    {
        // The pattern refuses bytes that are not UTF-8 and the NUL byte, which a database rejects or cuts at.
        $data = Validator::make(array_filter($request->query(), fn (mixed $value) => $value !== '' && $value !== null), [
            'q' => ['string', 'regex:/\\A[^\\x00]*\\z/u', 'max:'.self::MAXIMUM],
        ])->validate();

        // Trimmed as the framework's middleware trims the lists' `search`; an application without it would not.
        return new self(is_string($data['q'] ?? null) ? Str::trim($data['q']) : '');
    }

    /**
     * Whether the text is long enough to search for.
     */
    public function searchable(): bool
    {
        return mb_strlen($this->text) >= self::MINIMUM;
    }
}
