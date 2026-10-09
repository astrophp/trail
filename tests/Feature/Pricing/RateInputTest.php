<?php

use Astro\Trail\Pricing\RateInput;
use Illuminate\Validation\ValidationException;

// The framework's TrimStrings middleware is no part of these: the rule is RateInput's own.

it('ignores whitespace around a text', function (string $sent, string $stored) {
    expect(RateInput::from(['input' => $sent])['input'])->toBe($stored);
})->with([
    'spaces' => [' 3 ', '3'],
    'a tab and a newline' => ["\t1.5\n", '1.5'],
    'a carriage return' => ["0.000001\r", '0.000001'],
]);

it('takes a text of nothing but whitespace as blank', function (string $sent) {
    expect(RateInput::from(['input' => $sent, 'output' => 1]))->toBe(['input' => null, 'output' => '1', 'cache_read' => null, 'cache_write' => null]);
})->with(['', ' ', "  \t\n "]);

it('still refuses a trimmed text that is no rate, and one the column cannot hold', function (string $sent) {
    try {
        RateInput::from(['input' => $sent]);
        $this->fail('The text was accepted.');
    } catch (ValidationException $e) {
        expect(array_keys($e->errors()))->toBe(['input']);
    }
})->with([' abc ', ' -1 ', ' 1000000 ', ' 0.0000001 ', ' 1 2 ']);
