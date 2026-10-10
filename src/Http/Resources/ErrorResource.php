<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;

/**
 * How a run or a span failed, in one shape for both.
 */
final class ErrorResource
{
    /**
     * Null when the row recorded neither an error class nor a message.
     *
     * @return array{class: ?string, message: ?string, source: ?string, http_status: ?int}|null
     */
    public static function of(Trace|Span $row): ?array
    {
        if ($row->error_class === null && $row->error_message === null) {
            return null;
        }

        return [
            'class' => $row->error_class,
            'message' => $row->error_message,
            'source' => $row->error_source?->value,
            'http_status' => $row->error_http_status,
        ];
    }
}
