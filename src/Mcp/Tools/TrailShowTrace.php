<?php

namespace Astro\Trail\Mcp\Tools;

use Astro\Trail\Http\Resources\SpanResource;
use Astro\Trail\Http\Resources\TraceDetailResource;
use Astro\Trail\Http\Resources\TraceResource;
use Astro\Trail\Queries\TraceDetail;
use Astro\Trail\Queries\TraceId;
use Astro\Trail\Storage\Models\Span;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Validation\ValidationException;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[IsReadOnly]
class TrailShowTrace extends Tool
{
    protected string $description = 'Inspect one recorded Trail trace and its first spans in execution order. Span payloads are omitted; use the Trail dashboard to inspect captured input and output.';

    public function __construct(private readonly TraceDetail $detail) {}

    public function schema(JsonSchema $schema): array
    {
        return [
            'id' => $schema->string()->description('Exact Trail trace ID.')->required(),
            'span_limit' => $schema->integer()->description('Number of spans to return, from 1 to 100. Defaults to 25.'),
        ];
    }

    public function handle(Request $request): Response
    {
        try {
            $arguments = $request->validate([
                'id' => ['required', 'string', 'max:64'],
                'span_limit' => ['sometimes', 'integer', 'between:1,100'],
            ]);
        } catch (ValidationException $exception) {
            return Response::error(implode(' ', $exception->validator->errors()->all()));
        }

        $id = $arguments['id'] ?? null;

        if (! is_string($id)) {
            return Response::error('A Trail trace ID is required.');
        }

        if (! TraceId::isPossible($id) || ($trace = $this->detail->find($id)) === null) {
            return Response::error('Trail trace not found.');
        }

        $limit = $arguments['span_limit'] ?? 25;
        $limit = is_int($limit) ? $limit : 25;
        $spans = Span::query()->where('trace_id', $trace->id)
            ->orderBy('sequence')->orderBy('id')
            ->limit($limit + 1)->get();
        $truncated = $spans->count() > $limit;
        $resource = new SpanResource($trace->started_at);
        $items = array_map(static function (array $span): array {
            unset($span['input'], $span['output'], $span['metadata']);

            return $span;
        }, $resource->collection($spans->take($limit)));

        return Response::json([
            'trace' => TraceResource::of([$trace])->toArray($trace),
            'detail' => TraceDetailResource::of($trace),
            'spans' => $items,
            'spans_truncated' => $truncated,
        ]);
    }
}
