<?php

use Astro\Trail\Queries\Page;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

function pageOf(array $query): Page
{
    return Page::fromRequest(Request::create('/', 'GET', $query));
}

it('defaults to the first page of 25', function () {
    $page = pageOf([]);

    expect($page->page)->toBe(1)
        ->and($page->perPage)->toBe(25)
        ->and($page->offset())->toBe(0);
});

it('clamps per_page to 1 through 100', function (string $given, int $expected) {
    expect(pageOf(['per_page' => $given])->perPage)->toBe($expected);
})->with([['500', 100], ['101', 100], ['100', 100], ['0', 1], ['-5', 1], ['7', 7]]);

it('rejects what is not an integer', function (array $query, string $parameter) {
    try {
        pageOf($query);
        $this->fail('Expected a validation error.');
    } catch (ValidationException $e) {
        expect(array_keys($e->errors()))->toBe([$parameter]);
    }
})->with([
    [['page' => '0'], 'page'],
    [['page' => '-1'], 'page'],
    [['page' => 'abc'], 'page'],
    [['page' => '1.5'], 'page'],
    [['page' => ['1']], 'page'],
    [['page' => '99999999999999999999'], 'page'],
    [['per_page' => 'many'], 'per_page'],
    [['per_page' => '2.5'], 'per_page'],
    [['per_page' => ['2']], 'per_page'],
]);

it('computes the offset', function () {
    expect(pageOf(['page' => '3', 'per_page' => '10'])->offset())->toBe(20)
        // A page far past the end is capped, so the offset never leaves the integer range.
        ->and(pageOf(['page' => '4611686018427387905', 'per_page' => '2'])->offset())->toBe((Page::MAXIMUM_PAGE - 1) * 2)
        ->and(pageOf(['page' => (string) PHP_INT_MAX, 'per_page' => '100'])->page)->toBe(Page::MAXIMUM_PAGE);
});

it('describes the pagination, with a last page of at least 1', function (int $total, int $last) {
    expect(pageOf(['page' => '2', 'per_page' => '10'])->envelope($total))
        ->toBe(['page' => 2, 'per_page' => 10, 'total' => $total, 'last_page' => $last]);
})->with([[0, 1], [1, 1], [10, 1], [11, 2], [240, 24]]);
