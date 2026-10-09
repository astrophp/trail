<?php

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
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
function showAgent(mixed $test, string $name, string $query = ''): array
{
    return $test->getJson('/trail/api/agents/show?name='.rawurlencode($name).($query === '' ? '' : '&'.$query))->assertOk()->json();
}

/**
 * Runs for the agents the show tests look at, in the default range (the clock is 2026-01-02 12:00:00):
 *
 * - Alpha: a completed run, a failed and unpriced one that also failed over, and a recent running one;
 *   it delegates to Beta (under the tool of the run) and to Gamma, which is never run on its own.
 * - Beta: a run of its own, stored incomplete.
 * - Noise: runs that would be counted if a count forgot to narrow to the agent.
 * - Omega: one run, in the previous period only.
 */
function showDataset(): void
{
    $one = AgentRows::run('Alpha', '2026-01-02 10:00:00', ['id' => 'a1', 'duration_ms' => 1000, 'input_tokens' => 100, 'cost' => 0.5]);
    AgentRows::run('Alpha', '2026-01-02 11:00:00', ['id' => 'a2', 'status' => Status::Failed, 'issue_kind' => IssueKind::RateLimited, 'unpriced_span_count' => 1, 'recovered' => true, 'duration_ms' => 3000]);
    AgentRows::run('Alpha', '2026-01-02 11:50:00', ['id' => 'a3', 'status' => Status::Running]);
    AgentRows::run('Alpha', '2026-01-01 08:00:00', ['id' => 'a0', 'status' => Status::Failed]);
    AgentRows::span($one, SpanType::Tool, 'search', '2026-01-02 10:00:01', ['id' => 'tool-1']);
    AgentRows::span($one, SpanType::Agent, 'Beta', '2026-01-02 10:00:02', ['id' => 'beta-1', 'parent_id' => 'tool-1']);
    AgentRows::span($one, SpanType::Agent, 'Gamma', '2026-01-02 10:00:03', ['id' => 'gamma-1', 'parent_id' => 'a1', 'status' => Status::Failed]);

    AgentRows::run('Beta', '2026-01-02 09:00:00', ['id' => 'b1', 'status' => Status::Incomplete]);

    AgentRows::run('Noise', '2026-01-02 10:00:00', ['status' => Status::Failed, 'issue_kind' => IssueKind::Exception, 'unpriced_span_count' => 2, 'recovered' => true]);
    AgentRows::run('Noise', '2026-01-02 10:05:00', ['status' => Status::Failed, 'issue_kind' => IssueKind::RateLimited, 'child_failed' => true]);
    AgentRows::run('Noise', '2026-01-02 10:10:00', ['status' => Status::AwaitingApproval]);
    AgentRows::run('Noise', '2026-01-02 10:15:00', ['status' => Status::Incomplete]);

    AgentRows::run('Omega', '2025-12-31 20:00:00', ['id' => 'o1', 'agent_class' => 'App\\Ai\\Omega', 'duration_ms' => 200]);
}

it('shows the agent, the summary and series of its runs, and what needs a look', function () {
    showDataset();

    $body = showAgent($this, 'Alpha');
    $listed = collect($this->getJson('/trail/api/agents')->json('data'))->firstWhere('name', 'Alpha');

    expect(array_keys($body))->toBe(['data', 'range', 'previous_range'])
        ->and(array_keys($body['data']))->toBe(['agent', 'summary', 'previous', 'series', 'attention'])
        ->and($body['range'])->toBe(['preset' => '24h', 'from' => '2026-01-01T12:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z'])
        ->and($body['previous_range'])->toBe(['from' => '2025-12-31T12:00:00.000Z', 'to' => '2026-01-01T12:00:00.000Z'])
        // One shape, in a list and on its own page.
        ->and($body['data']['agent'])->toBe($listed)
        ->and($body['data']['agent']['name'])->toBe('Alpha')
        ->and($body['data']['agent']['delegated'])->toBeNull()
        ->and($body['data']['summary']['runs'])->toBe(AgentRows::counts(completed: 1, failed: 1, running: 1))
        ->and($body['data']['summary']['cost'])->toBe(['state' => 'pending', 'amount' => 0.5])
        // Only the runs of Alpha are in the previous period: its failed one before the range.
        ->and($body['data']['previous']['runs'])->toBe(AgentRows::counts(failed: 1))
        ->and($body['data']['series']['bucket'])->toBe('hour')
        ->and($body['data']['series']['buckets'])->toHaveCount(24);
});

