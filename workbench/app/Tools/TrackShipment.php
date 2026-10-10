<?php

namespace Workbench\App\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * Asks the carrier where a parcel is. The workbench has no carrier account, so the service is
 * always unreachable, which is what a tool that fails looks like.
 */
class TrackShipment implements Tool
{
    public function name(): string
    {
        return 'track_shipment';
    }

    public function description(): Stringable|string
    {
        return 'Ask the carrier for the latest tracking event of a parcel.';
    }

    public function handle(Request $request): Stringable|string
    {
        throw new CarrierUnavailable('The carrier tracking service did not respond.');
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'tracking_number' => $schema->string()->description('The carrier tracking number.')->required(),
        ];
    }
}
