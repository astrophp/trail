<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Users\Ghost;
use Astro\Trail\Tests\Fixtures\Users\Member;
use Astro\Trail\Tests\Fixtures\Users\User;
use Astro\Trail\Users\UserResolver;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;

/*
|--------------------------------------------------------------------------
| Resolving the users traces belong to
|--------------------------------------------------------------------------
|
| A trace stores a user as a type and an id. Reading them back is one query per
| user model, or a callback of the application's own. It never throws.
|
*/

beforeEach(function () {
    $this->ada = DB::table('users')->insertGetId(['name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);
    $this->grace = DB::table('users')->insertGetId(['name' => 'Grace', 'email' => 'grace@example.test', 'password' => 'x']);

    $this->resolve = fn (array $pairs) => (new UserResolver)->resolve($pairs);
    $this->key = fn (string $type, int|string $id) => UserResolver::key($type, (string) $id);

    $this->queries = [];
    DB::listen(function ($query) {
        $this->queries[] = $query->sql;
    });
});

afterEach(fn () => Relation::morphMap([], false));

it('resolves a user from its model class, reading name and email from the attributes', function () {
    $resolved = ($this->resolve)([['id' => $this->ada, 'type' => User::class]]);

    expect($resolved)->toBe([($this->key)(User::class, $this->ada) => ['name' => 'Ada', 'email' => 'ada@example.test']]);
});

it('resolves a user through the morph map', function () {
    Relation::morphMap(['member' => Member::class]);

    $resolved = ($this->resolve)([['id' => $this->grace, 'type' => 'member']]);

    expect($resolved[($this->key)('member', $this->grace)])->toBe(['name' => 'Grace', 'email' => 'grace@example.test']);
});

it('reads each user model once, however many users it has', function () {
    Relation::morphMap(['member' => Member::class]);

    $resolved = ($this->resolve)([
        ['id' => $this->ada, 'type' => User::class],
        ['id' => $this->grace, 'type' => User::class],
        ['id' => $this->grace, 'type' => 'member'],
    ]);

    $selects = array_filter($this->queries, fn (string $sql) => str_starts_with($sql, 'select') && (str_contains($sql, '"users"') || str_contains($sql, '`users`')));

    expect($selects)->toHaveCount(2)
        ->and(array_column($resolved, 'name'))->toBe(['Ada', 'Grace', 'Grace']);
});

it('resolves an id that does not exist to null and the others as usual', function () {
    $resolved = ($this->resolve)([
        ['id' => 999999, 'type' => User::class],
        ['id' => $this->ada, 'type' => User::class],
    ]);

    expect($resolved[($this->key)(User::class, 999999)])->toBeNull()
        ->and($resolved[($this->key)(User::class, $this->ada)]['name'])->toBe('Ada');
});

it('resolves an unknown type to null without a query', function () {
    $resolved = ($this->resolve)([['id' => 1, 'type' => 'Nope\\Unknown'], ['id' => 1, 'type' => stdClass::class]]);

    expect(array_values($resolved))->toBe([null, null])
        ->and($this->queries)->toBe([]);
});

it('asks about a repeated pair once and returns it once', function () {
    $resolved = ($this->resolve)([
        ['id' => $this->ada, 'type' => User::class],
        ['id' => (string) $this->ada, 'type' => User::class],
    ]);

    expect($resolved)->toHaveCount(1)
        ->and(array_filter($this->queries, fn (string $sql) => str_starts_with($sql, 'select')))->toHaveCount(1);
});

it('resolves the users of a model whose table is missing to null, reporting it once', function () {
    Exceptions::fake();

    $resolved = ($this->resolve)([
        ['id' => 1, 'type' => Ghost::class],
        ['id' => 2, 'type' => Ghost::class],
        ['id' => $this->ada, 'type' => User::class],
    ]);

    Exceptions::assertReportedCount(1);
    expect($resolved[($this->key)(Ghost::class, 1)])->toBeNull()
        ->and($resolved[($this->key)(Ghost::class, 2)])->toBeNull()
        ->and($resolved[($this->key)(User::class, $this->ada)]['name'])->toBe('Ada');
});

describe('with a resolver of the application\'s own', function () {
    it('hands it the users grouped by type and takes what it returns', function () {
        $received = null;

        Trail::resolveUsersUsing(function (array $grouped) use (&$received) {
            $received = $grouped;

            return ['staff' => ['7' => ['name' => 'Seven', 'email' => null], '8' => null]];
        });

        $resolved = Trail::users()->resolve([
            ['id' => 7, 'type' => 'staff'],
            ['id' => 8, 'type' => 'staff'],
            ['id' => 9, 'type' => 'staff'],
            ['id' => 7, 'type' => 'staff'],
        ]);

        expect($received)->toBe(['staff' => ['7', '8', '9']])
            ->and($resolved)->toBe([
                UserResolver::key('staff', '7') => ['name' => 'Seven', 'email' => null],
                UserResolver::key('staff', '8') => null,
                UserResolver::key('staff', '9') => null,
            ])->and($this->queries)->toBe([]);
    });

    it('turns anything malformed it returns into null', function () {
        Trail::resolveUsersUsing(fn () => ['staff' => [
            '1' => 'not an array',
            '2' => ['name' => ['nested'], 'email' => null],
            '3' => ['name' => 5, 'email' => null],
            '4' => ['name' => 'Four'],
        ], 'other' => 'not a list']);

        $resolved = Trail::users()->resolve([
            ['id' => 1, 'type' => 'staff'], ['id' => 2, 'type' => 'staff'], ['id' => 3, 'type' => 'staff'], ['id' => 4, 'type' => 'staff'], ['id' => 5, 'type' => 'other'],
        ]);

        expect(array_values($resolved))->toBe([null, null, null, ['name' => 'Four', 'email' => null], null]);
    });

    it('resolves everything to null, reports once and does not throw when it throws', function () {
        Exceptions::fake();
        Trail::resolveUsersUsing(fn () => throw new RuntimeException('directory down'));

        $resolved = Trail::users()->resolve([['id' => 1, 'type' => 'staff'], ['id' => 2, 'type' => 'staff']]);

        Exceptions::assertReportedCount(1);
        expect(array_values($resolved))->toBe([null, null]);
    });

    it('goes back to the default when the resolver is cleared', function () {
        Trail::resolveUsersUsing(fn () => []);
        Trail::resolveUsersUsing(null);

        $resolved = Trail::users()->resolve([['id' => $this->ada, 'type' => User::class]]);

        expect($resolved[UserResolver::key(User::class, (string) $this->ada)]['name'])->toBe('Ada');
    });
});
