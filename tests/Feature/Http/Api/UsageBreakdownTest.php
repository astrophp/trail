<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Queries\UsageQuery;
use Astro\Trail\Tests\Fixtures\Http\AgentRows;
use Astro\Trail\Tests\Fixtures\Http\UsageRows;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:00:00');
});

afterEach(function () {
    Carbon::setTestNow();
    $this->app['env'] = 'testing';
});

/**
 * @return array<string, mixed>
 */
function usageBreakdownAt(mixed $test, string $query = ''): array
{
    return $test->getJson('/trail/api/usage/breakdown'.($query === '' ? '' : '?'.$query))->assertOk()->json();
}

/**
 * @return list<string> the names of the rows of a request, provider and model joined by a slash
 */
function usageNamesAt(mixed $test, string $query = ''): array
{
    return array_map(fn (array $row) => $row['agent'] ?? $row['provider'].(isset($row['model']) ? '/'.$row['model'] : ''), usageBreakdownAt($test, $query)['data']);
}

/**
 * @return array<string, mixed>
 */
function usageTokens(string $state, ?int $input, ?int $output, ?int $total, ?int $cacheRead = null, ?int $cacheWrite = null, ?int $reasoning = null): array
{
    return ['state' => $state, 'input_tokens' => $input, 'output_tokens' => $output, 'cache_read_tokens' => $cacheRead, 'cache_write_tokens' => $cacheWrite, 'reasoning_tokens' => $reasoning, 'total_tokens' => $total];
}

/**
 * @param  array<string, mixed>  $usage
 * @param  array<string, mixed>  $cost
 * @return array<string, mixed>
 */
function usageModelRow(string $provider, string $model, int $steps, int $runs, array $usage, array $cost, int $reported, int $unpriced, ?int $unpricedTokens): array
{
    return [
        'provider' => $provider, 'model' => $model, 'steps' => $steps, 'runs' => $runs, 'usage' => $usage, 'cost' => $cost,
        'coverage' => ['reported_steps' => $reported, 'unpriced_steps' => $unpriced, 'unpriced_tokens' => $unpricedTokens],
        'filters' => ['provider' => $provider, 'model' => $model],
    ];
}

/**
 * @param  array<string, mixed>  $usage
 * @param  array<string, mixed>  $cost
 * @return array<string, mixed>
 */
function usageAgentRow(string $agent, int $steps, int $runs, array $usage, array $cost, int $reported, int $unpriced, ?int $unpricedTokens): array
{
    return [
        'agent' => $agent, 'steps' => $steps, 'runs' => $runs, 'usage' => $usage, 'cost' => $cost,
        'coverage' => ['reported_steps' => $reported, 'unpriced_steps' => $unpriced, 'unpriced_tokens' => $unpricedTokens],
        'filters' => ['agent' => $agent],
    ];
}

