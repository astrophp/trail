<?php

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Queries\AgentIndex;
use Astro\Trail\Queries\OverviewQuery;
use Astro\Trail\Queries\RunScope;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Http\AgentRows;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:00:00');
});

afterEach(function () {
    Carbon::setTestNow();
    config(['app.timezone' => 'UTC']);
    $this->app['env'] = 'testing';
});

/**
 * @return array<string, mixed>
 */
function agentsAt(mixed $test, string $query = ''): array
{
    return $test->getJson('/trail/api/agents'.($query === '' ? '' : '?'.$query))->assertOk()->json();
}

/**
 * @return list<string> the names of the agents a request lists
 */
function agentNamesAt(mixed $test, string $query = ''): array
{
    return array_column(agentsAt($test, $query)['data'], 'name');
}

/**
 * Five agents in the default range (the clock is 2026-01-02 12:00:00, so the range starts at
 * 2026-01-01 12:00:00), each of a different kind:
 *
 * - Alpha: three runs of its own (completed, failed, running), never delegated to. A root agent
 *   span, which has no parent, is not a delegation.
 * - Beta: three runs of its own (completed, incomplete, a running one past the cutoff) and four
 *   delegations: under a tool, under the run's own span, one open past the cutoff and one open
 *   and recent.
 * - Embedder: one embeddings run.
 * - Gamma and Delta: only ever delegated to, Delta by an agent that was itself delegated to.
 *
 * And what must stay out: a run and a delegation before the range, a delegation in a run that
 * started before the range although the span started inside it, and a step and a tool.
 */
function agentDataset(): void
{
    $one = AgentRows::run('Alpha', '2026-01-02 10:00:00', ['id' => 'a1', 'agent_class' => 'Old\\Alpha', 'duration_ms' => 1000, 'input_tokens' => 100, 'output_tokens' => 50, 'cost' => 0.5]);
    AgentRows::run('Alpha', '2026-01-02 11:00:00', ['id' => 'a2', 'status' => Status::Failed, 'duration_ms' => 3000, 'cost' => 0.25, 'unpriced_span_count' => 1]);
    $three = AgentRows::run('Alpha', '2026-01-02 11:50:00', ['id' => 'a3', 'agent_class' => 'App\\Ai\\Alpha', 'status' => Status::Running]);
    AgentRows::span($one, SpanType::Agent, 'Alpha', '2026-01-02 10:00:00', ['id' => 'a1']);
    AgentRows::span($one, SpanType::Step, 'step', '2026-01-02 10:00:00', ['provider' => 'openai', 'model' => 'gpt-5']);

    AgentRows::run('Beta', '2026-01-02 09:00:00', ['id' => 'b1', 'duration_ms' => 500, 'cost' => 0.1]);
    AgentRows::run('Beta', '2026-01-02 08:00:00', ['id' => 'b2', 'status' => Status::Incomplete]);
    AgentRows::run('Beta', '2026-01-02 07:00:00', ['id' => 'b3', 'status' => Status::Running, 'created_at' => Carbon::now()->subHours(3)]);

    AgentRows::run('Embedder', '2026-01-02 06:00:00', ['id' => 'e1', 'type' => SpanType::Embedding, 'cost' => 0.01]);

    $two = Trace::query()->findOrFail('a2');

    AgentRows::span($one, SpanType::Tool, 'search', '2026-01-02 10:00:01', ['id' => 'tool-1']);
    AgentRows::span($one, SpanType::Agent, 'Beta', '2026-01-02 10:00:02', ['id' => 'beta-1', 'parent_id' => 'tool-1']);
    AgentRows::span($one, SpanType::Agent, 'Beta', '2026-01-02 10:00:03', ['id' => 'beta-2', 'parent_id' => 'a1', 'status' => Status::Failed]);
    AgentRows::span($one, SpanType::Tool, 'ask', '2026-01-02 10:00:04', ['id' => 'tool-2', 'parent_id' => 'beta-1']);
    AgentRows::span($one, SpanType::Agent, 'Delta', '2026-01-02 10:40:00', ['id' => 'delta-1', 'parent_id' => 'tool-2']);
    AgentRows::span($three, SpanType::Agent, 'Beta', '2026-01-02 11:51:00', ['id' => 'beta-3', 'parent_id' => 'a3', 'status' => Status::Running, 'created_at' => Carbon::now()->subHours(3)]);
    AgentRows::span($three, SpanType::Agent, 'Beta', '2026-01-02 11:55:00', ['id' => 'beta-4', 'parent_id' => 'a3', 'status' => Status::Running]);
    AgentRows::span($two, SpanType::Tool, 'search', '2026-01-02 11:00:01', ['id' => 'tool-3']);
    AgentRows::span($two, SpanType::Agent, 'Gamma', '2026-01-02 11:00:02', ['id' => 'gamma-1', 'parent_id' => 'tool-3', 'agent_class' => 'App\\Ai\\Gamma']);

    $before = AgentRows::run('Zed', '2026-01-01 11:59:59', ['id' => 'z1']);
    AgentRows::span($before, SpanType::Agent, 'Yankee', '2026-01-02 11:00:00', ['id' => 'yankee-1', 'parent_id' => 'z1']);
    AgentRows::run('Omega', '2025-12-31 20:00:00', ['id' => 'o1']);
}

