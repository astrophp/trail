<?php

namespace Astro\Trail\Tests\Fixtures\Tools;

use Closure;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Concerns\InteractsWithApprovals;
use Laravel\Ai\Contracts\Approvable;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * A tool that always asks for approval before it runs.
 */
class ApprovalTool implements Approvable, Tool
{
    use InteractsWithApprovals;

    /**
     * @param  (Closure(Request): (Stringable|string))|null  $handler
     */
    public function __construct(protected string $name = 'delete_records', protected ?Closure $handler = null) {}

    public function name(): string
    {
        return $this->name;
    }

    public function description(): Stringable|string
    {
        return 'Does something that needs approval.';
    }

    public function handle(Request $request): Stringable|string
    {
        return $this->handler ? ($this->handler)($request) : 'Deleted '.($request['table'] ?? 'nothing');
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'table' => $schema->string(),
        ];
    }
}