describe('by model', function () {
    it('breaks down every model with its usage, its cost and how much of it is known', function () {
        UsageRows::dataset();

        $body = usageBreakdownAt($this);

        expect($body['by'])->toBe('model')
            ->and($body['pagination'])->toBe(['page' => 1, 'per_page' => 25, 'total' => 8, 'last_page' => 1])
            ->and($body['row_limit'])->toBe(['limit' => 1000, 'truncated' => false])
            ->and($body['range'])->toBe(['preset' => '24h', 'from' => '2026-01-01T12:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z'])
            ->and($body['data'])->toBe([
                // A run is still running: pending, with what has been recorded so far. A sub-agent's step is a step of the run.
                usageModelRow('openai', 'gpt-5', 5, 3, usageTokens('pending', 311, 61, 372, 20, 7, 5), ['state' => 'pending', 'amount' => 0.0311], 4, 0, 0),
                // One step was not priced: the amount covers the others. A step left running past the cutoff is not pending.
                usageModelRow('anthropic', 'claude-sonnet', 3, 3, usageTokens('reported', 57, 5, 62), ['state' => 'partial', 'amount' => 0.007], 3, 1, 55),
                usageModelRow('openai', 'edge-in', 1, 1, usageTokens('reported', 2, null, 2), ['state' => 'estimated', 'amount' => 0.0002], 1, 0, 0),
                usageModelRow('openai', 'text-embedding-3-small', 1, 1, usageTokens('reported', 7, null, 7), ['state' => 'estimated', 'amount' => 0.0001], 1, 0, 0),
                // A rate of 0 is a price: the amount is 0 (sent as the number 0) and it is estimated.
                usageModelRow('openai', 'free-model', 1, 1, usageTokens('reported', 1000, 100, 1100), ['state' => 'estimated', 'amount' => 0], 1, 0, 0),
                // Cache and reasoning tokens only: the total and the tokens of the unpriced step are unknown.
                usageModelRow('openai', 'o3', 1, 1, usageTokens('reported', null, null, null, 5, null, 30), ['state' => 'unpriced', 'amount' => null], 1, 1, null),
                // A streamed step with output tokens only, and a step that reported nothing.
                usageModelRow('openai', 'gpt-5-mini', 2, 2, usageTokens('reported', null, 40, 40), ['state' => 'unpriced', 'amount' => null], 1, 1, 40),
                // Only an agent span asked for it: a row with no steps and nothing to price.
                usageModelRow('anthropic', 'claude-opus', 0, 1, usageTokens('not_reported', null, null, null), ['state' => 'not_captured', 'amount' => null], 0, 0, 0),
            ]);
    });

    it('leaves a step without its provider or its model out of every row', function () {
        UsageRows::dataset();

        $models = usageNamesAt($this, 'per_page=100');

        expect($models)->toHaveCount(8)
            ->and(array_filter($models, fn (string $name) => str_starts_with($name, 'acme') || str_starts_with($name, '/')))->toBe([]);
    });

    it('does not make a pending row of a step left running past the cutoff', function () {
        UsageRows::dataset();

        $rows = array_column(usageBreakdownAt($this)['data'], null, 'model');

        expect($rows['gpt-5']['usage']['state'])->toBe('pending')
            ->and($rows['gpt-5']['cost']['state'])->toBe('pending')
            ->and($rows['claude-sonnet']['usage']['state'])->toBe('reported')
            ->and($rows['claude-sonnet']['cost']['state'])->toBe('partial');
    });

    it('is the model row of the agent breakdown for the agent, with its coverage added', function (string $agent, string $window) {
        UsageRows::dataset();

        // Only the runs of this agent started in the window, so the two endpoints read the same runs.
        $rows = usageBreakdownAt($this, "{$window}&per_page=100")['data'];
        $models = $this->getJson('/trail/api/agents/breakdown?name='.$agent.'&'.$window)->assertOk()->json('data.models');

        expect($models)->not->toBe([])->and($rows)->toHaveCount(count($models));

        foreach ($models as $model) {
            $row = collect($rows)->firstWhere('model', $model['model']);

            expect(array_diff_key($row, ['coverage' => 0, 'filters' => 0]))->toBe(array_diff_key($model, ['filters' => 0]), $model['model'])
                ->and(array_keys($row))->toBe(['provider', 'model', 'steps', 'runs', 'usage', 'cost', 'coverage', 'filters'])
                ->and($row['filters'])->toBe(['provider' => $model['provider'], 'model' => $model['model']]);
        }
    })->with([
        'Alpha' => ['Alpha', 'from=2026-01-02T10:00:00Z&to=2026-01-02T10:30:00Z'],
        'Host' => ['Host', 'from=2026-01-02T10:30:00Z&to=2026-01-02T10:31:00Z'],
        'Beta' => ['Beta', 'from=2026-01-02T09:00:00Z&to=2026-01-02T09:01:00Z'],
    ]);

    it('keeps the key names of a row of every view', function () {
        UsageRows::dataset();

        expect(array_keys(usageBreakdownAt($this, 'by=model')['data'][0]))->toBe(['provider', 'model', 'steps', 'runs', 'usage', 'cost', 'coverage', 'filters'])
            ->and(array_keys(usageBreakdownAt($this, 'by=provider')['data'][0]))->toBe(['provider', 'steps', 'runs', 'usage', 'cost', 'coverage', 'filters'])
            ->and(array_keys(usageBreakdownAt($this, 'by=agent')['data'][0]))->toBe(['agent', 'steps', 'runs', 'usage', 'cost', 'coverage', 'filters']);
    });
});

describe('a run recorded without a summary', function () {
    it('is in no model and no provider row, and adds no steps to its agent', function () {
        // The spans are there and the per-run summary is not, as for a run recorded before the summary existed.
        $run = Rows::trace(['name' => 'Old', 'status' => Status::Completed, 'started_at' => '2026-01-02 10:00:00']);
        Rows::span($run, ['type' => 'step', 'provider' => 'openai', 'model' => 'gpt-5', 'input_tokens' => 5]);

        expect(usageBreakdownAt($this)['data'])->toBe([])
            ->and(usageBreakdownAt($this, 'by=provider')['data'])->toBe([])
            ->and(usageBreakdownAt($this, 'by=agent')['data'])->toBe([
                usageAgentRow('Old', 0, 1, usageTokens('not_reported', null, null, null), ['state' => 'not_captured', 'amount' => null], 0, 0, 0),
            ]);
    });
});

describe('a run stored without a summary but with a cost', function () {
    it('counts in its agent\'s runs, usage and cost and adds no steps or coverage', function () {
        $id = UsageRows::run('Old', '2026-01-02 10:00:00', [UsageRows::step('openai', 'gpt-5', ['inputTokens' => 5])]);
        DB::table('trail_trace_models')->where('trace_id', $id)->delete();

        expect(usageBreakdownAt($this, 'by=agent')['data'])->toBe([
            usageAgentRow('Old', 0, 1, usageTokens('reported', 5, null, 5), ['state' => 'unpriced', 'amount' => null], 0, 0, 0),
        ]);
    });
});