/** The names of the dataset's agents in the order of each sort, from the figures above. */
function agentOrders(): array
{
    return [
        // Alpha and Beta tie on three runs; a tie is ordered by name in the direction of the sort.
        'runs' => ['Embedder', 'Alpha', 'Beta', 'Delta', 'Gamma'],
        '-runs' => ['Beta', 'Alpha', 'Embedder', 'Gamma', 'Delta'],
        'name' => ['Alpha', 'Beta', 'Delta', 'Embedder', 'Gamma'],
        '-name' => ['Gamma', 'Embedder', 'Delta', 'Beta', 'Alpha'],
        // Alpha 1 of 2, Beta 0 of 3, Embedder 0 of 1; the delegated-only agents have none.
        'error_rate' => ['Beta', 'Embedder', 'Alpha', 'Delta', 'Gamma'],
        '-error_rate' => ['Alpha', 'Embedder', 'Beta', 'Gamma', 'Delta'],
        // Alpha 2000, Beta 500; Embedder has no duration.
        'duration' => ['Beta', 'Alpha', 'Delta', 'Embedder', 'Gamma'],
        '-duration' => ['Alpha', 'Beta', 'Gamma', 'Embedder', 'Delta'],
        // Alpha 0.75, Beta 0.1, Embedder 0.01.
        'cost' => ['Embedder', 'Beta', 'Alpha', 'Delta', 'Gamma'],
        '-cost' => ['Alpha', 'Beta', 'Embedder', 'Gamma', 'Delta'],
        // Beta 11:55 (a delegation), Alpha 11:50, Gamma 11:00, Delta 10:40, Embedder 06:00.
        'last_activity' => ['Embedder', 'Delta', 'Gamma', 'Alpha', 'Beta'],
        '-last_activity' => ['Beta', 'Alpha', 'Gamma', 'Delta', 'Embedder'],
    ];
}

it('lists the agents of the range in the documented shape', function () {
    agentDataset();

    $body = agentsAt($this);
    $byName = array_column($body['data'], null, 'name');

    expect(array_column($body['data'], 'name'))->toBe(['Beta', 'Alpha', 'Embedder', 'Gamma', 'Delta'])
        ->and($body['pagination'])->toBe(['page' => 1, 'per_page' => 25, 'total' => 5, 'last_page' => 1])
        ->and($body['range'])->toBe(['preset' => '24h', 'from' => '2026-01-01T12:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z'])
        ->and($body['agent_limit'])->toBe(['limit' => 1000, 'truncated' => false])
        ->and($byName['Alpha'])->toBe([
            'name' => 'Alpha',
            // The class of the latest run, not of the first.
            'agent_class' => 'App\\Ai\\Alpha',
            'type' => 'agent',
            'top_level' => [
                'runs' => AgentRows::counts(completed: 1, failed: 1, running: 1),
                'error_rate' => ['rate' => 0.5, 'failed' => 1, 'finished' => 2],
                'duration' => ['average_ms' => 2000, 'measured' => 2, 'not_measured' => 1],
                'usage' => [
                    'state' => 'pending', 'input_tokens' => 100, 'output_tokens' => 50, 'cache_read_tokens' => null,
                    'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => 150,
                ],
                'cost' => ['state' => 'pending', 'amount' => 0.75],
                'cost_coverage' => ['unpriced_runs' => 1, 'runs_without_amount' => 1],
                'last_activity_at' => '2026-01-02T11:50:00.000Z',
            ],
            'delegated' => null,
            'last_activity_at' => '2026-01-02T11:50:00.000Z',
            'activity' => [...array_fill(0, 22, 0), 1, 2],
        ]);
});

