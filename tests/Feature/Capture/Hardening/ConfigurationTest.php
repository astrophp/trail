<?php

use Astro\Trail\Capture\Payload;
use Astro\Trail\Capture\Recorder;
use Astro\Trail\Capture\Sampler;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Replay;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Reports;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| Configuration that is wrong in every way a config can be
|--------------------------------------------------------------------------
|
| Whatever trail.* holds, the call returns what it would without Trail, a
| secret still never reaches the database, and the mistake is reported
| rather than silently turned into a different behaviour.
|
*/

const SECRET_PROMPT = 'Use key AKIAABCDEFGHIJKLMNOP and token ghp_abcdefghijklmnopqrstuvwxyz0123456789 please';

beforeEach(function () {
    config(['cache.default' => 'array']);

    $this->reports = Reports::capture();

    /** Make one call and return what the database holds for it. */
    $this->recorded = function (): array {
        AssistantAgent::fake(['Fine']);
        $text = (new AssistantAgent)->prompt(SECRET_PROMPT)->text;
        Trail::flush();

        $probe = new DatabaseStoreProbe;
        $id = DB::table('trail_traces')->value('id');
        $stored = $id === null ? '' : json_encode([$probe->trace($id), $probe->spans($id)]);

        return [$text, $id !== null, $stored];
    };

    /** Rebuild everything that reads config when it is first used. */
    $this->rebuild = function () {
        foreach ([Payload::class, Sampler::class, Recorder::class] as $abstract) {
            $this->app->forgetInstance($abstract);
        }
    };
});

function dataset_hostile(): array
{
    return [
        'a string' => ['not what was expected'],
        'an int' => [7],
        'a float' => [0.5],
        'true' => [true],
        'false' => [false],
        'null' => [null],
        'an empty array' => [[]],
        'a nested array' => [[['a' => [1, 2]]]],
        'a closure' => [fn () => 'x'],
        'an object' => [new stdClass],
        'a class name' => [stdClass::class],
    ];
}

dataset('hostile values', dataset_hostile());

it('keeps secrets out of the database, or says why not, whatever trail.redaction.patterns holds', function (mixed $value) {
    config(['trail.redaction.patterns' => $value]);
    ($this->rebuild)();

    [$text, $stored, $json] = ($this->recorded)();

    expect($text)->toBe('Fine')->and($stored)->toBeTrue();

    // Garbage in place of the patterns must not quietly leave the defaults off: either the secrets are still
    // redacted or the mistake was reported.
    $leaked = str_contains($json, 'AKIAABCDEFGHIJKLMNOP') || str_contains($json, 'ghp_abcdefghijklmnopqrstuvwxyz0123456789');

    expect($leaked && $this->reports->count() === 0)->toBeFalse();
})->with(array_diff_key(dataset_hostile(), ['an empty array' => 1]));

it('reports a trail.redaction.patterns that is not a list of patterns, instead of quietly using the defaults', function (mixed $value) {
    config(['trail.redaction.patterns' => $value]);
    ($this->rebuild)();

    ($this->recorded)();

    expect($this->reports->count())->toBeGreaterThanOrEqual(1);
})->with([
    'a string' => ['/secret/'],
    'a closure' => [fn () => '/x/'],
    'a list holding a closure' => [[fn () => '/x/']],
    'a list holding an array' => [[['/x/']]],
    'an int' => [7],
]);

it('reports a trail.redaction.keys that is not a list of names, instead of quietly using the defaults', function (mixed $value) {
    config(['trail.redaction.keys' => $value]);
    ($this->rebuild)();

    ($this->recorded)();

    expect($this->reports->count())->toBeGreaterThanOrEqual(1);
})->with([
    'a string' => ['password'],
    'a closure' => [fn () => 'password'],
    'a list holding an int' => [[7, 'password']],
]);

it('survives a trail.redaction.keys of any shape, still redacts by pattern, and returns the same text', function (mixed $value) {
    config(['trail.redaction.keys' => $value]);
    ($this->rebuild)();

    [$text, $stored, $json] = ($this->recorded)();

    expect($text)->toBe('Fine')->and($stored)->toBeTrue()->and($json)->not->toContain('AKIAABCDEFGHIJKLMNOP');
})->with('hostile values');

