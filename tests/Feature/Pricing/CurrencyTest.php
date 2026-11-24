<?php

use Astro\Trail\Pricing\Currency;
use Illuminate\Config\Repository;

it('reads a currency code', function (mixed $configured, ?string $expected) {
    expect(Currency::normalize($configured))->toBe($expected);
})->with([
    'null' => [null, null],
    'lower case' => ['usd', 'USD'],
    'padded and lower case' => [' eur ', 'EUR'],
    'upper case' => ['CNY', 'CNY'],
    'empty' => ['', null],
    'blank' => ['   ', null],
    'too long' => ['EURO', null],
    'too short' => ['EU', null],
    'digits' => ['E1R', null],
    'only digits' => ['978', null],
    'not ASCII' => ['€UR', null],
    'an integer' => [123, null],
    'a boolean' => [false, null],
    'a list' => [[], null],
]);

it('reads the configured currency', function (mixed $configured, ?string $expected) {
    config(['trail.currency' => $configured]);

    expect(Currency::configured())->toBe($expected);
})->with([
    'null' => [null, null],
    'empty' => ['', 'USD'],
    'blank' => ['   ', 'USD'],
    'USD' => ['USD', 'USD'],
    'lower case' => ['eur', 'EUR'],
    'invalid' => ['EURO', null],
]);

it('is US dollars in the package configuration', function () {
    expect(config('trail.currency'))->toBe('USD')
        ->and(Currency::configured())->toBe('USD');
});

it('is US dollars when the setting is absent', function () {
    expect(Currency::from(new Repository(['trail' => []])))->toBe('USD');
});