it('keeps what an agent did as a run of its own apart from the times it was delegated to', function () {
    agentDataset();

    $byName = array_column(agentsAt($this)['data'], null, 'name');

    // Beta: stored incomplete and a running run past the cutoff are both incomplete; neither is running.
    expect($byName['Beta']['top_level']['runs'])->toBe(AgentRows::counts(completed: 1, incomplete: 2))
        ->and($byName['Beta']['top_level']['error_rate'])->toBe(['rate' => 0, 'failed' => 0, 'finished' => 3])
        ->and($byName['Beta']['top_level']['usage']['state'])->toBe('not_reported')
        ->and($byName['Beta']['top_level']['cost'])->toBe(['state' => 'estimated', 'amount' => 0.1])
        ->and($byName['Beta']['top_level']['last_activity_at'])->toBe('2026-01-02T09:00:00.000Z')
        // Four delegations, whatever the parent: a tool, the run's own span, an open span past the cutoff and an open recent one.
        ->and($byName['Beta']['delegated'])->toBe(['all' => 4, 'failed' => 1, 'incomplete' => 1, 'last_activity_at' => '2026-01-02T11:55:00.000Z'])
        // The later of the two.
        ->and($byName['Beta']['last_activity_at'])->toBe('2026-01-02T11:55:00.000Z')
        ->and($byName['Beta']['activity'])->toBe(agentActivity(['2026-01-02 09:00:00' => 1, '2026-01-02 08:00:00' => 1, '2026-01-02 07:00:00' => 1]));
});

/**
 * The hourly buckets of the default range, with the runs that started in each.
 *
 * @param  array<string, int>  $runs  start => runs
 * @return list<int>
 */
function agentActivity(array $runs): array
{
    $buckets = array_fill(0, 24, 0);

    foreach ($runs as $start => $count) {
        $buckets[intdiv(Carbon::parse($start)->getTimestamp() - Carbon::parse('2026-01-01 12:00:00')->getTimestamp(), 3600)] += $count;
    }

    return $buckets;
}

it('has no run of its own for an agent that was only delegated to, and no delegation for one that never was', function () {
    agentDataset();

    $byName = array_column(agentsAt($this)['data'], null, 'name');

    expect($byName['Gamma'])->toBe([
        'name' => 'Gamma',
        'agent_class' => 'App\\Ai\\Gamma',
        'type' => 'agent',
        'top_level' => null,
        'delegated' => ['all' => 1, 'failed' => 0, 'incomplete' => 0, 'last_activity_at' => '2026-01-02T11:00:02.000Z'],
        'last_activity_at' => '2026-01-02T11:00:02.000Z',
        'activity' => array_fill(0, 24, 0),
    ])
        // An agent that delegated to another is no sub-agent itself, and a sub-agent of a sub-agent is one.
        ->and($byName['Delta']['delegated'])->toBe(['all' => 1, 'failed' => 0, 'incomplete' => 0, 'last_activity_at' => '2026-01-02T10:40:00.000Z'])
        ->and($byName['Delta']['top_level'])->toBeNull()
        ->and($byName['Alpha']['delegated'])->toBeNull()
        ->and($byName['Embedder']['delegated'])->toBeNull();
});

it('takes the class and type of the latest run, and of the greatest id when two started together', function () {
    AgentRows::run('Tied', '2026-01-02 10:00:00', ['id' => 'tie-a', 'agent_class' => 'First\\Tied']);
    AgentRows::run('Tied', '2026-01-02 10:00:00', ['id' => 'tie-b', 'agent_class' => 'Second\\Tied', 'type' => SpanType::Embedding]);
    AgentRows::run('Tied', '2026-01-02 09:00:00', ['id' => 'tie-z', 'agent_class' => 'Earlier\\Tied']);

    $agent = agentsAt($this)['data'][0];

    expect($agent['agent_class'])->toBe('Second\\Tied')->and($agent['type'])->toBe('embedding');
});

