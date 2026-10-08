<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\TraceCsv;
use Astro\Trail\Http\Resources\TraceResource;
use Astro\Trail\Queries\ExportSelection;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Queries\TraceFilters;
use Astro\Trail\Queries\TraceIndex;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TraceExportController
{
    public function __invoke(Request $request, TraceIndex $index): StreamedResponse
    {
        // Everything that can be refused is decided here, before the first byte of the file.
        $range = TimeRange::fromRequest($request);
        $filters = TraceFilters::fromRequest($request);
        $ids = ExportSelection::fromRequest($request);

        $threshold = $filters->slow ? $index->slowThreshold($range) : null;
        $total = $index->count($range, $filters, $threshold, $ids);
        $limit = $index->exportLimit();

        $rows = min($total, $limit);

        $response = new StreamedResponse(function () use ($index, $range, $filters, $threshold, $ids, $rows) {
            echo TraceCsv::BYTE_ORDER_MARK.TraceCsv::header();

            // The list's own order, one chunk at a time: memory holds a chunk, never the file.
            for ($offset = 0; $offset < $rows; $offset += TraceIndex::EXPORT_CHUNK) {
                $chunk = $index->slice($range, $filters, $threshold, $ids, $offset, min(TraceIndex::EXPORT_CHUNK, $rows - $offset));

                if ($chunk->isEmpty()) {
                    break;
                }

                $resource = TraceResource::of($chunk);

                foreach ($chunk as $trace) {
                    echo TraceCsv::row($resource->toArray($trace));
                }

                flush();
            }
        });

        $response->headers->set('Content-Type', 'text/csv; charset=UTF-8');
        $response->headers->set('Content-Disposition', 'attachment; filename="trail-traces-'.Carbon::now()->utc()->format('Ymd-His').'.csv"');
        // An export of prompts is never cached, never sniffed into another type, and never held back by a proxy.
        $response->headers->set('Cache-Control', 'no-store, private');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Accel-Buffering', 'no');
        $response->headers->set('X-Trail-Export-Rows', (string) $rows);
        $response->headers->set('X-Trail-Export-Total', (string) $total);
        $response->headers->set('X-Trail-Export-Truncated', $total > $limit ? 'true' : 'false');

        return $response;
    }
}
