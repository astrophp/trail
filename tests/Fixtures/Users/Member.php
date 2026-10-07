<?php

namespace Astro\Trail\Tests\Fixtures\Users;

use Illuminate\Database\Eloquent\Model;

/**
 * A second user model over the same table, to tell one query per model from one per table.
 */
class Member extends Model
{
    protected $table = 'users';

    protected $guarded = [];
}
