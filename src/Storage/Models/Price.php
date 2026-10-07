<?php

namespace Astro\Trail\Storage\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $provider
 * @property string $model
 * @property float|null $input
 * @property float|null $output
 * @property float|null $cache_read
 * @property float|null $cache_write
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Price extends Model
{
    protected $table = 'trail_prices';

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.v';

    public function getConnectionName(): ?string
    {
        $connection = config('trail.storage.connection');

        return is_string($connection) ? $connection : parent::getConnectionName();
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'input' => 'float',
            'output' => 'float',
            'cache_read' => 'float',
            'cache_write' => 'float',
        ];
    }
}