describe('by provider', function () {
    it('breaks down every provider, a step without a model included', function () {
        UsageRows::dataset();

        $body = usageBreakdownAt($this, 'by=provider');

        expect($body['by'])->toBe('provider')
            ->and($body['pagination'])->toBe(['page' => 1, 'per_page' => 25, 'total' => 3, 'last_page' => 1])
            ->and($body['data'])->toBe([
                [
                    'provider' => 'openai', 'steps' => 11, 'runs' => 7,
                    'usage' => usageTokens('pending', 1320, 201, 1521, 25, 7, 35), 'cost' => ['state' => 'pending', 'amount' => 0.0314],
                    'coverage' => ['reported_steps' => 9, 'unpriced_steps' => 2, 'unpriced_tokens' => 40],
                    'filters' => ['provider' => 'openai'],
                ],
                [
                    'provider' => 'anthropic', 'steps' => 3, 'runs' => 4,
                    'usage' => usageTokens('reported', 57, 5, 62), 'cost' => ['state' => 'partial', 'amount' => 0.007],
                    'coverage' => ['reported_steps' => 3, 'unpriced_steps' => 1, 'unpriced_tokens' => 55],
                    'filters' => ['provider' => 'anthropic'],
                ],
                // The step has a provider and no model: it is in this view and in no model row.
                [
                    'provider' => 'acme', 'steps' => 1, 'runs' => 1,
                    'usage' => usageTokens('reported', 6, null, 6), 'cost' => ['state' => 'unpriced', 'amount' => null],
                    'coverage' => ['reported_steps' => 1, 'unpriced_steps' => 1, 'unpriced_tokens' => 6],
                    'filters' => ['provider' => 'acme'],
                ],
            ]);
    });

    it('counts a run once for a provider that has several models in it', function () {
        UsageRows::dataset();

        $rows = array_column(usageBreakdownAt($this, 'by=provider')['data'], null, 'provider');

        // Run 1 used three openai models, run 3 two; each is one run of the provider.
        expect($rows['openai']['runs'])->toBe(7);
    });
});

describe('by agent', function () {
    it('breaks down every top-level agent from its runs and the steps of its runs', function () {
        UsageRows::dataset();

        $body = usageBreakdownAt($this, 'by=agent');

        expect($body['by'])->toBe('agent')
            ->and($body['pagination'])->toBe(['page' => 1, 'per_page' => 25, 'total' => 11, 'last_page' => 1])
            ->and($body['data'])->toBe([
                // One run is running: pending. Its steps are those of both runs and of the sub-agent.
                usageAgentRow('Alpha', 6, 2, usageTokens('pending', 360, 66, 426, 20, 3, 2), ['state' => 'pending', 'amount' => 0.031], 4, 1, 55),
                usageAgentRow('Host', 1, 1, usageTokens('reported', 4, null, 4), ['state' => 'estimated', 'amount' => 0.004], 1, 0, 0),
                // A run left running past the cutoff is not running.
                usageAgentRow('Delta', 1, 1, usageTokens('reported', 3, null, 3), ['state' => 'estimated', 'amount' => 0.003], 1, 0, 0),
                usageAgentRow('Orphan', 2, 1, usageTokens('reported', 14, null, 14), ['state' => 'partial', 'amount' => 0.0008], 2, 1, 6),
                usageAgentRow('Edge', 1, 1, usageTokens('reported', 2, null, 2), ['state' => 'estimated', 'amount' => 0.0002], 1, 0, 0),
                usageAgentRow('Embedder', 1, 1, usageTokens('reported', 7, null, 7), ['state' => 'estimated', 'amount' => 0.0001], 1, 0, 0),
                usageAgentRow('Beta', 2, 1, usageTokens('reported', 1001, 100, 1101, null, 4, 3), ['state' => 'estimated', 'amount' => 0.0001], 2, 0, 0),
                usageAgentRow('Streamer', 1, 1, usageTokens('reported', null, 40, 40), ['state' => 'unpriced', 'amount' => null], 1, 1, 40),
                usageAgentRow('Reasoner', 1, 1, usageTokens('reported', null, null, null, 5, null, 30), ['state' => 'unpriced', 'amount' => null], 1, 1, null),
                // No model row at all, and one whose only model was asked for and never called: no steps, coverage of zeros.
                usageAgentRow('Bare', 0, 1, usageTokens('not_reported', null, null, null), ['state' => 'not_captured', 'amount' => null], 0, 0, 0),
                usageAgentRow('Askonly', 0, 1, usageTokens('not_reported', null, null, null), ['state' => 'not_captured', 'amount' => null], 0, 0, 0),
            ]);
    });

    it('gives each agent the usage and the cost of its top-level figures in the agents list', function () {
        UsageRows::dataset();

        $rows = usageBreakdownAt($this, 'by=agent&per_page=100')['data'];
        $agents = array_column($this->getJson('/trail/api/agents?per_page=100')->assertOk()->json('data'), null, 'name');

        expect($rows)->toHaveCount(11)->and($agents)->toHaveCount(11);

        foreach ($rows as $row) {
            expect($row['usage'])->toBe($agents[$row['agent']]['top_level']['usage'], $row['agent'])
                ->and($row['cost'])->toBe($agents[$row['agent']]['top_level']['cost'], $row['agent'])
                ->and($row['runs'])->toBe($agents[$row['agent']]['top_level']['runs']['all'], $row['agent']);
        }
    });
});

