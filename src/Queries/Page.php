<?php

namespace Astro\Trail\Queries;

use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final readonly class Page
{
    public const DEFAULT_PER_PAGE = 25;

    public const MAXIMUM_PER_PAGE = 100;

    /** Far past any real page, and low enough that the offset stays an integer. */
    public const MAXIMUM_PAGE = 1_000_000;

    public function __construct(public int $page = 1, public int $perPage = self::DEFAULT_PER_PAGE) {}

    /**
     * @throws ValidationException when page or per_page is not an integer, or page is below 1
     */
    public static function fromRequest(Request $request): self
    {
        $page = self::integer($request, 'page', 1);

        if ($page < 1) {
            throw ValidationException::withMessages(['page' => 'The page must be a whole number from 1.']);
        }

        $perPage = self::integer($request, 'per_page', self::DEFAULT_PER_PAGE);

        return new self(min(self::MAXIMUM_PAGE, $page), max(1, min(self::MAXIMUM_PER_PAGE, $perPage)));
    }

    public function offset(): int
    {
        return ($this->page - 1) * $this->perPage;
    }

    /**
     * @return array{page: int, per_page: int, total: int, last_page: int}
     */
    public function envelope(int $total): array
    {
        return [
            'page' => $this->page,
            'per_page' => $this->perPage,
            'total' => $total,
            'last_page' => max(1, intdiv($total + $this->perPage - 1, $this->perPage)),
        ];
    }

    private static function integer(Request $request, string $name, int $default): int
    {
        $value = $request->query($name);

        if ($value === null || $value === '') {
            return $default;
        }

        $integer = is_string($value) ? filter_var($value, FILTER_VALIDATE_INT) : false;

        if ($integer === false) {
            throw ValidationException::withMessages([$name => "The {$name} must be a whole number."]);
        }

        return $integer;
    }
}
