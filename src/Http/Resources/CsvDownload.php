<?php

namespace Astro\Trail\Http\Resources;

use Closure;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * A CSV file as a streamed response, with the headers every export sends.
 */
final class CsvDownload
{
    /**
     * @param  Closure(): void  $body  writes the file, byte-order mark and header row included
     * @param  string  $name  the file's name without its date and extension
     * @param  array<string, string>  $headers  more headers, sent before the file
     */
    public static function response(Closure $body, string $name, int $rows, int $total, bool $truncated, array $headers = []): StreamedResponse
    {
        $response = new StreamedResponse($body);

        $response->headers->set('Content-Type', 'text/csv; charset=UTF-8');
        $response->headers->set('Content-Disposition', 'attachment; filename="trail-'.$name.'-'.Carbon::now()->utc()->format('Ymd-His').'.csv"');
        // An export is never cached, never sniffed into another type, and never held back by a proxy.
        $response->headers->set('Cache-Control', 'no-store, private');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Accel-Buffering', 'no');
        $response->headers->set('X-Trail-Export-Rows', (string) $rows);
        $response->headers->set('X-Trail-Export-Total', (string) $total);
        $response->headers->set('X-Trail-Export-Truncated', $truncated ? 'true' : 'false');

        foreach ($headers as $header => $value) {
            $response->headers->set($header, $value);
        }

        return $response;
    }
}
