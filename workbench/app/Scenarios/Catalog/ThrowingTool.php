<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Sdk\Sdk;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Scenario;
use Workbench\App\Tools\CarrierUnavailable;
use Workbench\App\Tools\TrackShipment;

class ThrowingTool extends Scenario
{
    protected string $title = 'A throwing tool';

    protected string $description = 'The carrier tracking tool throws, so the whole run fails.';

    /**
     * From SDK 1.4.0 the SDK tells the model the tool failed and the run goes on.
     */
    public function description(): string
    {
        return Sdk::recoversFromToolFailures()
            ? 'The carrier tracking tool throws; the assistant is told the call failed and still answers.'
            : $this->description;
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
        return Sdk::recoversFromToolFailures() ? null : CarrierUnavailable::class;
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01track', 'name' => 'track_shipment', 'input' => ['tracking_number' => '1Z999AA10123456784']]],
                ['input_tokens' => 521, 'output_tokens' => 44],
            ),
            ...FakeAnthropic::afterToolFailure(FakeAnthropic::text(
                'I could not reach the carrier just now. Please try again in a few minutes.',
                ['input_tokens' => 603, 'output_tokens' => 27],
            )),
        ]);

        (new SupportAssistant([new TrackShipment]))->prompt('Where is parcel 1Z999AA10123456784 right now?');
    }
}
