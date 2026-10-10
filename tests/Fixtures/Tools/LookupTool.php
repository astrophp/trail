<?php

namespace Astro\Trail\Tests\Fixtures\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class LookupTool implements Tool
{
    public function name(): string
    {
        return 'lookup';
    }

    public function description(): Stringable|string
    {
        return 'Looks up a value.';
    }

    public function handle(Request $request): Stringable|string
    {
        return 'Result for '.($request['query'] ?? 'nothing');
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'query' => $schema->string()->required(),
        ];
    }
}
