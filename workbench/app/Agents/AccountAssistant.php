<?php

namespace Workbench\App\Agents;

use Laravel\Ai\Concerns\RemembersConversations;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\Conversational;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Promptable;
use Stringable;
use Workbench\App\Tools\IssueRefund;
use Workbench\App\Tools\LookupOrder;

/**
 * Helps a signed-in customer with their orders and remembers the conversation, which is what
 * lets a refund wait for a person's approval and be resumed later.
 */
class AccountAssistant implements Agent, Conversational, HasTools
{
    use Promptable, RemembersConversations;

    /**
     * @param  array<int, Tool|Agent>|null  $tools  What the assistant can use; its order and refund tools when null.
     */
    public function __construct(protected ?array $tools = null) {}

    public function instructions(): Stringable|string
    {
        return 'You help signed-in Northwind Outfitters customers with their orders. '
            .'A refund moves money, so ask for it with the refund tool and wait for approval.';
    }

    public function tools(): iterable
    {
        return $this->tools ?? [
            new LookupOrder,
            (new IssueRefund)->requireApproval('Refunds move money and need a person to approve them.'),
        ];
    }
}
