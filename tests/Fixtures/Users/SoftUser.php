<?php

namespace Astro\Trail\Tests\Fixtures\Users;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A user model that is soft-deleted, which its normal query then hides. It reuses a nullable
 * timestamp the users table already has as its deletion column, so no test has to alter the schema.
 */
class SoftUser extends Model
{
    use SoftDeletes;

    public const DELETED_AT = 'email_verified_at';

    protected $table = 'users';

    protected $guarded = [];
}
