<?php

namespace Astro\Trail\Storage\Models;

use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $trace_id
 * @property string|null $parent_id
 * @property SpanType $type
 * @property string $name
 * @property string|null $agent_class
 * @property Status $status
 * @property int $attempt
 * @property int $sequence
 * @property int|null $step_number
 * @property string|null $provider
 * @property string|null $model
 * @property string|null $responding_model
 * @property int|null $input_tokens
 * @property int|null $output_tokens
 * @property int|null $cache_read_tokens
 * @property int|null $cache_write_tokens
 * @property int|null $reasoning_tokens
 * @property float|null $cost
 * @property array<array-key, mixed>|null $input
 * @property array<array-key, mixed>|null $output
 * @property array<string, mixed>|null $metadata
 * @property bool $redacted
 * @property bool $truncated
 * @property IssueKind|null $issue_kind
 * @property string|null $error_class
 * @property string|null $error_message
 * @property ErrorSource|null $error_source
 * @property int|null $error_http_status
 * @property float|null $duration_ms
 * @property Carbon $started_at
 * @property Carbon|null $ended_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Trace $trace
 * @property-read Span|null $parent
 * @property-read Collection<int, Span> $children
 */
class Span extends Model
{
    protected $table = 'trail_spans';

    public $incrementing = false;

    protected $keyType = 'string';

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
            'type' => SpanType::class,
            'status' => Status::class,
            'issue_kind' => IssueKind::class,
            'error_source' => ErrorSource::class,
            'attempt' => 'integer',
            'sequence' => 'integer',
            'step_number' => 'integer',
            'input_tokens' => 'integer',
            'output_tokens' => 'integer',
            'cache_read_tokens' => 'integer',
            'cache_write_tokens' => 'integer',
            'reasoning_tokens' => 'integer',
            'cost' => 'float',
            'input' => 'array',
            'output' => 'array',
            'metadata' => 'array',
            'redacted' => 'boolean',
            'truncated' => 'boolean',
            'error_http_status' => 'integer',
            'duration_ms' => 'float',
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Trace, $this>
     */
    public function trace(): BelongsTo
    {
        return $this->belongsTo(Trace::class, 'trace_id');
    }

    /**
     * @return BelongsTo<Span, $this>
     */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    /**
     * @return HasMany<Span, $this>
     */
    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }
}