it('takes the class of the latest delegated span for an agent without runs of its own', function () {
    $run = AgentRows::run('Host', '2026-01-02 10:00:00', ['id' => 'host']);
    AgentRows::span($run, SpanType::Agent, 'Helper', '2026-01-02 10:00:01', ['id' => 'h1', 'parent_id' => 'host', 'agent_class' => 'Old\\Helper']);
    AgentRows::span($run, SpanType::Agent, 'Helper', '2026-01-02 10:00:03', ['id' => 'h3', 'parent_id' => 'host', 'agent_class' => 'New\\Helper']);
    AgentRows::span($run, SpanType::Agent, 'Helper', '2026-01-02 10:00:02', ['id' => 'h2', 'parent_id' => 'host', 'agent_class' => 'Middle\\Helper']);

    $helper = array_column(agentsAt($this)['data'], null, 'name')['Helper'];

    expect($helper['agent_class'])->toBe('New\\Helper')->and($helper['type'])->toBe('agent')->and($helper['delegated']['all'])->toBe(3);
});

it('sorts names without regard to case', function () {
    AgentRows::run('alpha', '2026-01-02 10:00:00');
    AgentRows::run('Beta', '2026-01-02 10:00:00');
    AgentRows::run('gamma', '2026-01-02 10:00:00');

    expect(agentNamesAt($this, 'sort=name'))->toBe(['alpha', 'Beta', 'gamma'])
        ->and(agentNamesAt($this, 'sort=-name'))->toBe(['gamma', 'Beta', 'alpha']);
});

it('gives an embeddings run its type', function () {
    agentDataset();

    $embedder = array_column(agentsAt($this)['data'], null, 'name')['Embedder'];

    expect($embedder['type'])->toBe('embedding')
        ->and($embedder['agent_class'])->toBeNull()
        ->and($embedder['top_level']['runs'])->toBe(AgentRows::counts(completed: 1));
});

it('leaves out what started outside the range, a delegation in a run that started before it included', function () {
    agentDataset();

    expect(agentNamesAt($this))->not->toContain('Zed')->not->toContain('Yankee')->not->toContain('Omega');

    // The runs and the delegation are in a range that reaches back to them.
    expect(agentNamesAt($this, 'range=7d'))->toContain('Zed')->toContain('Yankee')->toContain('Omega');
});

it('answers an empty database and a range with nothing in it', function () {
    $body = agentsAt($this);

    expect($body['data'])->toBe([])
        ->and($body['pagination'])->toBe(['page' => 1, 'per_page' => 25, 'total' => 0, 'last_page' => 1])
        ->and($body['buckets']['edges'])->toHaveCount(24)
        ->and($body['agent_limit'])->toBe(['limit' => 1000, 'truncated' => false]);

    agentDataset();

    expect(agentsAt($this, 'from=2024-01-01T00:00:00Z&to=2024-01-02T00:00:00Z')['data'])->toBe([]);
});

it('does not list an agent that only ran in the previous period', function () {
    agentDataset();

    expect(agentNamesAt($this))->not->toContain('Omega')
        ->and(agentNamesAt($this, 'from=2025-12-31T00:00:00Z&to=2026-01-01T00:00:00Z'))->toBe(['Omega']);
});

it('orders by every sort in both directions, the agents without the value last and a tie by name', function (string $sort) {
    agentDataset();

    expect(agentNamesAt($this, "sort={$sort}"))->toBe(agentOrders()[$sort]);
})->with(array_keys(agentOrders()));

it('orders by runs, most first, when no sort is sent', function () {
    agentDataset();

    expect(agentNamesAt($this))->toBe(agentOrders()['-runs']);
});