describe('sorting', function () {
    it('orders the models', function (string $query, array $names) {
        UsageRows::dataset();

        expect(usageNamesAt($this, $query))->toBe($names);
    })->with([
        // Rows without an amount come last in both directions, and equal ones are ordered by name in the direction of the sort.
        'default' => ['', ['openai/gpt-5', 'anthropic/claude-sonnet', 'openai/edge-in', 'openai/text-embedding-3-small', 'openai/free-model', 'openai/o3', 'openai/gpt-5-mini', 'anthropic/claude-opus']],
        '-cost' => ['sort=-cost', ['openai/gpt-5', 'anthropic/claude-sonnet', 'openai/edge-in', 'openai/text-embedding-3-small', 'openai/free-model', 'openai/o3', 'openai/gpt-5-mini', 'anthropic/claude-opus']],
        'cost' => ['sort=cost', ['openai/free-model', 'openai/text-embedding-3-small', 'openai/edge-in', 'anthropic/claude-sonnet', 'openai/gpt-5', 'anthropic/claude-opus', 'openai/gpt-5-mini', 'openai/o3']],
        '-tokens' => ['sort=-tokens', ['openai/free-model', 'openai/gpt-5', 'anthropic/claude-sonnet', 'openai/gpt-5-mini', 'openai/text-embedding-3-small', 'openai/edge-in', 'openai/o3', 'anthropic/claude-opus']],
        'tokens' => ['sort=tokens', ['openai/edge-in', 'openai/text-embedding-3-small', 'openai/gpt-5-mini', 'anthropic/claude-sonnet', 'openai/gpt-5', 'openai/free-model', 'anthropic/claude-opus', 'openai/o3']],
        '-runs' => ['sort=-runs', ['openai/gpt-5', 'anthropic/claude-sonnet', 'openai/gpt-5-mini', 'openai/text-embedding-3-small', 'openai/o3', 'openai/free-model', 'openai/edge-in', 'anthropic/claude-opus']],
        'runs' => ['sort=runs', ['anthropic/claude-opus', 'openai/edge-in', 'openai/free-model', 'openai/o3', 'openai/text-embedding-3-small', 'openai/gpt-5-mini', 'anthropic/claude-sonnet', 'openai/gpt-5']],
        'name' => ['sort=name', ['anthropic/claude-opus', 'anthropic/claude-sonnet', 'openai/edge-in', 'openai/free-model', 'openai/gpt-5', 'openai/gpt-5-mini', 'openai/o3', 'openai/text-embedding-3-small']],
        '-name' => ['sort=-name', ['openai/text-embedding-3-small', 'openai/o3', 'openai/gpt-5-mini', 'openai/gpt-5', 'openai/free-model', 'openai/edge-in', 'anthropic/claude-sonnet', 'anthropic/claude-opus']],
    ]);

    it('orders the providers', function (string $query, array $names) {
        UsageRows::dataset();

        expect(usageNamesAt($this, 'by=provider&'.$query))->toBe($names);
    })->with([
        '-cost' => ['sort=-cost', ['openai', 'anthropic', 'acme']],
        'cost' => ['sort=cost', ['anthropic', 'openai', 'acme']],
        '-tokens' => ['sort=-tokens', ['openai', 'anthropic', 'acme']],
        'tokens' => ['sort=tokens', ['acme', 'anthropic', 'openai']],
        '-runs' => ['sort=-runs', ['openai', 'anthropic', 'acme']],
        'runs' => ['sort=runs', ['acme', 'anthropic', 'openai']],
        'name' => ['sort=name', ['acme', 'anthropic', 'openai']],
        '-name' => ['sort=-name', ['openai', 'anthropic', 'acme']],
    ]);

    it('orders providers of equal runs by name in the direction of the sort', function () {
        foreach (['b', 'a', 'c'] as $provider) {
            UsageRows::run('X'.$provider, '2026-01-02 10:00:00', [UsageRows::step($provider, 'm')]);
        }

        expect(usageNamesAt($this, 'by=provider&sort=-runs'))->toBe(['c', 'b', 'a'])
            ->and(usageNamesAt($this, 'by=provider&sort=runs'))->toBe(['a', 'b', 'c']);
    });

    it('orders the agents', function (string $query, array $names) {
        UsageRows::dataset();

        expect(usageNamesAt($this, 'by=agent&'.$query))->toBe($names);
    })->with([
        // Embedder and Beta cost the same, and so do the four without an amount.
        '-cost' => ['sort=-cost', ['Alpha', 'Host', 'Delta', 'Orphan', 'Edge', 'Embedder', 'Beta', 'Streamer', 'Reasoner', 'Bare', 'Askonly']],
        'cost' => ['sort=cost', ['Beta', 'Embedder', 'Edge', 'Orphan', 'Delta', 'Host', 'Alpha', 'Askonly', 'Bare', 'Reasoner', 'Streamer']],
        '-tokens' => ['sort=-tokens', ['Beta', 'Alpha', 'Streamer', 'Orphan', 'Embedder', 'Host', 'Delta', 'Edge', 'Reasoner', 'Bare', 'Askonly']],
        'tokens' => ['sort=tokens', ['Edge', 'Delta', 'Host', 'Embedder', 'Orphan', 'Streamer', 'Alpha', 'Beta', 'Askonly', 'Bare', 'Reasoner']],
        '-runs' => ['sort=-runs', ['Alpha', 'Streamer', 'Reasoner', 'Orphan', 'Host', 'Embedder', 'Edge', 'Delta', 'Beta', 'Bare', 'Askonly']],
        'runs' => ['sort=runs', ['Askonly', 'Bare', 'Beta', 'Delta', 'Edge', 'Embedder', 'Host', 'Orphan', 'Reasoner', 'Streamer', 'Alpha']],
        'name' => ['sort=name', ['Alpha', 'Askonly', 'Bare', 'Beta', 'Delta', 'Edge', 'Embedder', 'Host', 'Orphan', 'Reasoner', 'Streamer']],
        '-name' => ['sort=-name', ['Streamer', 'Reasoner', 'Orphan', 'Host', 'Embedder', 'Edge', 'Delta', 'Beta', 'Bare', 'Askonly', 'Alpha']],
    ]);

    it('puts a zero amount before an unknown one in both directions', function () {
        UsageRows::dataset();

        // free-model is priced at nothing: it has an amount of 0, which is not a missing one.
        $ascending = usageNamesAt($this, 'sort=cost');
        $descending = usageNamesAt($this, 'sort=-cost');

        expect(array_search('openai/free-model', $ascending, true))->toBe(0)
            ->and(array_search('openai/free-model', $descending, true))->toBe(4);
    });
});

