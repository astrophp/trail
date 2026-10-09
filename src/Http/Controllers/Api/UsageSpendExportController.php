<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\Csv;
use Astro\Trail\Http\Resources\CsvDownload;
use Astro\Trail\Http\Resources\SpendCsv;
use Astro\Trail\Http\Resources\SpendResource;
use Astro\Trail\Queries\SpendQuery;
use Astro\Trail\Queries\TimeRange;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class UsageSpendExportController
{
    public function __invoke(Request $request, SpendQuery $spend): StreamedResponse
    {
        // Everything that can be refused is decided here, before the first byte of the file.
        $range = TimeRange::fromRequest($request);
        $data = SpendResource::of($spend->read($range));

        $unit = $data['series']['bucket'];
        $recorded = $data['series']['buckets'];
        $projection = $data['projection'];
        // Only a projection that was made is written.
        $projected = $projection['state'] === 'projected' ? $projection['buckets'] : [];
        $rows = count($recorded) + count($projected);

        return CsvDownload::response(function () use ($unit, $recorded, $projected) {
            echo Csv::BYTE_ORDER_MARK.SpendCsv::header();

            foreach ($recorded as $bucket) {
                echo SpendCsv::recorded($unit, $bucket);
            }

            foreach ($projected as $bucket) {
                echo SpendCsv::projected($unit, $bucket);
            }
        }, 'usage-estimated-cost', $rows, $rows, false, ['X-Trail-Projection-State' => $projection['state']]);
    }
}