it('pages the sorted agents without repeating or skipping one', function () {
    agentDataset();

    $pages = [];

    foreach ([1, 2, 3] as $page) {
        $body = agentsAt($this, "per_page=2&page={$page}");
        $pages[] = array_column($body['data'], 'name');

        expect($body['pagination'])->toBe(['page' => $page, 'per_page' => 2, 'total' => 5, 'last_page' => 3]);
    }

    expect($pages)->toBe([['Beta', 'Alpha'], ['Embedder', 'Gamma'], ['Delta']]);

    $past = agentsAt($this, 'per_page=2&page=4');
    expect($past['data'])->toBe([])->and($past['pagination'])->toBe(['page' => 4, 'per_page' => 2, 'total' => 5, 'last_page' => 3]);
});

it('clamps per_page the way the other lists do', function () {
    agentDataset();

    expect(agentsAt($this, 'per_page=0')['pagination']['per_page'])->toBe(1)
        ->and(agentsAt($this, 'per_page=1000')['pagination']['per_page'])->toBe(100);
});

it('searches the names, whatever the case, and counts only the agents found', function () {
    agentDataset();

    expect(agentNamesAt($this, 'search=ETA'))->toBe(['Beta'])
        ->and(agentNamesAt($this, 'search=a'))->toBe(['Beta', 'Alpha', 'Gamma', 'Delta'])
        ->and(agentNamesAt($this, 'search=nothing'))->toBe([])
        ->and(agentsAt($this, 'search=a&per_page=2')['pagination']['total'])->toBe(4)
        // A term is taken literally.
        ->and(agentNamesAt($this, 'search=%'))->toBe([])
        ->and(agentNamesAt($this, 'search=_eta'))->toBe([]);
});

it('keeps both halves of an agent that a search finds', function () {
    AgentRows::run('Solo', '2026-01-02 10:00:00', ['id' => 'solo']);
    $run = AgentRows::run('Host', '2026-01-02 10:30:00', ['id' => 'host']);
    AgentRows::span($run, SpanType::Agent, 'Solo', '2026-01-02 10:30:01', ['id' => 'solo-1', 'parent_id' => 'host']);

    $found = agentsAt($this, 'search=sol')['data'];

    expect(array_column($found, 'name'))->toBe(['Solo'])
        ->and($found[0]['top_level']['runs']['all'])->toBe(1)
        ->and($found[0]['delegated']['all'])->toBe(1);
});

it('counts a run in the bucket it started in, as the overview does', function () {
    agentDataset();
    AgentRows::run('Alpha', '2026-01-01 12:00:00', ['id' => 'edge-in']);
    AgentRows::run('Alpha', '2026-01-01 12:59:59.999', ['id' => 'edge-in-2']);
    AgentRows::run('Alpha', '2026-01-01 13:00:00', ['id' => 'edge-next']);
    AgentRows::run('Alpha', '2026-01-02 11:59:59.999', ['id' => 'edge-last']);

    $range = new TimeRange('24h', Carbon::now()->subDay()->toImmutable(), Carbon::now()->toImmutable());
    $scoped = (new OverviewQuery)->read($range, RunScope::agent('Alpha'));

    $activity = array_column(agentsAt($this)['data'], null, 'name')['Alpha']['activity'];

    expect($activity)->toBe(array_map(fn ($bucket) => $bucket->figures->runs['all'], $scoped->buckets))
        ->and($activity[0])->toBe(2)->and($activity[1])->toBe(1)->and($activity[23])->toBe(3)
        ->and(array_sum($activity))->toBe(7);
});

it('describes the buckets of the activity as the overview describes its series', function (string $query) {
    agentDataset();

    $agents = agentsAt($this, $query);
    $overview = $this->getJson('/trail/api/overview'.($query === '' ? '' : '?'.$query))->assertOk()->json('data.series');

    expect($agents['buckets']['bucket'])->toBe($overview['bucket'])
        ->and($agents['buckets']['edges'])->toBe(array_map(fn (array $bucket) => array_intersect_key($bucket, array_flip(['from', 'to', 'full', 'in_progress'])), $overview['buckets']));
})->with(['', 'range=1h', 'range=7d', 'from=2026-01-01T00:30:00Z&to=2026-01-01T03:00:00Z', 'from=2025-10-03T00:00:00Z&to=2026-01-02T00:00:00Z']);

