<?php

namespace Astro\Trail\Storage\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $trace_id
 * @property string|null $user_id
 * @property string|null $user_type
 * @property Carbon $created_at
 * @property-read Trace|null $trace
 */
class Bookmark extends Model
{
    const UPDATED_AT = null;

    protected $table = 'trail_bookmarks';

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.v';

    public function getConnectionName(): ?string
    {
        $connection = config('trail.storage.connection');

        return is_string($connection) ? $connection : parent::getConnectionName();
    }

    /**
     * @return BelongsTo<Trace, $this>
     */
    public function trace(): BelongsTo
    {
        return $this->belongsTo(Trace::class, 'trace_id');
    }
}
