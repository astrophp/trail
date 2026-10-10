<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Queries\Row;
use Astro\Trail\Queries\RunFigures;

/**
 * The models and tools of an agent as the API sends them: at most a few of each, with how many
 * there are. A row that can be reproduced on the runs list carries the parameters that reproduce
 * it; a row of the delegated runs does not, because the list cannot filter on those.
 */
final class AgentBreakdownResource
{
    /** The most rows of each list. */
    public const LIMIT = 20;

    /**
     * @param  list<object>  $models
     * @param  list<object>  $tools
     * @param  list<object>  $delegatedModels
     * @param  list<object>  $delegatedTools
     * @return array{data: array<string, mixed>, limits: array<string, mixed>}
     */
    public static function of(string $agent, array $models, array $tools, array $delegatedModels, array $delegatedTools): array
    {
        return [
            'data' => [
                'models' => self::models($models, $agent),
                'tools' => self::tools($tools, $agent),
                'delegated' => [
                    'models' => self::models($delegatedModels, null),
                    'tools' => self::tools($delegatedTools, null),
                ],
            ],
            'limits' => [
                'models' => self::limit($models),
                'tools' => self::limit($tools),
                'delegated' => ['models' => self::limit($delegatedModels), 'tools' => self::limit($delegatedTools)],
            ],
        ];
    }

    /**
     * @param  list<object>  $rows
     * @param  ?string  $agent  the name the list is filtered by, null where no filter reproduces the row
     * @return list<array<string, mixed>>
     */
    private static function models(array $rows, ?string $agent): array
    {
        $models = [];

        foreach (array_slice($rows, 0, self::LIMIT) as $row) {
            $sum = fn (string $column): ?int => Row::nullableInt($row, $column);
            $running = Row::int($row, 'running') > 0;

            $model = [
                'provider' => Row::string($row, 'provider'),
                'model' => Row::string($row, 'model'),
                'steps' => Row::int($row, 'calls'),
                'runs' => Row::int($row, 'runs'),
                'usage' => Usage::of($running, $sum('input_tokens'), $sum('output_tokens'), $sum('cache_read_tokens'), $sum('cache_write_tokens'), $sum('reasoning_tokens')),
                'cost' => Cost::of(($cost = Row::nullableFloat($row, 'cost_sum')) === null ? null : round($cost, RunFigures::PLACES), Row::int($row, 'unpriced'), $running),
            ];

            if ($agent !== null) {
                $model['filters'] = ['agent' => $agent, 'provider' => Row::string($row, 'provider'), 'model' => Row::string($row, 'model')];
            }

            $models[] = $model;
        }

        return $models;
    }

    /**
     * @param  list<object>  $rows
     * @return list<array<string, mixed>>
     */
    private static function tools(array $rows, ?string $agent): array
    {
        $tools = [];

        foreach (array_slice($rows, 0, self::LIMIT) as $row) {
            $tool = ['name' => Row::string($row, 'name'), 'calls' => Row::int($row, 'calls'), 'failed' => Row::int($row, 'failed'), 'runs' => Row::int($row, 'runs')];

            if ($agent !== null) {
                $tool['filters'] = ['agent' => $agent, 'tool' => Row::string($row, 'name')];
            }

            $tools[] = $tool;
        }

        return $tools;
    }

    /**
     * @param  list<object>  $rows
     * @return array{limit: int, total: int}
     */
    private static function limit(array $rows): array
    {
        return ['limit' => self::LIMIT, 'total' => count($rows)];
    }
}