it('has the runs of the summary that the agent has as its own', function (string $name, string $query) {
    showDataset();
    AgentRows::run('Beta', '2026-01-02 07:00:00', ['status' => Status::Running, 'created_at' => Carbon::now()->subHours(3)]);

    $body = showAgent($this, $name, $query);

    expect($body['data']['agent']['top_level']['runs'])->toBe($body['data']['summary']['runs'])
        ->and($body['data']['summary']['runs']['all'])->toBeGreaterThan(0);
})->with([
    'Alpha' => ['Alpha', ''],
    'Beta, where a stale run is incomplete' => ['Beta', ''],
    'Alpha in a week' => ['Alpha', 'range=7d'],
    'Alpha in an explicit range' => ['Alpha', 'from=2026-01-02T10:30:00Z&to=2026-01-02T12:00:00Z'],
]);

it('sums the buckets of the series to the runs of the agent, and to its activity', function () {
    showDataset();

    $body = showAgent($this, 'Alpha');
    $buckets = $body['data']['series']['buckets'];

    expect(array_map(fn (array $bucket) => $bucket['runs']['all'], $buckets))->toBe($body['data']['agent']['activity']);
});

it('adds the agent to the filters of every item and row that needs a look, so that the list reproduces each count', function (string $name, string $query, array $kinds, int $breakdownRows) {
    showDataset();

    $body = showAgent($this, $name, $query);
    $items = $body['data']['attention'];
    $rows = 0;

    expect(array_column($items, 'kind'))->toBe($kinds);

    foreach ($items as $item) {
        expect($item['filters']['agent'])->toBe($name);

        $list = $this->getJson('/trail/api/traces?'.http_build_query($item['filters']).($query === '' ? '' : '&'.$query))->assertOk()->json('pagination.total');
        expect($item['count'])->toBe($list, $item['kind']);

        foreach ($item['breakdown'] as $row) {
            $rows++;
            expect($row['filters']['agent'])->toBe($name);

            $list = $this->getJson('/trail/api/traces?'.http_build_query($row['filters']).($query === '' ? '' : '&'.$query))->assertOk()->json('pagination.total');
            expect($row['count'])->toBe($list, $item['kind'].'/'.$row['issue_kind']);
        }
    }

    expect($rows)->toBe($breakdownRows);
})->with([
    // Alpha: one failed run (a rate limit), one unpriced, one recovered. A week adds a failed run with no issue kind: no row.
    'Alpha' => ['Alpha', '', ['failed', 'unpriced', 'recovered'], 1],
    'Alpha in a week' => ['Alpha', 'range=7d', ['failed', 'unpriced', 'recovered'], 1],
    // Beta: a run stored incomplete, and nothing failed.
    'Beta' => ['Beta', '', ['incomplete'], 0],
]);

it('narrows what needs a look to the agent, not to every run', function () {
    showDataset();

    $kinds = array_column(showAgent($this, 'Alpha')['data']['attention'], 'count', 'kind');

    // Noise has failed, unpriced, recovered and awaiting runs of its own; none is Alpha's.
    expect($kinds)->toBe(['failed' => 1, 'unpriced' => 1, 'recovered' => 1]);
});

it('shows an agent that was only delegated to without runs of its own, and without inventing figures', function () {
    showDataset();

    $body = showAgent($this, 'Gamma');

    expect($body['data']['agent']['top_level'])->toBeNull()
        ->and($body['data']['agent']['delegated'])->toBe(['all' => 1, 'failed' => 1, 'incomplete' => 0, 'last_activity_at' => '2026-01-02T10:00:03.000Z'])
        ->and($body['data']['agent']['activity'])->toBe(array_fill(0, 24, 0))
        ->and($body['data']['summary']['runs'])->toBe(AgentRows::counts())
        ->and($body['data']['summary']['cost'])->toBe(['state' => 'not_captured', 'amount' => null])
        ->and($body['data']['summary']['error_rate']['rate'])->toBeNull()
        ->and($body['data']['previous'])->toBeNull()
        ->and($body['data']['attention'])->toBe([]);
});

