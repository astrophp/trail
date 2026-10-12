<?php

namespace Astro\Trail\Mcp\Tools;

use Astro\Trail\Http\Resources\SummaryResource;
use Astro\Trail\Http\Resources\UsageResource;
use Astro\Trail\Queries\OverviewQuery;
use Astro\Trail\Queries\Page;
use Astro\Trail\Queries\RunScope;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Queries\UsageFilters;
use Astro\Trail\Queries\UsageQuery;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Http\Request as HttpRequest;
use Illuminate\Validation\ValidationException;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[IsReadOnly]
class TrailUsageSummary extends Tool
{
    protected string $description = 'Summarize recorded Trail token usage and estimated cost, with coverage and top model, provider, or agent groups. Missing usage and unpriced cost are shown explicitly.';

    public function __construct(
        private readonly OverviewQuery $overview,
        private readonly UsageQuery $usage,
    ) {}

    public function schema(JsonSchema $schema): array
    {
        return [
            'range' => $schema->string()->description('Time range: 1h, 24h, or 7d. Defaults to 24h.'),
            'by' => $schema->string()->description('Breakdown by model, provider, or agent. Defaults to model.'),
            'limit' => $schema->integer()->description('Number of groups, from 1 to 20. Defaults to 10.'),
        ];
    }

    public function handle(Request $request): Response
    {
        try {
            $arguments = $request->validate([
                'range' => ['sometimes', 'string', 'in:1h,24h,7d'],
                'by' => ['sometimes', 'string', 'in:model,provider,agent'],
                'limit' => ['sometimes', 'integer', 'between:1,20'],
            ]);

            $httpRequest = HttpRequest::create('/', 'GET', array_intersect_key($arguments, array_flip(['range', 'by'])));
            $range = TimeRange::fromRequest($httpRequest);
            $filters = UsageFilters::fromRequest($httpRequest);
        } catch (ValidationException $exception) {
            return Response::error(implode(' ', $exception->validator->errors()->all()));
        }

        $limit = $arguments['limit'] ?? 10;
        $limit = is_int($limit) ? $limit : 10;
        $page = new Page(1, $limit);
        $summary = SummaryResource::of($this->overview->read($range, RunScope::none())->summary);
        $totals = UsageResource::totals($summary, $this->usage->coverage($range));
        $breakdown = UsageResource::breakdown($this->usage->list($range, $filters, $page), $page);

        return Response::json([
            'range' => $range->toArray(),
            ...$totals,
            'by' => $breakdown['by'],
            'groups' => $breakdown['data'],
            'pagination' => $breakdown['pagination'],
            'row_limit' => $breakdown['row_limit'],
        ]);
    }
}
