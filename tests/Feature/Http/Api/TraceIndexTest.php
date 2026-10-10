<?php

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Astro\Trail\Tests\Fixtures\Users\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:00:00');
});

afterEach(function () {
    Carbon::setTestNow();
    // Some tests change the environment; a failed assertion must not leave it changed.
    $this->app['env'] = 'testing';
});

/**
 * A finished run that started inside the default range.
 *
 * @param  array<string, mixed>  $attributes
 */
function listed(string $id, array $attributes = []): Trace
{
    return Rows::trace([...['id' => $id, 'status' => Status::Completed, 'started_at' => '2026-01-02 10:00:00'], ...$attributes]);
}

/**
 * The ids a request lists, in the order it lists them.
 *
 * @return list<string>
 */
function idsAt(mixed $test, string $query = ''): array
{
    $response = $test->getJson('/trail/api/traces'.($query === '' ? '' : '?'.$query));
    $response->assertOk();

    return array_column($response->json('data'), 'id');
}

/**
 * @return list<string>
 */
function sortedIdsAt(mixed $test, string $query = ''): array
{
    $ids = idsAt($test, $query);
    sort($ids);

    return $ids;
}

it('answers an empty database', function () {
    $this->getJson('/trail/api/traces')->assertOk()->assertExactJson([
        'data' => [],
        'pagination' => ['page' => 1, 'per_page' => 25, 'total' => 0, 'last_page' => 1],
        'range' => ['preset' => '24h', 'from' => '2026-01-01T12:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z'],
        'status_counts' => ['all' => 0, 'completed' => 0, 'failed' => 0, 'incomplete' => 0, 'running' => 0, 'awaiting_approval' => 0],
        'slow_threshold_ms' => null,
    ]);
});