it('shows an agent recorded outside the range, without figures, and its previous period', function () {
    showDataset();

    $body = showAgent($this, 'Omega');

    expect($body['data']['agent'])->toBe([
        'name' => 'Omega', 'agent_class' => 'App\\Ai\\Omega', 'type' => 'agent', 'top_level' => null, 'delegated' => null,
        'last_activity_at' => null, 'activity' => array_fill(0, 24, 0),
    ])
        ->and($body['data']['summary']['runs'])->toBe(AgentRows::counts())
        ->and($body['data']['previous']['runs'])->toBe(AgentRows::counts(completed: 1))
        ->and($body['data']['attention'])->toBe([]);

    // In a range that holds the run it is an agent with figures.
    expect(showAgent($this, 'Omega', 'range=7d')['data']['agent']['top_level']['runs'])->toBe(AgentRows::counts(completed: 1));
});

it('shows an agent recorded only as a delegated agent outside the range', function () {
    $before = AgentRows::run('Zed', '2026-01-01 11:59:59', ['id' => 'z1']);
    AgentRows::span($before, SpanType::Agent, 'Yankee', '2026-01-02 11:00:00', ['id' => 'y1', 'parent_id' => 'z1', 'agent_class' => 'App\\Ai\\Yankee']);

    $body = showAgent($this, 'Yankee');

    expect($body['data']['agent']['name'])->toBe('Yankee')
        ->and($body['data']['agent']['agent_class'])->toBe('App\\Ai\\Yankee')
        ->and($body['data']['agent']['top_level'])->toBeNull()
        ->and($body['data']['agent']['delegated'])->toBeNull()
        ->and(showAgent($this, 'Yankee', 'range=7d')['data']['agent']['delegated']['all'])->toBe(1);
});

it('answers a name never recorded with a 404', function (string $name) {
    showDataset();

    $this->getJson('/trail/api/agents/show?name='.rawurlencode($name))->assertNotFound()->assertJsonStructure(['message']);
})->with([
    'unknown' => 'Nobody',
    // A tool, a step and a root agent span are not agents of their own.
    'a tool' => 'search',
    'a step' => 'step',
]);

it('spells the name as the latest run does, and the filters with it', function () {
    AgentRows::run('Support', '2026-01-02 09:00:00', ['id' => 's1']);
    AgentRows::run('SUPPORT', '2026-01-02 11:00:00', ['id' => 's2', 'status' => Status::Failed]);

    // What each driver answers to the name "support" and to the name "SUPPORT": MySQL compares text
    // without regard to case, so both are the one agent; the others never recorded "support".
    $expected = [
        'mysql' => [
            'support' => ['status' => 200, 'name' => 'SUPPORT', 'runs' => AgentRows::counts(completed: 1, failed: 1), 'filters' => ['agent' => 'SUPPORT', 'status' => 'failed']],
            'SUPPORT' => ['status' => 200, 'name' => 'SUPPORT', 'runs' => AgentRows::counts(completed: 1, failed: 1), 'filters' => ['agent' => 'SUPPORT', 'status' => 'failed']],
        ],
        'sqlite' => $apart = [
            'support' => ['status' => 404, 'name' => null, 'runs' => null, 'filters' => null],
            'SUPPORT' => ['status' => 200, 'name' => 'SUPPORT', 'runs' => AgentRows::counts(failed: 1), 'filters' => ['agent' => 'SUPPORT', 'status' => 'failed']],
        ],
        'pgsql' => $apart,
    ];

    $driver = DB::connection()->getDriverName();
    $found = [];

    foreach (['support', 'SUPPORT'] as $asked) {
        $response = $this->getJson('/trail/api/agents/show?name='.rawurlencode($asked));
        $found[$asked] = [
            'status' => $response->status(),
            'name' => $response->json('data.agent.name'),
            'runs' => $response->json('data.summary.runs'),
            'filters' => $response->json('data.attention.0.filters'),
        ];
    }

    expect($expected)->toHaveKey($driver)->and($found)->toBe($expected[$driver]);
});

