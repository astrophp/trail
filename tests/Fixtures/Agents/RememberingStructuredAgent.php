<?php

namespace Astro\Trail\Tests\Fixtures\Agents;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\HasStructuredOutput;

/**
 * A remembering agent that must answer with {"answer": string}, so its runs can pause for approval.
 */
class RememberingStructuredAgent extends RememberingAgent implements HasStructuredOutput
{
    public function schema(JsonSchema $schema): array
    {
        return [
            'answer' => $schema->string()->required(),
        ];
    }
}
