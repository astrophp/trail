<?php

namespace Astro\Trail\Tests\Fixtures\Tools;

use Closure;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * A tool whose handler is a closure supplied by the test, so a test can throw, prompt another
 * agent or generate embeddings from inside a tool call.
 */
class CallbackTool implements Tool
{
    /**
     * @param  Closure(Request): (Stringable|string)  $handler
     */
    public function __construct(protected string $name, protected Closure $handler) {}

    public function name(): string
    {
        return $this->name;
    }

    public function description(): Stringable|string
    {
        return 'Runs a test callback.';
    }

    public function handle(Request $request): Stringable|string
    {
        return ($this->handler)($request);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'query' => $schema->string(),
        ];
    }
}