it('shows the moments of an agent exactly in a timezone that is not UTC, with the activity of the overview\'s scoped series', function () {
    config(['app.timezone' => 'Asia/Tokyo']);
    Carbon::setTestNow(Carbon::parse('2026-01-04 12:00:00', 'Asia/Tokyo'));

    $first = AgentRows::run('Alpha', '2026-01-04 09:00:00', ['id' => 'tz-1']);
    AgentRows::run('Alpha', '2026-01-04 11:30:00', ['id' => 'tz-2', 'status' => Status::Failed]);
    AgentRows::span($first, SpanType::Agent, 'Alpha', '2026-01-04 09:00:05', ['id' => 'tz-self', 'parent_id' => 'tz-1']);

    $body = showAgent($this, 'Alpha');
    $buckets = $body['data']['series']['buckets'];

    expect($body['range'])->toBe(['preset' => '24h', 'from' => '2026-01-03T03:00:00.000Z', 'to' => '2026-01-04T03:00:00.000Z'])
        ->and($body['previous_range'])->toBe(['from' => '2026-01-02T03:00:00.000Z', 'to' => '2026-01-03T03:00:00.000Z'])
        ->and($body['data']['agent']['top_level']['last_activity_at'])->toBe('2026-01-04T02:30:00.000Z')
        ->and($body['data']['agent']['delegated']['last_activity_at'])->toBe('2026-01-04T00:00:05.000Z')
        ->and($body['data']['agent']['last_activity_at'])->toBe('2026-01-04T02:30:00.000Z')
        ->and($body['data']['agent']['activity'])->toBe(array_map(fn (array $bucket) => $bucket['runs']['all'], $buckets))
        ->and($body['data']['attention'][0]['latest_at'])->toBe('2026-01-04T02:30:00.000Z');
});

describe('the reads', function () {
    it('are the four of the agent, one of the overview and one of what needs a look', function () {
        showDataset();

        expect(AgentRows::statements(fn () => showAgent($this, 'Alpha')))->toHaveCount(6);
    });

    it('add the 95th percentile read of each period that has enough runs, as the overview does', function () {
        foreach (range(1, 20) as $i) {
            AgentRows::run('Alpha', '2026-01-02 10:00:00', ['duration_ms' => $i]);
            AgentRows::run('Alpha', '2026-01-01 10:00:00', ['duration_ms' => $i]);
        }

        $body = null;
        $statements = AgentRows::statements(function () use (&$body) {
            $body = showAgent($this, 'Alpha');
        });

        expect($statements)->toHaveCount(8)
            ->and($body['data']['summary']['duration']['p95_ms'])->toBe(19)
            ->and($body['data']['agent']['top_level']['duration'])->toBe(['average_ms' => 10.5, 'measured' => 20, 'not_measured' => 0]);
    });

    it('add the lookup of an agent with nothing in the range', function () {
        showDataset();

        // Two reads find nothing for Omega, one finds its latest run, then the overview and what needs a look.
        expect(AgentRows::statements(fn () => showAgent($this, 'Omega')))->toHaveCount(5);
    });

    it('add the lookup by run and by delegated span for an agent with no run at all', function () {
        $before = AgentRows::run('Zed', '2026-01-01 11:59:59', ['id' => 'z1']);
        AgentRows::span($before, SpanType::Agent, 'Yankee', '2026-01-02 11:00:00', ['id' => 'y1', 'parent_id' => 'z1']);

        // Two reads find nothing, two look for its latest run and its latest delegated span, then the overview and what needs a look.
        expect(AgentRows::statements(fn () => showAgent($this, 'Yankee')))->toHaveCount(6);
    });

    it('stop at the lookup for a name never recorded', function () {
        showDataset();

        // Two reads find nothing, two look for a run and a delegated span.
        expect(AgentRows::statements(fn () => $this->getJson('/trail/api/agents/show?name=Nobody')->assertNotFound()))->toHaveCount(4);
    });
});

