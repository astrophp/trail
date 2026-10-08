<?php

namespace Astro\Trail\Queries;

use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Which turns of a conversation a request asks for: how many, and the turn they are counted from.
 * With no anchor it is the newest turns.
 */
final readonly class TurnWindow
{
    /** The most turns one response carries. */
    public const TURN_LIMIT = 10;

    /** The parameters that name a turn to count from; at most one is sent. */
    private const ANCHORS = ['turn', 'before', 'after'];

    /**
     * @param  string|null  $anchor  `turn`, `before` or `after`
     */
    public function __construct(public int $limit = self::TURN_LIMIT, public ?string $anchor = null, public ?string $anchorId = null) {}

    /**
     * @throws ValidationException when limit is not an integer, more than one anchor is sent, or an anchor is not a run's id
     */
    public static function fromRequest(Request $request): self
    {
        $limit = self::TURN_LIMIT;
        $value = $request->query('limit');

        if ($value !== null && $value !== '') {
            $integer = is_string($value) ? filter_var($value, FILTER_VALIDATE_INT) : false;

            // A whole number too large for an integer is still a whole number, and out of range.
            if ($integer === false && is_string($value) && preg_match('/^\s*([+-]?)\d+\s*$/', $value, $digits) === 1) {
                $integer = $digits[1] === '-' ? PHP_INT_MIN : PHP_INT_MAX;
            }

            if ($integer === false) {
                throw ValidationException::withMessages(['limit' => 'The limit must be a whole number.']);
            }

            $limit = max(1, min(self::TURN_LIMIT, $integer));
        }

        // Sent is not the same as non-empty: an empty anchor is an error, not a request for none.
        $sent = array_values(array_filter(self::ANCHORS, fn (string $name): bool => $request->query->has($name)));

        if (count($sent) > 1) {
            throw ValidationException::withMessages([$sent[1] => 'Send only one of turn, before and after.']);
        }

        if ($sent === []) {
            return new self($limit);
        }

        $id = $request->query($sent[0]);

        if (! is_string($id) || $id === '' || ! TraceId::isPossible($id)) {
            throw ValidationException::withMessages([$sent[0] => "The {$sent[0]} must be the id of a turn."]);
        }

        return new self($limit, $sent[0], $id);
    }
}
