<?php

namespace Astro\Trail\Tests\Fixtures\Users;

use Illuminate\Database\Eloquent\Model;

/**
 * A user model whose table does not exist.
 */
class Ghost extends Model
{
    protected $table = 'no_such_users_table';
}
