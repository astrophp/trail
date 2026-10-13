<?php

namespace Astro\Trail\Mcp\Tools;

use Astro\Trail\Http\Resources\TraceResource;
use Astro\Trail\Queries\Page;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Queries\TraceFilters;
use Astro\Trail\Queries\TraceIndex;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Http\Request as HttpRequest;
use Illuminate\Validation\ValidationException;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[IsReadOnly]
class TrailListTraces extends Tool
{
    protected string $description = 'List recent Trail AI agent runs, with status, agent, and text filters. Returns recorded data only; missing usage and costs remain missing.';

    public function __construct(private readonly TraceIndex $index) {}

    public function schema(JsonSchema $schema): array
    {
        return [
            'range' => $schema->string()->description('Time range: 1h, 24h, or 7d. Defaults to 24h.'),
            'status' => $schema->string()->description('Optional status: completed, failed, incomplete, running, or awaiting_approval.'),
            'operation_type' => $schema->string()->description('Optional root operation: agent, embedding, classification, or reranking.'),
            'agent' => $schema->string()->description('Optional agent name or class filter.'),
            'search' => $schema->string()->description('Optional text search across trace IDs, names, prompts, provider, model, conversation, and user IDs.'),
            'limit' => $schema->integer()->description('Number of traces to return, from 1 to 50. Defaults to 10.'),
        ];
    }

    public function handle(Request $request): Response
    {
        try {
            $arguments = $request->validate([
                'range' => ['sometimes', 'string', 'in:1h,24h,7d'],
                'status' => ['sometimes', 'string', 'in:completed,failed,incomplete,running,awaiting_approval'],
                'operation_type' => ['sometimes', 'string', 'in:agent,embedding,classification,reranking'],
                'agent' => ['sometimes', 'string', 'max:255'],
                'search' => ['sometimes', 'string', 'max:200'],
                'limit' => ['sometimes', 'integer', 'between:1,50'],
            ]);

            $httpRequest = HttpRequest::create('/', 'GET', array_intersect_key($arguments, array_flip(['range', 'status', 'agent', 'search', 'operation_type'])));
            $range = TimeRange::fromRequest($httpRequest);
            $filters = TraceFilters::fromRequest($httpRequest);
        } catch (ValidationException $exception) {
            return Response::error(implode(' ', $exception->validator->errors()->all()));
        }

        $limit = $arguments['limit'] ?? 10;
        $limit = is_int($limit) ? $limit : 10;
        $page = new Page(1, $limit);
        $counts = $this->index->statusCounts($range, $filters, null);
        $traces = $this->index->rows($range, $filters, null, $page);
        $summary = array_map(static fn (array $trace): array => array_intersect_key($trace, array_flip([
            'id', 'type', 'name', 'agent_class', 'status', 'issue_kind', 'provider', 'model',
            'duration_ms', 'usage', 'cost', 'span_count', 'conversation_id', 'started_at',
        ])), TraceResource::of($traces)->collection($traces));

        return Response::json([
            'range' => $range->toArray(),
            'total' => $counts[$filters->status === null ? 'all' : $filters->status->value],
            'traces' => $summary,
        ]);
    }
}