describe('paging', function () {
    it('pages the rows and repeats none', function () {
        UsageRows::dataset();

        $pages = array_map(fn (int $page) => usageBreakdownAt($this, "per_page=3&page={$page}"), [1, 2, 3]);

        expect(array_map(fn (array $body) => array_column($body['data'], 'model'), $pages))->toBe([
            ['gpt-5', 'claude-sonnet', 'edge-in'],
            ['text-embedding-3-small', 'free-model', 'o3'],
            ['gpt-5-mini', 'claude-opus'],
        ])
            ->and($pages[2]['pagination'])->toBe(['page' => 3, 'per_page' => 3, 'total' => 8, 'last_page' => 3]);
    });

    it('answers a page past the end with no rows and the same totals', function () {
        UsageRows::dataset();

        $body = usageBreakdownAt($this, 'per_page=3&page=4');

        expect($body['data'])->toBe([])
            ->and($body['pagination'])->toBe(['page' => 4, 'per_page' => 3, 'total' => 8, 'last_page' => 3])
            ->and($body['row_limit'])->toBe(['limit' => 1000, 'truncated' => false]);
    });

    it('clamps the page size between 1 and 100', function () {
        UsageRows::dataset();

        expect(usageBreakdownAt($this, 'per_page=0')['pagination'])->toBe(['page' => 1, 'per_page' => 1, 'total' => 8, 'last_page' => 8])
            ->and(usageBreakdownAt($this, 'per_page=-5')['pagination']['per_page'])->toBe(1)
            ->and(usageBreakdownAt($this, 'per_page=1000')['pagination'])->toBe(['page' => 1, 'per_page' => 100, 'total' => 8, 'last_page' => 1]);
    });

    it('treats an empty parameter as an absent one', function () {
        UsageRows::dataset();

        expect(usageBreakdownAt($this, 'by=&sort=&page=&per_page=')['pagination'])->toBe(['page' => 1, 'per_page' => 25, 'total' => 8, 'last_page' => 1]);
    });

    it('has no rows and one page for an empty range', function (string $by) {
        UsageRows::dataset();

        $body = usageBreakdownAt($this, "by={$by}&from=2025-12-01T00:00:00Z&to=2025-12-02T00:00:00Z");

        expect($body['data'])->toBe([])
            ->and($body['pagination'])->toBe(['page' => 1, 'per_page' => 25, 'total' => 0, 'last_page' => 1])
            ->and($body['row_limit'])->toBe(['limit' => 1000, 'truncated' => false]);
    })->with(['model', 'provider', 'agent']);
});