describe('the name', function () {
    it('is read from the raw query, whatever characters it holds', function (string $name) {
        AgentRows::run($name, '2026-01-02 10:00:00', ['id' => 'odd']);
        AgentRows::run(trim($name).'x', '2026-01-02 10:00:00', ['id' => 'other']);

        $body = $this->getJson('/trail/api/agents/show?name='.rawurlencode($name))->assertOk()->json();

        expect($body['data']['agent']['name'])->toBe($name)
            ->and($body['data']['summary']['runs'])->toBe(AgentRows::counts(completed: 1));
    })->with([
        'a slash' => 'a/b',
        'a leading space' => ' padded',
        'a trailing space' => 'padded ',
        'a percent sign' => '100%',
        'an encoded percent' => '%41',
        'a plus sign' => 'c++',
        'a question mark' => 'is it?',
        'an ampersand' => 'a&b=c',
        'a hash' => 'a#b',
        'multibyte' => 'Zoë',
    ]);

    it('does not read a plus sign as a space, nor a space as nothing', function () {
        AgentRows::run('a b', '2026-01-02 10:00:00');

        $this->getJson('/trail/api/agents/show?name=a+b')->assertOk();
        $this->getJson('/trail/api/agents/show?name=a%2Bb')->assertNotFound();
        $this->getJson('/trail/api/agents/show?name=%20a%20b')->assertNotFound();
    });

    it('is not trimmed, so a leading space is part of it', function () {
        AgentRows::run(' padded', '2026-01-02 10:00:00');

        $this->getJson('/trail/api/agents/show?name=padded')->assertNotFound();
        expect($this->getJson('/trail/api/agents/show?name=%20padded')->assertOk()->json('data.agent.name'))->toBe(' padded');
    });

    it('may be 255 characters long, and not 256', function () {
        AgentRows::run(str_repeat('a', 255), '2026-01-02 10:00:00');

        $this->getJson('/trail/api/agents/show?name='.str_repeat('a', 255))->assertOk();
        expect(AgentRows::statements(fn () => $this->getJson('/trail/api/agents/show?name='.str_repeat('a', 256))->assertNotFound()))->toBe([]);
    });

    it('counts characters, not bytes', function () {
        AgentRows::run(str_repeat('é', 255), '2026-01-02 10:00:00');

        $this->getJson('/trail/api/agents/show?name='.rawurlencode(str_repeat('é', 255)))->assertOk();
        expect(AgentRows::statements(fn () => $this->getJson('/trail/api/agents/show?name='.rawurlencode(str_repeat('é', 256)))->assertNotFound()))->toBe([]);
    });

    it('is a 404 that does not reach the database when it cannot be a name', function (string $query) {
        AgentRows::run('a', '2026-01-02 10:00:00');

        expect(AgentRows::statements(fn () => $this->getJson('/trail/api/agents/show'.$query)->assertNotFound()->assertJsonStructure(['message'])))->toBe([]);
    })->with([
        'missing' => [''],
        'empty' => ['?name='],
        'a NUL byte' => ['?name=a%00b'],
        'not UTF-8' => ['?name=%FF'],
        'a list' => ['?name[]=a'],
        'a keyed list' => ['?name[a]=a'],
    ]);

    it('is checked before the range', function () {
        $this->getJson('/trail/api/agents/show?name=&range=bad')->assertNotFound();
    });
});

describe('errors', function () {
    it('answers a bad range with a 422, and a range over 92 days', function (string $query, string $parameter) {
        AgentRows::run('a', '2026-01-02 10:00:00');

        $this->getJson('/trail/api/agents/show?name=a&'.$query)->assertUnprocessable()->assertJsonValidationErrors([$parameter]);
    })->with([
        'range' => ['range=bad', 'range'],
        'range with from' => ['range=24h&from=2026-01-01T00:00:00Z', 'range'],
        'too long a range' => ['from=2025-01-01T00:00:00Z&to=2026-01-02T00:00:00Z', 'from'],
    ]);

    it('answers a denied request with a JSON 403', function () {
        AgentRows::run('a', '2026-01-02 10:00:00');
        $this->app['env'] = 'production';

        $this->get('/trail/api/agents/show?name=a', ['Accept' => 'text/html'])->assertForbidden()->assertJsonStructure(['message']);

        Trail::auth(fn () => true);
        $this->get('/trail/api/agents/show?name=a', ['Accept' => 'text/html'])->assertOk();
    });

    it('answers a JSON 404 when the dashboard is switched off', function () {
        AgentRows::run('a', '2026-01-02 10:00:00');
        config(['trail.dashboard.enabled' => false]);

        $this->get('/trail/api/agents/show?name=a', ['Accept' => 'text/html'])->assertNotFound()->assertJsonStructure(['message']);
    });
});
