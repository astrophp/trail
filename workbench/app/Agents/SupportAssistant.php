<?php

namespace Workbench\App\Agents;

use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Promptable;
use Stringable;
use Workbench\App\Tools\CheckInventory;
use Workbench\App\Tools\LookupOrder;

/**
 * Answers customer questions for Northwind Outfitters, an online outdoor-gear shop.
 */
class SupportAssistant implements Agent, HasTools
{
    use Promptable;

    /**
     * @param  array<int, Tool|Agent>|null  $tools  What the assistant can use; its order and stock tools when null.
     */
    public function __construct(protected ?array $tools = null) {}

    public function instructions(): Stringable|string
    {
        return 'You are the support assistant for Northwind Outfitters, an online outdoor-gear shop. '
            .'Be friendly and brief. Look an order up before you talk about it, and hand questions about '
            .'policies to the policy researcher.';
    }

    public function tools(): iterable
    {
        return $this->tools ?? [new LookupOrder, new CheckInventory];
    }
}
