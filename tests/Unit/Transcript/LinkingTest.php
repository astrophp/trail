<?php

use Astro\Trail\Tests\Fixtures\Transcript\Spans;
use Astro\Trail\Transcript\JsonEquality;
use Astro\Trail\Transcript\StitchSpan;

/*
|--------------------------------------------------------------------------
| Which tool span ran each requested call
|--------------------------------------------------------------------------
|
| The cases are in a JSON file of their own, so another implementation of the same rules can be
| held to them. A case names the messages of a turn's transcript to look at, by the span that
| stores each and the path in it, and the span every one of its calls must be linked to.
|
*/

/**
 * @return array<string, array{spans: list<array<string, mixed>>, expect: array<string, list<?string>>}>
 */
function linkingCases(): array
{
    $fixture = json_decode((string) file_get_contents(__DIR__.'/../../Fixtures/Transcript/linking.json'), true, flags: JSON_THROW_ON_ERROR);
    $cases = [];

    foreach ($fixture['cases'] as $case) {
        $cases[$case['name']] = ['spans' => $case['spans'], 'expect' => $case['expect']];
    }

    return $cases;
}

/**
 * @param  array<string, mixed>  $span
 */
function linkingSpan(array $span): StitchSpan
{
    $parent = array_key_exists('parent', $span) ? $span['parent'] : ($span['id'] === 'r' ? null : 'r');

    return Spans::make($span['id'], $parent, $span['type'], $span['sequence'], [
        'name' => $span['name'] ?? 'step',
        'attempt' => $span['attempt'] ?? 1,
        'input' => $span['input'] ?? null,
        'output' => $span['output'] ?? null,
        'redacted' => $span['redacted'] ?? false,
        'truncated' => $span['truncated'] ?? false,
        'truncated_paths' => $span['truncated_paths'] ?? [],
    ]);
}

it('links a call to the tool span the arguments confirm, and to none otherwise', function (array $spans, array $expect) {
    $transcript = Spans::stitch(array_map(linkingSpan(...), $spans));

    foreach ($expect as $place => $links) {
        [$span, $path] = explode(':', $place, 2);

        $messages = array_values(array_filter(
            $transcript->messages,
            fn (array $message): bool => $message['source']['span_id'] === $span && $message['source']['path'] === $path,
        ));

        // A message that is not there would make every link in it vacuously right.
        expect($messages)->toHaveCount(1, "No message is stored at {$place}.");

        $calls = $messages[0]['tool_calls'];

        expect($calls)->toBeArray()
            ->and(array_map(fn (array $call): ?string => $call['span']['id'] ?? null, $calls))->toBe($links, "Links at {$place}.");

        foreach ($calls as $call) {
            expect($call['link'])->toBe($call['span'] === null ? 'unlinked' : 'linked');
        }
    }
})->with(linkingCases());

describe('json equality', function () {
    it('ignores the order of keys at every depth', function () {
        expect(JsonEquality::equal(['a' => 1, 'b' => ['x' => 1, 'y' => [1, 2]]], ['b' => ['y' => [1, 2], 'x' => 1], 'a' => 1]))->toBeTrue();
    });

    it('compares lists by length and element in order', function () {
        expect(JsonEquality::equal([1, 2], [2, 1]))->toBeFalse()
            ->and(JsonEquality::equal([1, 2], [1, 2, 3]))->toBeFalse()
            ->and(JsonEquality::equal([[1], [2]], [[1], [2]]))->toBeTrue();
    });

    it('compares maps by key set', function () {
        expect(JsonEquality::equal(['a' => 1], ['b' => 1]))->toBeFalse()
            ->and(JsonEquality::equal(['a' => 1], ['a' => 1, 'b' => 2]))->toBeFalse();
    });

    it('never equates a list and a map', function () {
        expect(JsonEquality::equal(['a'], ['x' => 'a']))->toBeFalse()
            ->and(JsonEquality::equal([1 => 'a', 2 => 'b'], ['a', 'b']))->toBeFalse();
    });

    it('treats an int and a float of the same value as equal, and nothing else as coercible', function () {
        expect(JsonEquality::equal(1, 1.0))->toBeTrue()
            ->and(JsonEquality::equal(1.5, 1.5))->toBeTrue()
            ->and(JsonEquality::equal(1, 2.0))->toBeFalse()
            ->and(JsonEquality::equal(1, '1'))->toBeFalse()
            ->and(JsonEquality::equal(0, false))->toBeFalse()
            ->and(JsonEquality::equal(0, null))->toBeFalse()
            ->and(JsonEquality::equal('', null))->toBeFalse()
            ->and(JsonEquality::equal([], null))->toBeFalse()
            ->and(JsonEquality::equal('a', 'a'))->toBeTrue()
            ->and(JsonEquality::equal(true, true))->toBeTrue();
    });

    it('equates an empty object and an empty list, which decode alike', function () {
        expect(JsonEquality::equal([], []))->toBeTrue();
    });
});