it('counts the runs of an agent in each bucket for an agent past the first page', function () {
    agentDataset();

    $body = agentsAt($this, 'per_page=1&page=2');

    expect($body['data'][0]['name'])->toBe('Alpha')->and($body['data'][0]['activity'])->toBe([...array_fill(0, 22, 0), 1, 2]);
});

it('reads the same four statements whatever the page, the sort, the search or the data', function (string $query) {
    agentDataset();

    expect(AgentRows::statements(fn () => agentsAt($this, $query)))->toHaveCount(4);
})->with(['', 'per_page=1&page=3', 'per_page=100', 'sort=-cost', 'sort=name&search=a', 'search=nothing', 'page=9', 'range=7d', 'range=1h']);

it('reads four statements for an empty database too', function () {
    expect(AgentRows::statements(fn () => agentsAt($this)))->toHaveCount(4);
});

it('reads at most the limit of agents, the ones with most runs, and says so', function () {
    $this->app->bind(AgentIndex::class, fn () => new AgentIndex(2));
    agentDataset();

    $body = agentsAt($this);

    // Of the runs, Alpha and Beta (three each) are read and Embedder is not; of the delegated groups, Beta's four
    // and one of the two with a single delegation (Delta, first by name), so Gamma is not read either.
    expect(array_column($body['data'], 'name'))->toBe(['Beta', 'Alpha', 'Delta'])
        ->and($body['pagination']['total'])->toBe(3)
        ->and($body['agent_limit'])->toBe(['limit' => 2, 'truncated' => true]);
});

it('says an agent list is not truncated when each read finds exactly the limit', function () {
    // Three agents with runs, and three groups of delegations (Beta, Delta, Gamma).
    $this->app->bind(AgentIndex::class, fn () => new AgentIndex(3));
    agentDataset();

    expect(agentsAt($this)['agent_limit'])->toBe(['limit' => 3, 'truncated' => false])
        ->and(agentsAt($this)['pagination']['total'])->toBe(5);
});

it('reads at most the limit of delegated groups, and says so', function () {
    $this->app->bind(AgentIndex::class, fn () => new AgentIndex(2));

    $run = AgentRows::run('Host', '2026-01-02 10:00:00', ['id' => 'host']);
    AgentRows::run('Other', '2026-01-02 10:00:00', ['id' => 'other']);

    foreach (['One', 'Two', 'Three'] as $i => $name) {
        AgentRows::span($run, SpanType::Agent, $name, '2026-01-02 10:00:0'.($i + 1), ['id' => "d-{$i}", 'parent_id' => 'host']);
    }

    $body = agentsAt($this);

    // Both agents with runs are read; of the three delegated groups (one delegation each) the first two by name.
    expect($body['agent_limit'])->toBe(['limit' => 2, 'truncated' => true])
        ->and(array_column($body['data'], 'name'))->toBe(['Other', 'Host', 'Three', 'One']);
});