it('lists the runs of the range, newest first, in the documented shape', function () {
    $id = DB::table('users')->insertGetId(['name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);
    listed('old', ['started_at' => '2026-01-02 09:00:00']);
    listed('new', ['started_at' => '2026-01-02 11:00:00', 'user_id' => (string) $id, 'user_type' => User::class, 'cost' => 0.5, 'input_tokens' => 10, 'output_tokens' => 5]);
    listed('outside', ['started_at' => '2026-01-01 11:59:59']);
    Rows::bookmark(Trace::query()->findOrFail('new'));

    $response = $this->getJson('/trail/api/traces')->assertOk();

    expect(array_column($response->json('data'), 'id'))->toBe(['new', 'old'])
        ->and($response->json('data.0'))->toMatchArray([
            'id' => 'new',
            'status' => 'completed',
            'bookmarked' => true,
            'cost' => ['state' => 'estimated', 'amount' => 0.5],
            'user' => ['id' => (string) $id, 'type' => User::class, 'name' => 'Ada', 'email' => 'ada@example.test'],
            'started_at' => '2026-01-02T11:00:00.000Z',
        ])
        ->and($response->json('data.0.usage.total_tokens'))->toBe(15)
        ->and($response->json('data.1.bookmarked'))->toBeFalse()
        ->and($response->json('data.1.user'))->toBeNull();
});

it('takes an explicit range', function () {
    listed('inside', ['started_at' => '2025-12-01 08:00:00']);
    listed('today');

    $response = $this->getJson('/trail/api/traces?from=2025-12-01T00:00:00Z&to=2025-12-02T00:00:00Z')->assertOk();

    expect(array_column($response->json('data'), 'id'))->toBe(['inside'])
        ->and($response->json('range.preset'))->toBeNull();
});

describe('filters', function () {
    beforeEach(function () {
        $one = listed('t1', ['name' => 'Alpha', 'status' => Status::Failed, 'issue_kind' => IssueKind::RateLimited, 'conversation_id' => 'c1', 'user_id' => '7', 'user_type' => 'Type\\A', 'streamed' => true, 'unpriced_span_count' => 1]);
        $two = listed('t2', ['name' => 'Beta', 'status' => Status::Completed, 'conversation_id' => 'c2', 'user_id' => '7', 'user_type' => 'Type\\B', 'recovered' => true]);
        $three = listed('t3', ['name' => 'Alpha', 'status' => Status::AwaitingApproval, 'child_failed' => true, 'user_id' => '8', 'user_type' => 'Type\\A']);
        listed('t4', ['name' => 'Gamma', 'status' => Status::Incomplete, 'issue_kind' => IssueKind::ToolError]);

        // t1 used openai at its first step and anthropic later; t2 used openai/gpt-5 and a different provider's model.
        Rows::span($one, ['provider' => 'openai', 'model' => 'gpt-5']);
        Rows::span($one, ['provider' => 'anthropic', 'model' => 'claude-sonnet-4-5']);
        Rows::span($two, ['provider' => 'openai', 'model' => 'gpt-4o']);
        Rows::span($two, ['provider' => 'anthropic', 'model' => 'gpt-5']);
        Rows::span($three, ['provider' => null, 'model' => null]);
        Rows::bookmark($two);
    });

    it('filters on each parameter alone', function (string $query, array $expected) {
        expect(sortedIdsAt($this, $query))->toBe($expected);
    })->with([
        'status' => ['status=failed', ['t1']],
        'status incomplete' => ['status=incomplete', ['t4']],
        'status awaiting_approval' => ['status=awaiting_approval', ['t3']],
        'agent' => ['agent=Alpha', ['t1', 't3']],
        'conversation' => ['conversation=c2', ['t2']],
        'user_id' => ['user_id=7', ['t1', 't2']],
        'user_id and user_type' => ['user_id=7&user_type=Type%5CB', ['t2']],
        'issue_kind' => ['issue_kind=rate_limited', ['t1']],
        'issue_kind tool_error' => ['issue_kind=tool_error', ['t4']],
        'streamed' => ['streamed=1', ['t1']],
        'recovered' => ['recovered=true', ['t2']],
        'child_failed' => ['child_failed=1', ['t3']],
        'unpriced' => ['unpriced=1', ['t1']],
        'bookmarked' => ['bookmarked=1', ['t2']],
        'provider' => ['provider=anthropic', ['t1', 't2']],
        'model' => ['model=gpt-5', ['t1', 't2']],
        'model of a later step' => ['model=claude-sonnet-4-5', ['t1']],
        'provider and model on the same step' => ['provider=openai&model=gpt-5', ['t1']],
        'provider and model never on the same step' => ['provider=anthropic&model=gpt-4o', []],
        'an empty parameter is absent' => ['agent=&status=&search=', ['t1', 't2', 't3', 't4']],
    ]);

    it('combines filters with and', function () {
        expect(sortedIdsAt($this, 'agent=Alpha&user_id=7'))->toBe(['t1'])
            ->and(sortedIdsAt($this, 'agent=Alpha&status=awaiting_approval&child_failed=1'))->toBe(['t3'])
            ->and(sortedIdsAt($this, 'bookmarked=1&provider=openai&model=gpt-4o&recovered=1'))->toBe(['t2'])
            ->and(sortedIdsAt($this, 'agent=Alpha&recovered=1'))->toBe([]);
    });

    it('finds a run through a step that started after the range ended', function () {
        $late = listed('late', ['started_at' => '2026-01-02 11:59:00']);
        Rows::span($late, ['provider' => 'mistral', 'model' => 'mistral-large', 'started_at' => '2026-01-02 13:00:00']);
        $early = listed('early', ['started_at' => '2026-01-01 11:00:00']);
        Rows::span($early, ['provider' => 'mistral', 'model' => 'mistral-large', 'started_at' => '2026-01-01 11:00:01']);

        expect(sortedIdsAt($this, 'model=mistral-large'))->toBe(['late'])
            ->and(sortedIdsAt($this, 'provider=mistral&model=mistral-large'))->toBe(['late'])
            ->and(sortedIdsAt($this, 'provider=mistral&range=7d'))->toBe(['early', 'late']);
    });

    it('keeps the runs with a tool span of that name, in any agent of the run', function () {
        $call = fn (string $trace, string $name, array $attributes = []) => Rows::span(Trace::query()->findOrFail($trace), [...['type' => SpanType::Tool, 'name' => $name, 'started_at' => '2026-01-02 10:00:00'], ...$attributes]);

        $call('t1', 'lookup_order');
        $call('t1', 'lookup_order');
        $call('t2', 'send_email');
        // A step named like the tool is not a tool, and an agent span of a delegated agent is not one either.
        Rows::span(Trace::query()->findOrFail('t3'), ['type' => SpanType::Step, 'name' => 'lookup_order', 'started_at' => '2026-01-02 10:00:00']);
        $delegated = Rows::span(Trace::query()->findOrFail('t4'), ['type' => SpanType::Agent, 'name' => 'lookup_order', 'parent_id' => 't4', 'started_at' => '2026-01-02 10:00:00']);
        $call('t4', 'web_search', ['parent_id' => $delegated->id]);

        expect(sortedIdsAt($this, 'tool=lookup_order'))->toBe(['t1'])
            ->and(sortedIdsAt($this, 'tool=send_email'))->toBe(['t2'])
            ->and(sortedIdsAt($this, 'tool=web_search'))->toBe(['t4'])
            ->and(sortedIdsAt($this, 'tool=nothing'))->toBe([])
            ->and(sortedIdsAt($this, 'tool=lookup_order&agent=Beta'))->toBe([])
            ->and(sortedIdsAt($this, 'tool=lookup_order&agent=Alpha'))->toBe(['t1']);

        // As the database compares text: MySQL's default collation ignores case, SQLite and Postgres match the exact case only.
        $byDriver = ['mysql' => ['t1'], 'sqlite' => [], 'pgsql' => []];
        $driver = DB::connection()->getDriverName();

        expect($byDriver)->toHaveKey($driver)->and(sortedIdsAt($this, 'tool=Lookup_Order'))->toBe($byDriver[$driver]);

        $this->getJson('/trail/api/traces?tool=lookup_order')->assertOk()
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('status_counts', ['all' => 1, 'completed' => 0, 'failed' => 1, 'incomplete' => 0, 'running' => 0, 'awaiting_approval' => 0]);
    });

    it('counts a run in status_counts under a tool filter without the status filter', function () {
        foreach (['t1', 't2'] as $id) {
            Rows::span(Trace::query()->findOrFail($id), ['type' => SpanType::Tool, 'name' => 'lookup_order', 'started_at' => '2026-01-02 10:00:00']);
        }

        $this->getJson('/trail/api/traces?tool=lookup_order&status=failed')->assertOk()
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('status_counts.all', 2)
            ->assertJsonPath('status_counts.completed', 1);
    });

    it('finds a run through a tool that started after the range ended, and not through one before the run', function () {
        $late = listed('late', ['started_at' => '2026-01-02 11:59:00']);
        Rows::span($late, ['type' => SpanType::Tool, 'name' => 'slow_tool', 'started_at' => '2026-01-02 13:00:00']);
        $early = listed('early', ['started_at' => '2026-01-01 11:00:00']);
        Rows::span($early, ['type' => SpanType::Tool, 'name' => 'slow_tool', 'started_at' => '2026-01-01 11:00:01']);

        expect(sortedIdsAt($this, 'tool=slow_tool'))->toBe(['late'])
            ->and(sortedIdsAt($this, 'tool=slow_tool&range=7d'))->toBe(['early', 'late']);
    });

    it('reads each switch as on for 1 and true and as off for 0 and false', function (string $switch) {
        $on = array_values(array_unique([...sortedIdsAt($this, "{$switch}=1"), ...sortedIdsAt($this, "{$switch}=true")]));

        expect($on)->toHaveCount(1)
            ->and(sortedIdsAt($this, "{$switch}=true"))->toBe(sortedIdsAt($this, "{$switch}=1"))
            ->and(sortedIdsAt($this, "{$switch}=0"))->toBe(['t1', 't2', 't3', 't4'])
            ->and(sortedIdsAt($this, "{$switch}=false"))->toBe(['t1', 't2', 't3', 't4']);
    })->with(['streamed', 'recovered', 'child_failed', 'unpriced', 'bookmarked']);

    it('does not apply slow for 0 or false', function () {
        expect(sortedIdsAt($this, 'slow=0'))->toBe(['t1', 't2', 't3', 't4'])
            ->and($this->getJson('/trail/api/traces?slow=false')->json('slow_threshold_ms'))->toBeNull();
    });

    it('refuses user_type without user_id', function () {
        $this->getJson('/trail/api/traces?user_type=Type%5CA')->assertUnprocessable()->assertJsonValidationErrors(['user_id']);
    });
});

describe('search', function () {
    it('finds a run through each of its seven fields, whatever the case', function (string $column) {
        listed('plain');
        listed('hit', [$column => $column === 'id' ? 'hit-NeedleXyz' : 'a NeedleXyz b']);

        expect(idsAt($this, 'search=needlexyz'))->toBe([$column === 'id' ? 'hit-NeedleXyz' : 'hit'])
            ->and(idsAt($this, 'search=NEEDLEXYZ'))->toBe([$column === 'id' ? 'hit-NeedleXyz' : 'hit']);
    })->with(['id', 'name', 'provider', 'model', 'prompt_excerpt', 'conversation_id', 'user_id']);

    it('does not search the response, the agent class or the user type', function () {
        listed('a', ['response_excerpt' => 'needlexyz', 'agent_class' => 'Needlexyz', 'user_type' => 'Needlexyz']);

        expect(idsAt($this, 'search=needlexyz'))->toBe([]);
    });

    it('takes percent, underscore, the escape character and backslash literally', function () {
        listed('pct', ['prompt_excerpt' => '100% sure']);
        listed('und', ['prompt_excerpt' => 'a_b']);
        listed('any', ['prompt_excerpt' => 'axb and 100 sure']);
        listed('bang', ['prompt_excerpt' => 'wow!']);
        listed('slash', ['prompt_excerpt' => 'c:\\dir']);
        listed('plain', ['prompt_excerpt' => 'nothing']);

        expect(idsAt($this, 'search='.urlencode('%')))->toBe(['pct'])
            ->and(idsAt($this, 'search='.urlencode('0% s')))->toBe(['pct'])
            ->and(idsAt($this, 'search='.urlencode('_')))->toBe(['und'])
            ->and(idsAt($this, 'search='.urlencode('a_b')))->toBe(['und'])
            ->and(idsAt($this, 'search='.urlencode('!')))->toBe(['bang'])
            ->and(idsAt($this, 'search='.urlencode('\\')))->toBe(['slash'])
            ->and(idsAt($this, 'search='.urlencode('!%')))->toBe([]);
    });

    it('combines with the other filters and counts like them', function () {
        listed('a', ['name' => 'Needle', 'status' => Status::Failed]);
        listed('b', ['name' => 'Needle', 'status' => Status::Completed]);
        listed('c', ['name' => 'Other', 'status' => Status::Completed]);

        $response = $this->getJson('/trail/api/traces?search=needle&status=failed')->assertOk();

        expect(array_column($response->json('data'), 'id'))->toBe(['a'])
            ->and($response->json('status_counts'))->toMatchArray(['all' => 2, 'failed' => 1, 'completed' => 1]);
    });
});

describe('sorting', function () {
    it('sorts by started_at, newest first by default, with ties by id in the same direction', function () {
        listed('a', ['started_at' => '2026-01-02 09:00:00']);
        listed('b', ['started_at' => '2026-01-02 11:00:00']);
        listed('c', ['started_at' => '2026-01-02 11:00:00']);

        expect(idsAt($this))->toBe(['c', 'b', 'a'])
            ->and(idsAt($this, 'sort=-started_at'))->toBe(['c', 'b', 'a'])
            ->and(idsAt($this, 'sort=started_at'))->toBe(['a', 'b', 'c']);
    });

    it('puts runs without a duration last in both directions', function () {
        listed('a', ['duration_ms' => 100]);
        listed('b');
        listed('c', ['duration_ms' => 300]);
        listed('d', ['duration_ms' => 200]);
        Rows::trace(['id' => 'running', 'status' => Status::Running, 'started_at' => '2026-01-02 10:00:00']);

        expect(idsAt($this, 'sort=duration'))->toBe(['a', 'd', 'c', 'b', 'running'])
            ->and(idsAt($this, 'sort=-duration'))->toBe(['c', 'd', 'a', 'running', 'b']);
    });

    it('puts runs without a cost last in both directions and a zero cost first when ascending', function () {
        listed('a', ['cost' => 0.5]);
        listed('b');
        listed('c', ['cost' => 0]);
        listed('d', ['cost' => 2]);

        expect(idsAt($this, 'sort=cost'))->toBe(['c', 'a', 'd', 'b'])
            ->and(idsAt($this, 'sort=-cost'))->toBe(['d', 'a', 'c', 'b']);
    });

    it('sorts by agent name, with ties by id', function () {
        listed('x1', ['name' => 'b']);
        listed('x2', ['name' => 'a']);
        listed('x3', ['name' => 'a']);
        listed('x4', ['name' => 'c']);

        expect(idsAt($this, 'sort=agent'))->toBe(['x2', 'x3', 'x1', 'x4'])
            ->and(idsAt($this, 'sort=-agent'))->toBe(['x4', 'x1', 'x3', 'x2']);
    });

    it('keeps the order of a tied sort stable across pages', function () {
        foreach (range(1, 7) as $i) {
            listed("t{$i}", ['duration_ms' => 100]);
        }

        $pages = [
            ...idsAt($this, 'sort=duration&per_page=3&page=1'),
            ...idsAt($this, 'sort=duration&per_page=3&page=2'),
            ...idsAt($this, 'sort=duration&per_page=3&page=3'),
        ];

        expect($pages)->toBe(['t1', 't2', 't3', 't4', 't5', 't6', 't7']);
    });
});

describe('pagination', function () {
    beforeEach(function () {
        foreach (range(1, 5) as $i) {
            listed("t{$i}", ['started_at' => Carbon::parse('2026-01-02 10:00:00')->addMinutes($i)]);
        }
    });

    it('pages through the runs', function () {
        $response = $this->getJson('/trail/api/traces?per_page=2&page=2')->assertOk();

        expect(array_column($response->json('data'), 'id'))->toBe(['t3', 't2'])
            ->and($response->json('pagination'))->toBe(['page' => 2, 'per_page' => 2, 'total' => 5, 'last_page' => 3])
            ->and(idsAt($this, 'per_page=2&page=3'))->toBe(['t1']);
    });

    it('answers a page past the end with no data and the same totals', function () {
        $response = $this->getJson('/trail/api/traces?per_page=2&page=9')->assertOk();

        expect($response->json('data'))->toBe([])
            ->and($response->json('pagination'))->toBe(['page' => 9, 'per_page' => 2, 'total' => 5, 'last_page' => 3])
            ->and($response->json('status_counts.all'))->toBe(5);
    });

    it('clamps per_page instead of refusing it', function () {
        expect($this->getJson('/trail/api/traces?per_page=1000')->json('pagination.per_page'))->toBe(100)
            ->and($this->getJson('/trail/api/traces?per_page=0')->json('pagination.per_page'))->toBe(1)
            ->and($this->getJson('/trail/api/traces?per_page=-5')->json('pagination.per_page'))->toBe(1);
    });

    it('takes the total from the selected status', function () {
        listed('f', ['status' => Status::Failed]);

        expect($this->getJson('/trail/api/traces?status=failed')->json('pagination.total'))->toBe(1)
            ->and($this->getJson('/trail/api/traces')->json('pagination.total'))->toBe(6);
    });
});

describe('status counts', function () {
    beforeEach(function () {
        listed('c1', ['name' => 'A']);
        listed('c2', ['name' => 'A']);
        listed('c3', ['name' => 'B']);
        listed('f1', ['name' => 'A', 'status' => Status::Failed]);
        listed('i1', ['name' => 'B', 'status' => Status::Incomplete]);
        listed('w1', ['name' => 'A', 'status' => Status::AwaitingApproval]);
        Rows::trace(['id' => 'r1', 'name' => 'A', 'status' => Status::Running, 'started_at' => '2026-01-02 10:00:00']);
        Rows::trace(['id' => 'stale', 'name' => 'A', 'status' => Status::Running, 'started_at' => '2026-01-02 10:00:00', 'created_at' => Carbon::now()->subHours(2)]);
        listed('outside', ['started_at' => '2025-12-01 00:00:00']);
    });

    it('counts every status of the range, a stale run as incomplete', function () {
        $this->getJson('/trail/api/traces')->assertOk()->assertJsonPath('status_counts', [
            'all' => 8, 'completed' => 3, 'failed' => 1, 'incomplete' => 2, 'running' => 1, 'awaiting_approval' => 1,
        ]);
    });

    it('keeps the counts when a status is selected and takes the total from it', function () {
        $response = $this->getJson('/trail/api/traces?status=completed')->assertOk();

        expect($response->json('status_counts'))->toBe(['all' => 8, 'completed' => 3, 'failed' => 1, 'incomplete' => 2, 'running' => 1, 'awaiting_approval' => 1])
            ->and($response->json('pagination.total'))->toBe(3)
            ->and($response->json('data'))->toHaveCount(3);
    });

    it('follows the other filters', function () {
        $this->getJson('/trail/api/traces?agent=A')->assertOk()->assertJsonPath('status_counts', [
            'all' => 6, 'completed' => 2, 'failed' => 1, 'incomplete' => 1, 'running' => 1, 'awaiting_approval' => 1,
        ]);
        $this->getJson('/trail/api/traces?agent=B&status=failed')->assertOk()
            ->assertJsonPath('status_counts', ['all' => 2, 'completed' => 1, 'failed' => 0, 'incomplete' => 1, 'running' => 0, 'awaiting_approval' => 0])
            ->assertJsonPath('pagination.total', 0)
            ->assertJsonPath('data', []);
    });

    it('follows the stale rule under other filters', function () {
        Rows::bookmark(Trace::findOrFail('stale'));
        Rows::bookmark(Trace::findOrFail('c1'));

        $this->getJson('/trail/api/traces?issue_kind=abandoned')->assertOk()
            ->assertJsonPath('status_counts', ['all' => 1, 'completed' => 0, 'failed' => 0, 'incomplete' => 1, 'running' => 0, 'awaiting_approval' => 0]);
        $this->getJson('/trail/api/traces?bookmarked=1&status=running')->assertOk()
            ->assertJsonPath('status_counts', ['all' => 2, 'completed' => 1, 'failed' => 0, 'incomplete' => 1, 'running' => 0, 'awaiting_approval' => 0])
            ->assertJsonPath('data', []);
    });

    it('reports a partly priced and an unpriced run as such in the list', function () {
        listed('partial', ['name' => 'P', 'cost' => 0.5, 'unpriced_span_count' => 1, 'input_tokens' => 10]);
        listed('unpriced', ['name' => 'P', 'unpriced_span_count' => 2, 'input_tokens' => 10]);

        $costs = collect($this->getJson('/trail/api/traces?agent=P')->json('data'))->pluck('cost', 'id');

        expect($costs['partial'])->toBe(['state' => 'partial', 'amount' => 0.5])
            ->and($costs['unpriced'])->toBe(['state' => 'unpriced', 'amount' => null])
            ->and(idsAt($this, 'unpriced=1'))->toEqualCanonicalizing(['partial', 'unpriced']);
    });

    it('lists a stale running run as incomplete and abandoned, and finds it as such', function () {
        $stale = fn (array $data) => collect($data)->firstWhere('id', 'stale');

        $listing = $this->getJson('/trail/api/traces')->json('data');

        expect($stale($listing))->toMatchArray(['status' => 'incomplete', 'issue_kind' => 'abandoned'])
            ->and($stale($listing)['cost'])->toBe(['state' => 'not_captured', 'amount' => null])
            ->and(idsAt($this, 'status=incomplete'))->toContain('stale', 'i1')
            ->and(idsAt($this, 'status=running'))->toBe(['r1'])
            ->and(idsAt($this, 'issue_kind=abandoned'))->toBe(['stale'])
            ->and($this->getJson('/trail/api/traces?status=running')->json('pagination.total'))->toBe(1)
            ->and($this->getJson('/trail/api/traces?status=incomplete')->json('pagination.total'))->toBe(2);
    });

    it('shows a running run as pending', function () {
        $running = collect($this->getJson('/trail/api/traces?status=running')->json('data'))->firstWhere('id', 'r1');

        expect($running['status'])->toBe('running')
            ->and($running['cost']['state'])->toBe('pending')
            ->and($running['usage']['state'])->toBe('pending');
    });
});

describe('slow', function () {
    it('compares against the nearest-rank 95th percentile of the range', function () {
        foreach (range(1, 20) as $i) {
            listed(sprintf('t%02d', $i), ['duration_ms' => $i * 10, 'name' => $i % 2 === 0 ? 'Even' : 'Odd']);
        }

        // Not in the range, without a duration, and running: none of them moves the threshold.
        listed('old', ['duration_ms' => 99999, 'started_at' => '2025-12-01 00:00:00']);
        listed('none');
        Rows::trace(['id' => 'running', 'status' => Status::Running, 'started_at' => '2026-01-02 10:00:00']);

        $response = $this->getJson('/trail/api/traces?slow=1&sort=duration')->assertOk();

        expect($response->json('slow_threshold_ms'))->toEqual(190)
            ->and(array_column($response->json('data'), 'id'))->toBe(['t19', 't20'])
            ->and($response->json('pagination.total'))->toBe(2)
            ->and($response->json('status_counts.all'))->toBe(2)
            // The other filters do not move the threshold.
            ->and($this->getJson('/trail/api/traces?slow=1&agent=Odd')->json('slow_threshold_ms'))->toEqual(190)
            ->and(idsAt($this, 'slow=1&agent=Odd'))->toBe(['t19'])
            ->and($this->getJson('/trail/api/traces')->json('slow_threshold_ms'))->toBeNull();
    });

    it('rounds the rank up', function () {
        foreach (range(1, 21) as $i) {
            listed(sprintf('t%02d', $i), ['duration_ms' => $i]);
        }

        // ceil(0.95 * 21) = 20
        expect($this->getJson('/trail/api/traces?slow=1')->json('slow_threshold_ms'))->toEqual(20);
    });

    it('is the only duration when there is one run with a duration', function () {
        listed('a', ['duration_ms' => 12.5]);
        listed('b');

        $response = $this->getJson('/trail/api/traces?slow=1')->assertOk();

        expect($response->json('slow_threshold_ms'))->toBe(12.5)
            ->and(array_column($response->json('data'), 'id'))->toBe(['a']);
    });

    it('matches nothing, with a null threshold, when no run has a duration', function () {
        listed('a');

        $response = $this->getJson('/trail/api/traces?slow=1')->assertOk();

        expect($response->json('data'))->toBe([])
            ->and($response->json('slow_threshold_ms'))->toBeNull()
            ->and($response->json('pagination.total'))->toBe(0)
            ->and($response->json('status_counts.all'))->toBe(0);
    });
});

describe('invalid input', function () {
    it('answers 422 keyed by the parameter', function (string $query, string $parameter) {
        $this->getJson('/trail/api/traces?'.$query)->assertUnprocessable()
            ->assertJsonValidationErrors([$parameter])
            ->assertJsonStructure(['message', 'errors' => [$parameter]]);
    })->with([
        'status' => ['status=sleeping', 'status'],
        'status array' => ['status[]=failed', 'status'],
        'status keyed array' => ['status[a]=failed', 'status'],
        'issue_kind' => ['issue_kind=oops', 'issue_kind'],
        'issue_kind array' => ['issue_kind[]=abandoned', 'issue_kind'],
        'sort' => ['sort=cheapest', 'sort'],
        'sort with a dash only' => ['sort=-', 'sort'],
        'sort array' => ['sort[]=cost', 'sort'],
        'agent array' => ['agent[]=a', 'agent'],
        'provider array' => ['provider[]=a', 'provider'],
        'model array' => ['model[]=a', 'model'],
        'tool array' => ['tool[]=a', 'tool'],
        'tool too long' => ['tool='.str_repeat('a', 256), 'tool'],
        'tool not UTF-8' => ['tool=%FF', 'tool'],
        'conversation array' => ['conversation[]=a', 'conversation'],
        'user_id array' => ['user_id[]=1', 'user_id'],
        'user_type array' => ['user_id=1&user_type[]=a', 'user_type'],
        'user_type without user_id' => ['user_type=A', 'user_id'],
        'streamed' => ['streamed=maybe', 'streamed'],
        'recovered' => ['recovered=yes', 'recovered'],
        'child_failed' => ['child_failed=2', 'child_failed'],
        'unpriced' => ['unpriced=on', 'unpriced'],
        'slow' => ['slow=TRUE', 'slow'],
        'bookmarked array' => ['bookmarked[]=1', 'bookmarked'],
        'search too long' => ['search='.str_repeat('a', 201), 'search'],
        'search array' => ['search[]=a', 'search'],
        'agent too long' => ['agent='.str_repeat('a', 256), 'agent'],
        'agent not UTF-8' => ['agent=%FF', 'agent'],
        'provider not UTF-8' => ['provider=%FF', 'provider'],
        'model not UTF-8' => ['model=%FF', 'model'],
        'conversation not UTF-8' => ['conversation=%FF', 'conversation'],
        'user_id not UTF-8' => ['user_id=%FF', 'user_id'],
        'user_type not UTF-8' => ['user_id=1&user_type=%FF', 'user_type'],
        'search not UTF-8' => ['search=%FF', 'search'],
        'agent with a NUL byte' => ['agent=a%00b', 'agent'],
    ]);

    it('accepts a search of exactly 200 characters', function () {
        $this->getJson('/trail/api/traces?search='.str_repeat('a', 200))->assertOk();
    });

    it('still validates the range and the page', function () {
        $this->getJson('/trail/api/traces?range=bad')->assertUnprocessable()->assertJsonValidationErrors(['range']);
        $this->getJson('/trail/api/traces?page=0')->assertUnprocessable()->assertJsonValidationErrors(['page']);
        $this->getJson('/trail/api/traces?per_page[]=1')->assertUnprocessable()->assertJsonValidationErrors(['per_page']);
    });
});

describe('access', function () {
    it('answers a denied request with a JSON 403, even when HTML is asked for', function () {
        $this->app['env'] = 'production';

        $this->get('/trail/api/traces', ['Accept' => 'text/html'])->assertForbidden()->assertJsonStructure(['message']);

        Trail::auth(fn () => true);

        $this->get('/trail/api/traces', ['Accept' => 'text/html'])->assertOk();

        // Rolling back this test's migrations asks for confirmation in production.
        $this->app['env'] = 'local';
    });

    it('answers a JSON 404 when the dashboard is switched off', function () {
        config(['trail.dashboard.enabled' => false]);

        $this->get('/trail/api/traces', ['Accept' => 'text/html'])->assertNotFound()->assertJsonStructure(['message']);
    });

    it('runs the same number of queries for one run as for thirty', function () {
        $queries = function (): int {
            $count = 0;
            DB::listen(function () use (&$count) {
                $count++;
            });

            $this->getJson('/trail/api/traces?provider=openai&search=run&bookmarked=1&sort=-cost')->assertOk();

            return $count;
        };

        $make = function (int $from, int $to) {
            foreach (range($from, $to) as $i) {
                $user = DB::table('users')->insertGetId(['name' => "User {$i}", 'email' => "u{$i}@example.test", 'password' => 'x']);
                $trace = listed(sprintf('run-%03d', $i), ['user_id' => (string) $user, 'user_type' => User::class, 'cost' => $i]);
                Rows::span($trace, ['provider' => 'openai', 'model' => 'gpt-5']);
                Rows::bookmark($trace);
            }
        };

        $make(1, 1);
        $one = $queries();

        $make(2, 30);
        $many = $queries();

        expect($many)->toBe($one);
    });
});
