<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Tools\CarrierUnavailable;
use Workbench\App\Tools\TrackShipment;

class ThrowingTool extends Base
{
    public function key(): string
    {
        return 'throwing-tool';
    }

    public function title(): string
    {
        return 'A throwing tool';
    }

    public function description(): string
    {
        return 'The carrier tracking tool throws, so the whole run fails.';
    }

    /**
     * A real model decides for itself whether to call the tool, so the failure cannot be counted on.
     */
    public function supportsLive(): bool
    {
        return false;
    }

    public function expectedFailure(): ?string
    {
        return CarrierUnavailable::class;
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01track', 'name' => 'track_shipment', 'input' => ['tracking_number' => '1Z999AA10123456784']]],
                ['input_tokens' => 521, 'output_tokens' => 44],
            ),
        ]);

        (new SupportAssistant([new TrackShipment]))->prompt('Where is parcel 1Z999AA10123456784 right now?');
    }
}