describe('the row limit', function () {
    it('reads at most the limit of groups, the ones in most runs, and says so', function (string $by, int $limit, array $names) {
        $this->app->bind(UsageQuery::class, fn () => new UsageQuery($limit));
        UsageRows::dataset();

        $body = usageBreakdownAt($this, "by={$by}&sort=name&per_page=100");

        expect(array_column($body['data'], $by === 'agent' ? 'agent' : ($by === 'provider' ? 'provider' : 'model')))->toBe($names)
            ->and($body['pagination']['total'])->toBe($limit)
            ->and($body['row_limit'])->toBe(['limit' => $limit, 'truncated' => true]);
    })->with([
        // gpt-5 and claude-sonnet are in three runs, gpt-5-mini in two, then the first by name of those in one.
        'models' => ['model', 4, ['claude-opus', 'claude-sonnet', 'gpt-5', 'gpt-5-mini']],
        'providers' => ['provider', 2, ['anthropic', 'openai']],
        // Alpha has two runs; of the single-run agents, the first by name.
        'agents' => ['agent', 3, ['Alpha', 'Askonly', 'Bare']],
    ]);

    it('reads the groups of equal runs in the database\'s order of their names', function () {
        $this->app->bind(UsageQuery::class, fn () => new UsageQuery(2));

        foreach (['beta', 'Alpha', 'alpha2', 'Zed'] as $n => $model) {
            UsageRows::run('Agent'.$n, '2026-01-02 10:00:00', [UsageRows::step('p', $model, ['inputTokens' => 1, 'cost' => 0.001])]);
        }

        $body = usageBreakdownAt($this, 'sort=name');
        $expected = ['sqlite' => ['Alpha', 'Zed'], 'mysql' => ['Alpha', 'alpha2'], 'pgsql' => ['Alpha', 'alpha2']];

        // Byte order puts Zed before alpha2; a case-insensitive order does not. The database chose.
        expect(array_column($body['data'], 'model'))->toBe($expected[DB::connection()->getDriverName()])
            ->and($body['row_limit'])->toBe(['limit' => 2, 'truncated' => true]);
    });

    it('is not truncated when the groups fill the limit exactly', function (string $by, int $groups) {
        $this->app->bind(UsageQuery::class, fn () => new UsageQuery($groups));
        UsageRows::dataset();

        $body = usageBreakdownAt($this, "by={$by}&per_page=100");

        expect($body['row_limit'])->toBe(['limit' => $groups, 'truncated' => false])
            ->and($body['pagination']['total'])->toBe($groups)
            ->and($body['data'])->toHaveCount($groups);
    })->with([['model', 8], ['provider', 3], ['agent', 11]]);

    it('is truncated one group over the limit, and says how many it read', function (string $by, int $groups) {
        $this->app->bind(UsageQuery::class, fn () => new UsageQuery($groups - 1));
        UsageRows::dataset();

        $body = usageBreakdownAt($this, "by={$by}&per_page=100");

        expect($body['row_limit'])->toBe(['limit' => $groups - 1, 'truncated' => true])
            ->and($body['pagination']['total'])->toBe($groups - 1)
            ->and($body['data'])->toHaveCount($groups - 1);
    })->with([['model', 8], ['provider', 3], ['agent', 11]]);
});

