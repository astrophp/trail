<?php

namespace Astro\Trail\Tests\Fixtures\Users;

use Illuminate\Database\Eloquent\Model;

class User extends Model
{
    protected $table = 'users';

    protected $guarded = [];
}
