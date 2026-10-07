<?php

namespace Workbench\App\Agents;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Attributes\UseCheapestModel;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Promptable;
use Stringable;

/**
 * Sorts an incoming support message into a category and a priority.
 */
#[UseCheapestModel]
class TicketTriage implements Agent, HasStructuredOutput
{
    use Promptable;

    public function instructions(): Stringable|string
    {
        return 'You triage incoming support messages for Northwind Outfitters. '
            .'Pick one category and one priority, and summarise the message in one sentence.';
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'category' => $schema->string()->enum(['order', 'returns', 'product', 'billing', 'other'])->required(),
            'priority' => $schema->string()->enum(['low', 'normal', 'urgent'])->required(),
            'summary' => $schema->string()->required(),
        ];
    }
}
