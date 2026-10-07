<?php

namespace Astro\Trail\Tests\Fixtures\Users;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A user model that is soft-deleted, which its normal query then hides.
 */
class SoftUser extends Model
{
    use SoftDeletes;

    protected $table = 'users';

    protected $guarded = [];
}
