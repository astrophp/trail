<?php

namespace Astro\Trail\Tests\Fixtures\Agents;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Promptable;
use Stringable;

/**
 * An agent that must answer with {"answer": string}.
 */
class StructuredAgent implements Agent, HasStructuredOutput, HasTools
{
    use Promptable;

    /**
     * @param  array<int, mixed>  $tools
     */
    public function __construct(protected array $tools = []) {}

    public function instructions(): Stringable|string
    {
        return 'You answer with structured data.';
    }

    public function tools(): iterable
    {
        return $this->tools;
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'answer' => $schema->string()->required(),
        ];
    }
}
