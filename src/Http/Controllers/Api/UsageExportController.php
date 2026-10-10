<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\Csv;
use Astro\Trail\Http\Resources\CsvDownload;
use Astro\Trail\Http\Resources\UsageCsv;
use Astro\Trail\Http\Resources\UsageResource;
use Astro\Trail\Queries\Page;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Queries\UsageFilters;
use Astro\Trail\Queries\UsageQuery;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class UsageExportController
{
    public function __invoke(Request $request, UsageQuery $usage): StreamedResponse
    {
        // Everything that can be refused is decided here, before the first byte of the file.
        $range = TimeRange::fromRequest($request);
        $filters = UsageFilters::fromRequest($request);

        // The breakdown's own read, whole: its groups are already capped, so one page holds them all.
        $listing = $usage->list($range, $filters, new Page(1, PHP_INT_MAX));
        $rows = UsageResource::rows($listing);

        return CsvDownload::response(function () use ($listing, $rows) {
            echo Csv::BYTE_ORDER_MARK.UsageCsv::header($listing->by);

            foreach ($rows as $row) {
                echo UsageCsv::row($listing->by, $row);
            }
        }, 'usage-'.$listing->by, count($rows), $listing->total, $listing->truncated);
    }
}
