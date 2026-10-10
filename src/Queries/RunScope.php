<?php

namespace Astro\Trail\Queries;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder;

/**
 * The runs a read is narrowed to besides its time range. For now that is one agent, compared by
 * name exactly as the list's `agent` filter compares it; no scope keeps every run.
 */
final readonly class RunScope
{
    public function __construct(public ?string $agent = null) {}

    public static function none(): self
    {
        return new self;
    }

    public static function agent(string $name): self
    {
        return new self($name);
    }

    /**
     * @param  EloquentBuilder<*>|Builder  $query
     */
    public function apply(EloquentBuilder|Builder $query): void
    {
        if ($this->agent !== null) {
            $query->where('name', $this->agent);
        }
    }
}
