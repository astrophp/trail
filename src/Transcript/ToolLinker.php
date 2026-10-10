<?php

namespace Astro\Trail\Transcript;

/**
 * Which tool span ran a requested tool call. The SDK gives a tool span no id of the call it ran,
 * so a link is made only where the arguments confirm it, by two passes and no more:
 *
 * 1. The k-th call of a name takes the k-th tool span of that name, if both hold the same arguments.
 * 2. A call left over takes the one remaining span of its name that holds the same arguments.
 *
 * A call that neither pass settles has no span. Position alone never links: a tool that failed
 * before it started, or ran in another order, would hand the wrong span to a call.
 */
final class ToolLinker
{
    /**
     * @param  list<mixed>  $calls  the entries of one tool_calls list, as stored
     * @param  array<int, bool>  $trusted  by call index, whether the call's arguments can be compared
     * @param  list<StitchSpan>  $candidates  the tool spans that could have run them, in recording order
     * @return array<int, StitchSpan> the span of each linked call, by call index
     */
    public static function link(array $calls, array $trusted, array $candidates): array
    {
        $byName = [];

        foreach ($calls as $index => $call) {
            if (is_array($call) && is_string($call['name'] ?? null)) {
                $byName[$call['name']][] = $index;
            }
        }

        $linked = [];

        foreach ($byName as $name => $indexes) {
            $mine = array_values(array_filter($candidates, fn (StitchSpan $span): bool => $span->name === (string) $name));
            $taken = [];

            // First pass: by position within the name.
            foreach ($indexes as $position => $index) {
                $candidate = $mine[$position] ?? null;

                if ($candidate !== null && self::comparable($calls[$index], $trusted[$index] ?? false) && self::same($calls[$index], $candidate)) {
                    $linked[$index] = $candidate;
                    $taken[$position] = true;
                }
            }

            // Second pass: the one span left with the same arguments.
            foreach ($indexes as $index) {
                if (isset($linked[$index]) || ! self::comparable($calls[$index], $trusted[$index] ?? false)) {
                    continue;
                }

                $matches = array_keys(array_filter(
                    $mine,
                    fn (StitchSpan $span, int $position): bool => ! isset($taken[$position]) && self::same($calls[$index], $span),
                    ARRAY_FILTER_USE_BOTH,
                ));

                if (count($matches) === 1) {
                    $linked[$index] = $mine[$matches[0]];
                    $taken[$matches[0]] = true;
                }
            }
        }

        ksort($linked);

        return $linked;
    }

    /**
     * A call can be compared when it holds arguments at all (an absent key is not null) and they
     * were neither redacted nor cut.
     */
    private static function comparable(mixed $call, bool $trusted): bool
    {
        return $trusted && is_array($call) && array_key_exists('arguments', $call);
    }

    private static function same(mixed $call, StitchSpan $span): bool
    {
        return is_array($call)
            && is_array($span->input)
            && array_key_exists('arguments', $span->input)
            && $span->hasTrustworthyArguments()
            && JsonEquality::equal($call['arguments'] ?? null, $span->input['arguments']);
    }
}
