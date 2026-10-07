<?php

namespace Astro\Trail\Tests\Fixtures\Users;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A user model whose global scope hides every row from its normal query.
 */
class HiddenUser extends Model
{
    protected $table = 'users';

    protected $guarded = [];

    protected static function booted(): void
    {
        static::addGlobalScope('nobody', fn (Builder $query) => $query->whereRaw('1 = 0'));
    }
}
