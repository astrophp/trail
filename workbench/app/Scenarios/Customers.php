<?php

namespace Workbench\App\Scenarios;

use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Workbench\App\Models\User;

/**
 * The two customers conversations belong to, created the first time a scenario asks for one.
 */
final class Customers
{
    public static function priya(): User
    {
        return self::named('Priya Raman', 'priya@northwind.test');
    }

    public static function marcus(): User
    {
        return self::named('Marcus Webb', 'marcus@northwind.test');
    }

    private static function named(string $name, string $email): User
    {
        return User::query()->firstOrCreate(['email' => $email], ['name' => $name, 'password' => Hash::make(Str::random(32))]);
    }
}
