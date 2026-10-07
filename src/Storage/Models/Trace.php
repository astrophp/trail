<?php

namespace Astro\Trail\Storage\Models;

use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property SpanType $type
 * @property string $name
 * @property string|null $agent_class
 * @property Status $status
 * @property bool $streamed
 * @property bool $recovered
 * @property bool $child_failed
 * @property IssueKind|null $issue_kind
 * @property string|null $error_class
 * @property string|null $error_message
 * @property ErrorSource|null $error_source
 * @property int|null $error_http_status
 * @property string|null $provider
 * @property string|null $model
 * @property string|null $conversation_id
 * @property string|null $user_id
 * @property string|null $user_type
 * @property int|null $input_tokens
 * @property int|null $output_tokens
 * @property int|null $cache_read_tokens
 * @property int|null $cache_write_tokens
 * @property int|null $reasoning_tokens
 * @property float|null $cost
 * @property int $span_count
 * @property int $unpriced_span_count
 * @property float|null $duration_ms
 * @property string|null $prompt_excerpt
 * @property string|null $response_excerpt
 * @property array<string, mixed>|null $metadata
 * @property Carbon $started_at
 * @property Carbon|null $ended_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Collection<int, Span> $spans
 */
class Trace extends Model
{
    protected $table = 'trail_traces';

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
            'streamed' => 'boolean',
            'recovered' => 'boolean',
            'child_failed' => 'boolean',
            'error_http_status' => 'integer',
            'input_tokens' => 'integer',
            'output_tokens' => 'integer',
            'cache_read_tokens' => 'integer',
            'cache_write_tokens' => 'integer',
            'reasoning_tokens' => 'integer',
            'cost' => 'float',
            'span_count' => 'integer',
            'unpriced_span_count' => 'integer',
            'duration_ms' => 'float',
            'metadata' => 'array',
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    /**
     * @return HasMany<Span, $this>
     */
    public function spans(): HasMany
    {
        return $this->hasMany(Span::class, 'trace_id');
    }
}