describe('the time range', function () {
    it('includes the runs that start where the range starts and leaves out those that start where it ends', function () {
        UsageRows::dataset();

        $models = usageNamesAt($this, 'from=2026-01-01T12:00:00Z&to=2026-01-02T12:00:00Z&per_page=100');

        expect($models)->toContain('openai/edge-in')
            ->and($models)->not->toContain('openai/edge-out')
            ->and(usageBreakdownAt($this, 'from=2026-01-01T12:00:00Z&to=2026-01-02T12:00:00Z')['data'])->toHaveCount(8);

        // The run before the range used 999 tokens of gpt-5; nothing of it is in the sum.
        $gpt5 = array_column(usageBreakdownAt($this, 'from=2026-01-01T12:00:00Z&to=2026-01-02T12:00:00Z')['data'], null, 'model')['gpt-5'];
        expect($gpt5['usage']['input_tokens'])->toBe(311)->and($gpt5['runs'])->toBe(3);
    });

    it('reads the window of an explicit range, from included and to excluded', function () {
        UsageRows::dataset();

        // Run 1 starts at 10:00 and the Host run at 10:30.
        $rows = array_column(usageBreakdownAt($this, 'from=2026-01-02T10:00:00Z&to=2026-01-02T10:30:00Z')['data'], null, 'model');

        expect(array_keys($rows))->toBe(['gpt-5', 'gpt-5-mini', 'claude-sonnet'])
            ->and([$rows['gpt-5']['steps'], $rows['gpt-5']['runs']])->toBe([3, 1])
            ->and([$rows['claude-sonnet']['steps'], $rows['claude-sonnet']['runs']])->toBe([1, 1])
            ->and($rows['gpt-5']['usage']['state'])->toBe('reported')
            ->and($rows['gpt-5']['cost'])->toBe(['state' => 'estimated', 'amount' => 0.031]);
    });

    it('reads the preset ranges', function (string $range, int $alphaRuns, int $agents) {
        UsageRows::dataset();

        $body = usageBreakdownAt($this, "by=agent&sort=name&range={$range}");

        expect($body['data'][0]['agent'])->toBe('Alpha')
            ->and($body['data'][0]['runs'])->toBe($alphaRuns)
            ->and($body['pagination']['total'])->toBe($agents)
            ->and($body['range']['preset'])->toBe($range);
    })->with([
        // The hour before the clock holds the run that started at 11:00, on its edge; the week holds the run before the day.
        ['1h', 1, 1],
        ['24h', 2, 11],
        ['7d', 3, 11],
    ]);
});

describe('what a row stands for on the runs list', function () {
    it('has as many runs as the list returns for the row\'s filters, for every row of every view', function (string $range, int $models, int $providers, int $agents) {
        UsageRows::dataset();

        foreach (['model' => $models, 'provider' => $providers, 'agent' => $agents] as $by => $count) {
            $rows = usageBreakdownAt($this, "by={$by}&per_page=100&{$range}")['data'];

            // A loop over nothing, or over one row, would prove nothing.
            expect($rows)->toHaveCount($count);

            foreach ($rows as $row) {
                $total = $this->getJson('/trail/api/traces?'.http_build_query($row['filters']).'&'.$range)->assertOk()->json('pagination.total');

                expect($row['runs'])->toBe($total, $by.' '.json_encode($row['filters']));
            }
        }
    })->with([
        ['range=24h', 8, 3, 11],
        ['range=7d', 8, 3, 11],
        // Runs 1, 3 and 4: Alpha, Beta and Host.
        ['from=2026-01-02T09:00:00Z&to=2026-01-02T11:00:00Z', 4, 2, 3],
    ]);
});

describe('names the database compares loosely', function () {
    /** A run of Spell and a run of SPELL that use one model under two spellings, one of them in both. */
    $spelling = function () {
        UsageRows::run('Spell', '2026-01-02 10:00:00', [
            UsageRows::step('openai', 'gpt-5', ['inputTokens' => 1, 'cost' => 0.001]),
            UsageRows::step('openai', 'GPT-5', ['inputTokens' => 2, 'cost' => 0.002]),
        ]);
        UsageRows::run('SPELL', '2026-01-02 11:00:00', [UsageRows::step('openai', 'GPT-5', ['inputTokens' => 4, 'cost' => 0.004])]);
    };

    it('counts two spellings of a model as one row, in a run and across runs, as the list does', function () use ($spelling) {
        $spelling();

        $models = usageBreakdownAt($this)['data'];

        expect($models)->toHaveCount(1)
            ->and([$models[0]['runs'], $models[0]['steps']])->toBe([2, 3])
            ->and($models[0]['usage']['input_tokens'])->toBe(7)
            ->and($models[0]['cost'])->toBe(['state' => 'estimated', 'amount' => 0.007])
            ->and(strtolower($models[0]['model']))->toBe('gpt-5');

        foreach (['gpt-5', 'GPT-5'] as $spelled) {
            expect($this->getJson('/trail/api/traces?provider=openai&model='.$spelled)->assertOk()->json('pagination.total'))->toBe(2);
        }

        expect(usageBreakdownAt($this, 'by=provider')['data'][0]['runs'])->toBe(2);
    })->skip(fn () => DB::connection()->getDriverName() !== 'mysql', 'only MySQL compares the two spellings as one');

    it('counts two spellings of a model as two rows where they are two models', function () use ($spelling) {
        $spelling();

        $rows = array_column(usageBreakdownAt($this)['data'], null, 'model');

        expect(array_keys($rows))->toBe(['GPT-5', 'gpt-5'])
            ->and([$rows['GPT-5']['runs'], $rows['GPT-5']['steps']])->toBe([2, 2])
            ->and([$rows['gpt-5']['runs'], $rows['gpt-5']['steps']])->toBe([1, 1]);

        foreach ($rows as $row) {
            expect($this->getJson('/trail/api/traces?'.http_build_query($row['filters']))->assertOk()->json('pagination.total'))->toBe($row['runs']);
        }

        expect(usageBreakdownAt($this, 'by=provider')['data'][0]['runs'])->toBe(2);
    })->skip(fn () => DB::connection()->getDriverName() === 'mysql', 'MySQL compares the two spellings as one');

    it('counts two spellings of an agent as one row, with the steps of both, matched by the database', function () use ($spelling) {
        $spelling();

        $agents = usageBreakdownAt($this, 'by=agent')['data'];

        expect($agents)->toHaveCount(1)
            ->and(strtolower($agents[0]['agent']))->toBe('spell')
            ->and([$agents[0]['runs'], $agents[0]['steps']])->toBe([2, 3])
            ->and($agents[0]['coverage'])->toBe(['reported_steps' => 3, 'unpriced_steps' => 0, 'unpriced_tokens' => 0])
            ->and($agents[0]['usage']['input_tokens'])->toBe(7);

        foreach (['Spell', 'SPELL'] as $spelled) {
            expect($this->getJson('/trail/api/traces?agent='.$spelled)->assertOk()->json('pagination.total'))->toBe(2);
        }
    })->skip(fn () => DB::connection()->getDriverName() !== 'mysql', 'only MySQL compares the two spellings as one');

    it('counts two spellings of an agent as two rows where they are two agents', function () use ($spelling) {
        $spelling();

        $agents = array_column(usageBreakdownAt($this, 'by=agent&sort=name')['data'], null, 'agent');

        // Equal but for their case, they are ordered by their bytes.
        expect(array_keys($agents))->toBe(['SPELL', 'Spell'])
            ->and([$agents['Spell']['runs'], $agents['Spell']['steps'], $agents['Spell']['usage']['input_tokens']])->toBe([1, 2, 3])
            ->and([$agents['SPELL']['runs'], $agents['SPELL']['steps'], $agents['SPELL']['usage']['input_tokens']])->toBe([1, 1, 4]);
    })->skip(fn () => DB::connection()->getDriverName() === 'mysql', 'MySQL compares the two spellings as one');
});

