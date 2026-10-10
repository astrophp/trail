<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Hardening;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A model with the habits of an application's own: a relation that is not loaded and an appended
 * attribute that reads it, so turning the model into an array lazy loads.
 */
class Widget extends Model
{
    protected $table = 'hardening_widgets';

    protected $guarded = [];

    public $timestamps = false;

    protected $appends = ['owner_name'];

    public static int $accessorCalls = 0;

    public function owner(): BelongsTo
    {
        return $this->belongsTo(Owner::class, 'owner_id');
    }

    protected function ownerName(): Attribute
    {
        return Attribute::get(function () {
            self::$accessorCalls++;

            return $this->owner?->name;
        });
    }
}
