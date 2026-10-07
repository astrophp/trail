<?php

use Astro\Trail\Http\Resources\ResolvedUsers;
use Astro\Trail\Tests\Fixtures\Users\User;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->ada = DB::table('users')->insertGetId(['name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);
    $this->grace = DB::table('users')->insertGetId(['name' => 'Grace', 'email' => 'grace@example.test', 'password' => 'x']);
});

it('answers a resolved user with the recorded id and type', function () {
    $users = ResolvedUsers::of([[User::class, (string) $this->ada]]);

    expect($users->get(User::class, (string) $this->ada))
        ->toBe(['id' => (string) $this->ada, 'type' => User::class, 'name' => 'Ada', 'email' => 'ada@example.test']);
});

it('keeps the id and leaves name and email null for a user that cannot be resolved', function () {
    $users = ResolvedUsers::of([[User::class, '9999'], ['Missing\\Model', '1']]);

    expect($users->get(User::class, '9999'))->toBe(['id' => '9999', 'type' => User::class, 'name' => null, 'email' => null])
        ->and($users->get('Missing\\Model', '1'))->toBe(['id' => '1', 'type' => 'Missing\\Model', 'name' => null, 'email' => null]);
});

it('answers null for a run without a user and skips it when resolving', function () {
    $users = ResolvedUsers::of([[null, null], [User::class, null], [null, '1']]);

    expect($users->get(null, null))->toBeNull()
        ->and($users->get(User::class, null))->toBeNull()
        ->and($users->get(null, '1'))->toBeNull();
});

it('resolves many users of one type in one query', function () {
    $queries = [];
    DB::listen(function ($query) use (&$queries) {
        $queries[] = $query->sql;
    });

    $users = ResolvedUsers::of([[User::class, (string) $this->ada], [User::class, (string) $this->grace], [User::class, (string) $this->ada], [null, null]]);

    expect($queries)->toHaveCount(1)
        ->and($users->get(User::class, (string) $this->grace)['name'])->toBe('Grace');
});
