<?php

namespace Astro\Trail\Tests\Fixtures\Users;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A user model that always loads a relation whose table does not exist.
 */
class EagerUser extends Model
{
    protected $table = 'users';

    protected $guarded = [];

    protected $with = ['team'];

    /**
     * @return BelongsTo<Ghost, $this>
     */
    public function team(): BelongsTo
    {
        return $this->belongsTo(Ghost::class, 'id');
    }
}