it('survives a trail.capture.max_length of any shape and returns the same text', function (mixed $value) {
    config(['trail.capture.max_length' => $value]);
    ($this->rebuild)();

    [$text, $stored, $json] = ($this->recorded)();

    expect($text)->toBe('Fine')->and($stored)->toBeTrue()->and($json)->not->toContain('AKIAABCDEFGHIJKLMNOP');
})->with('hostile values')->with([PHP_INT_MAX, 1e30, -1, 0]);

it('survives a trail.sampling of any shape and returns the same text', function (mixed $value) {
    config(['trail.sampling' => $value]);
    ($this->rebuild)();

    ($this->recorded)();

    expect(true)->toBeTrue();
})->with('hostile values')->with([NAN, INF, -INF]);

it('does not record everything when trail.sampling is NaN, and says nothing', function () {
    config(['trail.sampling' => NAN]);
    ($this->rebuild)();

    [, $stored] = ($this->recorded)();

    // A rate that is not a number is reported and means "record everything"; NaN is a float, so it was not noticed.
    expect($stored || $this->reports->count() > 0)->toBeTrue();
});

it('survives a trail.capture that is not an array, and does not store payloads when it is switched off with false', function (mixed $value, bool $off) {
    config(['trail.capture' => $value]);
    ($this->rebuild)();

    [$text, $stored, $json] = ($this->recorded)();

    expect($text)->toBe('Fine')->and($stored)->toBeTrue();

    if ($off) {
        // "capture => false" reads as "do not capture". Anything else than a stored prompt is acceptable, a report included.
        expect(str_contains($json, 'Use key') && $this->reports->count() === 0)->toBeFalse();
    }
})->with([
    'a string' => ['off', false],
    'false' => [false, true],
    'zero' => [0, true],
    'true' => [true, false],
    'null' => [null, false],
    'a closure' => [fn () => false, false],
    'an object' => [new stdClass, false],
]);

it('survives trail.capture.enabled and trail.redaction.enabled of any shape', function (mixed $value) {
    config(['trail.capture.enabled' => $value, 'trail.redaction.enabled' => $value, 'trail.capture.system_prompt' => $value]);
    ($this->rebuild)();

    [$text, $stored] = ($this->recorded)();

    expect($text)->toBe('Fine')->and($stored)->toBeTrue();
})->with('hostile values');

describe('a pattern that is valid and still hostile', function () {
    it('does not rewrite every character of the text when it matches the empty string', function () {
        config(['trail.redaction.patterns' => ['/x*/']]);
        ($this->rebuild)();

        [, $stored, $json] = ($this->recorded)();

        // /x*/ matches between every two characters; the prompt would be stored as "[redacted]U[redacted]s[redacted]e...".
        expect($stored)->toBeTrue()
            ->and(substr_count($json, '[redacted]'))->toBeLessThan(50);
    });

    it('reports a pattern that makes the regex engine give up, instead of quietly redacting everything it is shown', function () {
        // Catastrophic backtracking on a long run of one letter: PCRE gives up and preg_replace returns null.
        config(['trail.redaction.patterns' => ['/^(a|aa)+$/']]);
        ($this->rebuild)();

        AssistantAgent::fake(['Fine']);
        $started = hrtime(true);
        (new AssistantAgent)->prompt(str_repeat('a', 5000).'!');
        $elapsed = (hrtime(true) - $started) / 1e6;
        Trail::flush();

        Replay::say(sprintf('catastrophic user pattern on 5,000 characters: %.0f ms, %d reports', $elapsed, $this->reports->count()));

        expect($this->reports->count())->toBeGreaterThanOrEqual(1);
    });

    it('does not let a user pattern that backtracks hold up the call', function () {
        config(['trail.redaction.patterns' => ['/^(a|aa)+$/']]);
        ($this->rebuild)();

        AssistantAgent::fake(['Fine']);
        $elapsed = Replay::ms(fn () => (new AssistantAgent)->prompt(str_repeat('a', 5000).'!'));

        expect($elapsed)->toBeLessThan(500);
    });

    it('does not let a lookbehind-heavy user pattern hold up the call', function () {
        config(['trail.redaction.patterns' => ['/(?<=a{200})b/']]);
        ($this->rebuild)();

        AssistantAgent::fake(['Fine']);
        $elapsed = Replay::ms(fn () => (new AssistantAgent)->prompt(str_repeat('a', 12000).'c'));

        expect($elapsed)->toBeLessThan(500);
    });
});
