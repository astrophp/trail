<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\PriceResource;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Pricing\PriceSource;
use Illuminate\Http\JsonResponse;

class PriceIndexController
{
    /** The most prices one response holds. */
    public const LIMIT = 500;

    public function __construct(private readonly int $limit = self::LIMIT) {}

    public function __invoke(PriceBook $prices): JsonResponse
    {
        // Read the saved prices fresh, not the copy this process holds: another worker may have changed them.
        $prices->flush();

        // Observed models that no rate was found for come first, then the other observed ones, then
        // the rest. The catalogue is sorted by provider and model, and the sort here is stable.
        $rows = array_map(
            fn (array $entry) => PriceResource::of($prices, $entry['provider'], $entry['model'], $entry['observed']),
            $prices->catalogue(),
        );

        usort($rows, fn (array $a, array $b) => self::group($a) <=> self::group($b));

        return response()->json([
            'data' => array_slice($rows, 0, $this->limit),
            'limit' => ['limit' => $this->limit, 'total' => count($rows), 'truncated' => count($rows) > $this->limit],
        ]);
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private static function group(array $row): int
    {
        if ($row['observed'] !== true) {
            return 2;
        }

        return $row['source'] === PriceSource::None->value ? 0 : 1;
    }
}
