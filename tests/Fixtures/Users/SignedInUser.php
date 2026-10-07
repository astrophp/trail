<?php

namespace Astro\Trail\Tests\Fixtures\Users;

use Illuminate\Foundation\Auth\User as Authenticatable;

/**
 * The users table as a model that can sign in, for the guard of a request.
 */
class SignedInUser extends Authenticatable
{
    protected $table = 'users';

    protected $guarded = [];
}
