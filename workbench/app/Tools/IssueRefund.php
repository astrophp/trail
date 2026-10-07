<?php

namespace Workbench\App\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Concerns\InteractsWithApprovals;
use Laravel\Ai\Contracts\Approvable;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * Refunds an order. It moves money, so a person has to approve every call. Nothing is refunded
 * here: approving it only returns a confirmation message.
 */
class IssueRefund implements Approvable, Tool
{
    use InteractsWithApprovals;

    public function name(): string
    {
        return 'issue_refund';
    }

    public function description(): Stringable|string
    {
        return 'Refund an order, in full or in part. A person must approve the refund first.';
    }

    public function handle(Request $request): Stringable|string
    {
        return sprintf('Refunded $%s on order %s.', number_format((float) $request['amount'], 2), $request['order_number']);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'order_number' => $schema->string()->required(),
            'amount' => $schema->number()->description('The amount to refund, in dollars.')->required(),
        ];
    }
}