describe('names that differ in case or accent', function () {
    /** The agents the dataset below makes, as the database under test groups the names. */
    beforeEach(function () {
        AgentRows::run('Support', '2026-01-02 10:00:00', ['id' => 's1']);
        AgentRows::run('support', '2026-01-02 11:00:00', ['id' => 's2', 'status' => Status::Failed]);
        $run = AgentRows::run('SUPPORT', '2026-01-02 09:00:00', ['id' => 's3']);
        AgentRows::run('Suppört', '2026-01-02 08:00:00', ['id' => 's4']);
        AgentRows::span($run, SpanType::Agent, 'support', '2026-01-02 09:00:01', ['id' => 'sd-1', 'parent_id' => 's3']);
        AgentRows::span($run, SpanType::Agent, 'SUPPORT', '2026-01-02 09:30:00', ['id' => 'sd-2', 'parent_id' => 's3']);
        AgentRows::span($run, SpanType::Agent, 'Unrelated', '2026-01-02 09:30:00', ['id' => 'sd-3', 'parent_id' => 's3']);
    });

    it('groups them as the database compares text, and shows the latest run\'s spelling', function () {
        $ignoresCase = DB::connection()->getDriverName() === 'mysql';
        $byName = array_column(agentsAt($this)['data'], null, 'name');

        if ($ignoresCase) {
            // One agent: four runs, spelled as the latest of them is, with every delegation.
            expect(array_keys($byName))->toEqualCanonicalizing(['support', 'Unrelated'])
                ->and($byName['support']['top_level']['runs'])->toBe(AgentRows::counts(completed: 3, failed: 1))
                ->and($byName['support']['delegated']['all'])->toBe(2)
                ->and($byName['support']['last_activity_at'])->toBe('2026-01-02T11:00:00.000Z');
        } else {
            // Four agents, each its own spelling; a delegation goes with the spelling it was recorded with.
            expect(array_keys($byName))->toEqualCanonicalizing(['Support', 'support', 'SUPPORT', 'Suppört', 'Unrelated'])
                ->and($byName['support']['top_level']['runs'])->toBe(AgentRows::counts(failed: 1))
                ->and($byName['support']['delegated']['all'])->toBe(1)
                ->and($byName['SUPPORT']['top_level']['runs'])->toBe(AgentRows::counts(completed: 1))
                ->and($byName['SUPPORT']['delegated']['all'])->toBe(1)
                ->and($byName['Support']['delegated'])->toBeNull();
        }
    });

    it('counts, for each agent, exactly what the runs list returns for its name', function () {
        foreach (agentsAt($this)['data'] as $agent) {
            $list = $this->getJson('/trail/api/traces?agent='.urlencode($agent['name']))->assertOk()->json('status_counts');

            expect($agent['top_level']['runs'] ?? AgentRows::counts())->toBe($list, $agent['name']);
        }
    });
});

it('counts, for each agent, exactly what the runs list returns for its name', function (string $query) {
    agentDataset();
    AgentRows::run('Alpha', '2026-01-01 12:00:00');
    AgentRows::run('Alpha', '2026-01-01 11:59:59.999', ['status' => Status::Failed]);

    $agents = agentsAt($this, $query)['data'];

    expect($agents)->not->toBe([]);

    foreach ($agents as $agent) {
        $list = $this->getJson('/trail/api/traces?'.($query === '' ? '' : $query.'&').'agent='.urlencode($agent['name']))->assertOk()->json('status_counts');

        expect($agent['top_level']['runs'] ?? AgentRows::counts())->toBe($list, $agent['name']);
    }
})->with(['', 'range=7d', 'range=1h', 'from=2026-01-02T08:00:00Z&to=2026-01-02T10:00:00Z']);

describe('errors', function () {
    it('answers a bad range, page, sort or search with a 422', function (string $query, string $parameter) {
        $this->getJson('/trail/api/agents?'.$query)->assertUnprocessable()->assertJsonValidationErrors([$parameter]);
    })->with([
        'range' => ['range=bad', 'range'],
        'range with from' => ['range=24h&from=2026-01-01T00:00:00Z', 'range'],
        'too long a range' => ['from=2025-01-01T00:00:00Z&to=2026-01-02T00:00:00Z', 'from'],
        'page' => ['page=0', 'page'],
        'page not a number' => ['page=x', 'page'],
        'per_page' => ['per_page=x', 'per_page'],
        'sort' => ['sort=cheapest', 'sort'],
        'sort with a dash only' => ['sort=-', 'sort'],
        'sort array' => ['sort[]=runs', 'sort'],
        'search too long' => ['search='.str_repeat('a', 201), 'search'],
        'search array' => ['search[]=a', 'search'],
        'search not UTF-8' => ['search=%FF', 'search'],
    ]);

    it('answers a denied request with a JSON 403', function () {
        $this->app['env'] = 'production';

        $this->get('/trail/api/agents', ['Accept' => 'text/html'])->assertForbidden()->assertJsonStructure(['message']);

        Trail::auth(fn () => true);
        $this->get('/trail/api/agents', ['Accept' => 'text/html'])->assertOk();

        Trail::auth(fn () => false);
        $this->get('/trail/api/agents', ['Accept' => 'text/html'])->assertForbidden();
    });

    it('answers a JSON 404 when the dashboard is switched off', function () {
        config(['trail.dashboard.enabled' => false]);

        $this->get('/trail/api/agents', ['Accept' => 'text/html'])->assertNotFound()->assertJsonStructure(['message']);
    });
});