describe('the statements it runs', function () {
    it('reads one statement for a view, whatever the page and the sort', function (string $query) {
        UsageRows::dataset();

        expect(AgentRows::statements(fn () => usageBreakdownAt($this, $query)))->toHaveCount(1);
    })->with([
        'model' => [''],
        'model page' => ['per_page=1&page=3&sort=-tokens'],
        'provider' => ['by=provider'],
        'provider by name' => ['by=provider&sort=name'],
        'agent' => ['by=agent'],
        'agent by runs' => ['by=agent&sort=runs&per_page=2&page=2'],
        'a range with nothing in it' => ['by=agent&from=2025-12-01T00:00:00Z&to=2025-12-02T00:00:00Z'],
    ]);

    it('reads one statement on an empty database', function () {
        expect(AgentRows::statements(fn () => usageBreakdownAt($this)))->toHaveCount(1)
            ->and(AgentRows::statements(fn () => usageBreakdownAt($this, 'by=agent')))->toHaveCount(1);
    });
});

describe('errors', function () {
    it('answers a 422 for a view or a sort it does not know', function (string $query, string $field) {
        $this->getJson('/trail/api/usage/breakdown?'.$query)->assertUnprocessable()->assertJsonValidationErrors([$field]);
    })->with([
        ['by=tools', 'by'],
        ['by[]=model', 'by'],
        ['by=Model', 'by'],
        ['sort=latency', 'sort'],
        ['sort=--cost', 'sort'],
        ['sort[]=cost', 'sort'],
        ['sort=-', 'sort'],
        ['range=bad', 'range'],
        ['range=24h&from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z', 'range'],
        ['from=2026-01-01T00:00:00Z', 'to'],
        ['from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z', 'from'],
        ['page=0', 'page'],
        ['per_page=ten', 'per_page'],
    ]);

    it('answers a 422 as JSON even when HTML is asked for', function () {
        $this->get('/trail/api/usage/breakdown?by=bad', ['Accept' => 'text/html'])->assertUnprocessable()->assertJsonValidationErrors(['by']);
    });
});

describe('access', function () {
    it('answers a denied request with a JSON 403', function (string $path) {
        $this->app['env'] = 'production';

        $this->get($path, ['Accept' => 'text/html'])->assertForbidden()->assertJsonStructure(['message']);

        Trail::auth(fn () => true);
        $this->get($path, ['Accept' => 'text/html'])->assertOk();

        Trail::auth(fn () => false);
        $this->get($path, ['Accept' => 'text/html'])->assertForbidden();
    })->with(['/trail/api/usage', '/trail/api/usage/breakdown']);

    it('answers a JSON 404 when the dashboard is switched off', function (string $path) {
        config(['trail.dashboard.enabled' => false]);

        $this->get($path, ['Accept' => 'text/html'])->assertNotFound()->assertJsonStructure(['message']);
    })->with(['/trail/api/usage', '/trail/api/usage/breakdown']);
});
