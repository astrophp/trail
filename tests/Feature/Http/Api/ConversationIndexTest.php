<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Astro\Trail\Tests\Fixtures\Users\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:00:00');
});

afterEach(fn () => Carbon::setTestNow());

/**
 * One run of a conversation. It finished and started inside the default range unless told otherwise.
 *
 * @param  array<string, mixed>  $attributes
 */
function turn(string $conversation, string $started, array $attributes = []): Trace
{
    return Rows::trace([...[
        'id' => 'turn-'.str()->uuid(),
        'status' => Status::Completed,
        'conversation_id' => $conversation,
        'started_at' => $started,
    ], ...$attributes]);
}

/**
 * @return array<string, mixed>
 */
function conversationsAt(mixed $test, string $query = ''): array
{
    return $test->getJson('/trail/api/conversations'.($query === '' ? '' : '?'.$query))->assertOk()->json();
}

/**
 * The conversation ids a request lists, in order.
 *
 * @return list<string>
 */
function listedConversations(mixed $test, string $query = ''): array
{
    return array_column(conversationsAt($test, $query)['data'], 'id');
}

it('answers an empty database', function () {
    $this->getJson('/trail/api/conversations')->assertOk()->assertExactJson([
        'data' => [],
        'pagination' => ['page' => 1, 'per_page' => 25, 'total' => 0, 'last_page' => 1],
        'range' => ['preset' => '24h', 'from' => '2026-01-01T12:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z'],
        'counts' => ['all' => 0, 'failed' => 0],
    ]);
});

it('describes a conversation of one turn', function () {
    $id = DB::table('users')->insertGetId(['name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);
    turn('c1', '2026-01-02 10:00:00', [
        'name' => 'Assistant', 'user_id' => (string) $id, 'user_type' => User::class, 'prompt_excerpt' => 'Where is my order?',
        'input_tokens' => 100, 'output_tokens' => 20, 'cost' => 0.5,
    ]);

    $data = conversationsAt($this)['data'];

    expect($data)->toHaveCount(1)
        ->and($data[0])->toBe([
            'id' => 'c1',
            'turns' => ['all' => 1, 'completed' => 1, 'failed' => 0, 'incomplete' => 0, 'running' => 0, 'awaiting_approval' => 0],
            'agents' => ['Assistant'],
            'agent_count' => 1,
            'users' => [['id' => (string) $id, 'type' => User::class, 'name' => 'Ada', 'email' => 'ada@example.test']],
            'user_count' => 1,
            'usage' => [
                'state' => 'reported', 'input_tokens' => 100, 'output_tokens' => 20, 'cache_read_tokens' => null,
                'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => 120,
            ],
            'cost' => ['state' => 'estimated', 'amount' => 0.5],
            'prompt_excerpt' => 'Where is my order?',
            'first_activity_at' => '2026-01-02T10:00:00.000Z',
            'last_activity_at' => '2026-01-02T10:00:00.000Z',
        ]);
});

it('adds up the turns of a conversation and takes the prompt of the one that started last', function () {
    turn('c1', '2026-01-02 09:00:00', ['name' => 'Assistant', 'prompt_excerpt' => 'first', 'input_tokens' => 10, 'output_tokens' => 1, 'reasoning_tokens' => 4, 'cost' => 0.25]);
    turn('c1', '2026-01-02 11:00:00', ['name' => 'Assistant', 'prompt_excerpt' => 'last', 'input_tokens' => 30, 'cache_read_tokens' => 7, 'cost' => 0.5]);
    turn('c1', '2026-01-02 10:00:00', ['name' => 'Assistant', 'prompt_excerpt' => 'middle', 'status' => Status::Failed]);

    $row = conversationsAt($this)['data'][0];

    expect($row['turns'])->toBe(['all' => 3, 'completed' => 2, 'failed' => 1, 'incomplete' => 0, 'running' => 0, 'awaiting_approval' => 0])
        ->and($row['usage'])->toBe([
            'state' => 'reported', 'input_tokens' => 40, 'output_tokens' => 1, 'cache_read_tokens' => 7,
            'cache_write_tokens' => null, 'reasoning_tokens' => 4, 'total_tokens' => 41,
        ])
        ->and($row['cost'])->toBe(['state' => 'estimated', 'amount' => 0.75])
        ->and($row['prompt_excerpt'])->toBe('last')
        ->and($row['first_activity_at'])->toBe('2026-01-02T09:00:00.000Z')
        ->and($row['last_activity_at'])->toBe('2026-01-02T11:00:00.000Z');
});

it('takes the prompt of the latest turn by id when two started together', function () {
    turn('c1', '2026-01-02 10:00:00', ['id' => 'turn-a', 'prompt_excerpt' => 'from a']);
    turn('c1', '2026-01-02 10:00:00', ['id' => 'turn-b', 'prompt_excerpt' => 'from b']);

    expect(conversationsAt($this)['data'][0]['prompt_excerpt'])->toBe('from b');
});

it('has a null prompt when the latest turn has none', function () {
    turn('c1', '2026-01-02 09:00:00', ['prompt_excerpt' => 'earlier']);
    turn('c1', '2026-01-02 10:00:00');

    expect(conversationsAt($this)['data'][0]['prompt_excerpt'])->toBeNull();
});

it('lists the agents of a conversation by name and counts all of them beyond the cap', function () {
    foreach (['Golf', 'Echo', 'Delta', 'Alpha', 'Foxtrot', 'Bravo', 'Charlie', 'Alpha'] as $minutes => $name) {
        turn('c1', '2026-01-02 10:0'.$minutes.':00', ['name' => $name]);
    }
    turn('c2', '2026-01-02 10:00:00', ['name' => 'Solo']);

    $data = collect(conversationsAt($this)['data'])->keyBy('id');

    expect($data['c1']['agents'])->toBe(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
        ->and($data['c1']['agent_count'])->toBe(7)
        ->and($data['c1']['turns']['all'])->toBe(8)
        ->and($data['c2']['agents'])->toBe(['Solo'])
        ->and($data['c2']['agent_count'])->toBe(1);
});

it('lists the users of a conversation and counts all of them beyond the cap', function () {
    foreach (['1', '2', '3', '4', '4'] as $minutes => $user) {
        turn('c1', '2026-01-02 10:0'.$minutes.':00', ['user_id' => $user, 'user_type' => 'Type\\A']);
    }
    // The same id under another type is another user; a turn without a user is not one.
    turn('c1', '2026-01-02 10:09:00', ['user_id' => '1', 'user_type' => 'Type\\B']);
    turn('c1', '2026-01-02 10:10:00');
    turn('c2', '2026-01-02 10:00:00');

    $data = collect(conversationsAt($this)['data'])->keyBy('id');

    expect($data['c1']['users'])->toHaveCount(3)
        ->and(array_column($data['c1']['users'], 'id'))->toBe(['1', '2', '3'])
        ->and($data['c1']['user_count'])->toBe(5)
        ->and($data['c2']['users'])->toBe([])
        ->and($data['c2']['user_count'])->toBe(0);
});

it('lists a user that can no longer be found with a null name and email, and counts it', function () {
    turn('c1', '2026-01-02 10:00:00', ['user_id' => '999', 'user_type' => User::class]);

    $row = conversationsAt($this)['data'][0];

    expect($row['users'])->toBe([['id' => '999', 'type' => User::class, 'name' => null, 'email' => null]])
        ->and($row['user_count'])->toBe(1);
});

it('keeps the milliseconds of the first and last activity', function () {
    turn('c1', '2026-01-02 10:00:00.123');
    turn('c1', '2026-01-02 11:00:00.456');

    $row = conversationsAt($this)['data'][0];

    expect($row['first_activity_at'])->toBe('2026-01-02T10:00:00.123Z')
        ->and($row['last_activity_at'])->toBe('2026-01-02T11:00:00.456Z');
});

it('selects a conversation that started before the range, counts it whole and keeps its first activity', function () {
    turn('straddle', '2025-12-25 09:00:00', ['name' => 'Old', 'cost' => 1.0, 'input_tokens' => 100, 'user_id' => '5', 'user_type' => 'Type\\A']);
    turn('straddle', '2026-01-02 10:00:00', ['name' => 'New', 'cost' => 0.5, 'input_tokens' => 50, 'status' => Status::Failed]);
    // After the end of the range: a turn the range does not hold, still part of the conversation.
    turn('straddle', '2026-01-02 12:30:00', ['name' => 'Later', 'cost' => 0.25, 'input_tokens' => 25]);

    $row = conversationsAt($this)['data'][0];

    expect($row['id'])->toBe('straddle')
        ->and($row['turns']['all'])->toBe(3)
        ->and($row['turns']['failed'])->toBe(1)
        ->and($row['agents'])->toBe(['Later', 'New', 'Old'])
        ->and($row['user_count'])->toBe(1)
        ->and($row['usage']['input_tokens'])->toBe(175)
        ->and($row['cost']['amount'])->toBe(1.75)
        ->and($row['first_activity_at'])->toBe('2025-12-25T09:00:00.000Z')
        ->and($row['last_activity_at'])->toBe('2026-01-02T12:30:00.000Z');
});

it('leaves out a conversation with no turn that started in the range, and counts only the others', function () {
    turn('outside', '2026-01-01 11:59:59');
    turn('outside', '2026-01-02 12:00:00');
    turn('inside', '2026-01-01 12:00:00');

    $body = conversationsAt($this);

    expect(array_column($body['data'], 'id'))->toBe(['inside'])
        ->and($body['pagination']['total'])->toBe(1);
});

it('takes an explicit range', function () {
    turn('then', '2025-12-01 08:00:00');
    turn('now', '2026-01-02 10:00:00');

    $body = conversationsAt($this, 'from=2025-12-01T00:00:00Z&to=2025-12-02T00:00:00Z');

    expect(array_column($body['data'], 'id'))->toBe(['then'])
        ->and($body['range']['preset'])->toBeNull();
});

it('does not list runs without a conversation id, and treats an empty id the same', function () {
    Rows::trace(['id' => 'alone', 'status' => Status::Completed, 'started_at' => '2026-01-02 10:00:00']);
    Rows::trace(['id' => 'blank', 'status' => Status::Completed, 'conversation_id' => '', 'started_at' => '2026-01-02 10:00:00']);
    turn('c1', '2026-01-02 10:00:00');

    $body = conversationsAt($this);

    expect(array_column($body['data'], 'id'))->toBe(['c1'])
        ->and($body['pagination']['total'])->toBe(1)
        ->and($body['data'][0]['turns']['all'])->toBe(1);
});

it('counts the statuses of the turns after the stale rule', function () {
    turn('c1', '2026-01-02 10:00:00', ['status' => Status::Completed]);
    turn('c1', '2026-01-02 10:01:00', ['status' => Status::Failed]);
    turn('c1', '2026-01-02 10:02:00', ['status' => Status::Incomplete]);
    turn('c1', '2026-01-02 10:03:00', ['status' => Status::AwaitingApproval]);
    // Still marked running a day after it was first stored: incomplete, not running.
    turn('c1', '2026-01-02 10:04:00', ['status' => Status::Running, 'created_at' => '2026-01-02 08:00:00']);
    turn('c1', '2026-01-02 11:59:00', ['status' => Status::Running, 'created_at' => '2026-01-02 11:59:00']);

    $row = conversationsAt($this)['data'][0];

    expect($row['turns'])->toBe(['all' => 6, 'completed' => 1, 'failed' => 1, 'incomplete' => 2, 'running' => 1, 'awaiting_approval' => 1]);
});

it('makes usage and cost pending while a turn runs, and keeps what has been recorded', function () {
    turn('c1', '2026-01-02 10:00:00', ['input_tokens' => 10, 'cost' => 0.25]);
    turn('c1', '2026-01-02 11:59:00', ['status' => Status::Running, 'created_at' => '2026-01-02 11:59:00', 'input_tokens' => 5, 'cost' => 0.125]);

    $row = conversationsAt($this)['data'][0];

    expect($row['usage']['state'])->toBe('pending')
        ->and($row['usage']['input_tokens'])->toBe(15)
        ->and($row['cost'])->toBe(['state' => 'pending', 'amount' => 0.375]);
});

it('does not hold a stale turn to be running for usage and cost', function () {
    turn('c1', '2026-01-02 10:00:00', ['status' => Status::Running, 'created_at' => '2026-01-02 08:00:00', 'input_tokens' => 5, 'cost' => 0.5]);

    $row = conversationsAt($this)['data'][0];

    expect($row['usage']['state'])->toBe('reported')
        ->and($row['cost'])->toBe(['state' => 'estimated', 'amount' => 0.5]);
});

it('reports the cost state from the sums of the turns', function (array $turns, string $state, ?float $amount) {
    foreach ($turns as $index => $attributes) {
        turn('c1', '2026-01-02 10:0'.$index.':00', $attributes);
    }

    expect(conversationsAt($this)['data'][0]['cost'])->toBe(['state' => $state, 'amount' => $amount]);
})->with([
    'priced' => [[['cost' => 0.5], ['cost' => 0.25]], 'estimated', 0.75],
    'partly priced' => [[['cost' => 0.5], ['unpriced_span_count' => 1, 'input_tokens' => 10]], 'partial', 0.5],
    'priced turn with an unpriced span' => [[['cost' => 0.5, 'unpriced_span_count' => 2]], 'partial', 0.5],
    'unpriced' => [[['unpriced_span_count' => 1, 'input_tokens' => 10], ['input_tokens' => 4]], 'unpriced', null],
    'not captured' => [[['status' => Status::Failed], []], 'not_captured', null],
]);

it('keeps a decimal sum exact', function () {
    foreach ([1, 2, 3] as $minute) {
        turn('c1', '2026-01-02 10:0'.$minute.':00', ['cost' => '0.1000000001']);
    }

    expect(conversationsAt($this)['data'][0]['cost']['amount'])->toBe(0.3000000003);
});

it('leaves a token count null when no turn reported it', function () {
    turn('c1', '2026-01-02 10:00:00', ['output_tokens' => 0]);
    turn('c1', '2026-01-02 10:01:00', ['output_tokens' => 7]);
    turn('c2', '2026-01-02 10:00:00');

    $data = collect(conversationsAt($this)['data'])->keyBy('id');

    expect($data['c1']['usage'])->toBe([
        'state' => 'reported', 'input_tokens' => null, 'output_tokens' => 7, 'cache_read_tokens' => null,
        'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => 7,
    ])
        ->and($data['c2']['usage'])->toBe([
            'state' => 'not_reported', 'input_tokens' => null, 'output_tokens' => null, 'cache_read_tokens' => null,
            'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => null,
        ]);
});

describe('filters', function () {
    beforeEach(function () {
        // c1 has its failed turn, its agent "Hidden" and its user 9 only before the range.
        turn('c1', '2025-12-20 10:00:00', ['name' => 'Hidden', 'status' => Status::Failed, 'user_id' => '9', 'user_type' => 'Type\\A', 'prompt_excerpt' => 'needle in the past']);
        turn('c1', '2026-01-02 10:00:00', ['name' => 'Visible']);
        turn('c2', '2026-01-02 10:00:00', ['name' => 'Visible', 'user_id' => '9', 'user_type' => 'Type\\B']);
        turn('c3', '2026-01-02 10:00:00', ['name' => 'Other', 'status' => Status::Incomplete]);
        turn('c4', '2026-01-02 10:00:00', ['name' => 'Other', 'status' => Status::Running, 'created_at' => '2026-01-02 08:00:00']);
        turn('c5', '2026-01-02 10:00:00', ['name' => 'Other', 'status' => Status::Running, 'created_at' => '2026-01-02 11:59:00']);
        turn('c6', '2026-01-02 10:00:00', ['name' => 'Other', 'status' => Status::AwaitingApproval]);
        turn('far', '2025-12-20 10:00:00', ['name' => 'Hidden']);
    });

    it('filters on each parameter', function (string $query, array $expected) {
        $ids = listedConversations($this, $query);
        sort($ids);

        expect($ids)->toBe($expected);
    })->with([
        'agent in the range' => ['agent=Visible', ['c1', 'c2']],
        'agent only outside the range' => ['agent=Hidden', ['c1']],
        'agent nobody has' => ['agent=Nobody', []],
        'user_id' => ['user_id=9', ['c1', 'c2']],
        'user_id and user_type' => ['user_id=9&user_type=Type%5CB', ['c2']],
        'user only outside the range' => ['user_id=9&user_type=Type%5CA', ['c1']],
        'failed counts failed, incomplete and stale turns' => ['failed=1', ['c1', 'c3', 'c4']],
        'failed true' => ['failed=true', ['c1', 'c3', 'c4']],
        'failed off' => ['failed=0', ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']],
        'search in a prompt outside the range' => ['search=NEEDLE', ['c1']],
        'search in the conversation id' => ['search=c3', ['c3']],
        'search in the user id' => ['search=9', ['c1', 'c2']],
        'an empty parameter is absent' => ['agent=&search=&failed=', ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']],
    ]);

    it('matches the user id and type on the same turn', function () {
        // Turn (9, A) and turn (5, B) are two users: neither is user 9 of type B.
        turn('mixed', '2026-01-02 10:00:00', ['user_id' => '9', 'user_type' => 'Type\\A']);
        turn('mixed', '2026-01-02 10:01:00', ['user_id' => '5', 'user_type' => 'Type\\B']);

        expect(listedConversations($this, 'user_id=9&user_type=Type%5CB'))->toBe(['c2'])
            ->and(listedConversations($this, 'user_id=9&user_type=Type%5CA'))->toContain('mixed');
    });

    it('combines filters with and', function () {
        expect(listedConversations($this, 'agent=Hidden&failed=1'))->toBe(['c1'])
            ->and(listedConversations($this, 'agent=Visible&failed=1'))->toBe(['c1'])
            ->and(listedConversations($this, 'agent=Other&user_id=9'))->toBe([])
            ->and(listedConversations($this, 'agent=Visible&search=needle'))->toBe(['c1']);
    });

    it('shows a conversation whole when a turn outside the range selected it', function () {
        $row = conversationsAt($this, 'agent=Hidden')['data'][0];

        expect($row['turns']['all'])->toBe(2)
            ->and($row['agents'])->toBe(['Hidden', 'Visible'])
            ->and($row['turns']['failed'])->toBe(1);
    });

    it('does not select a conversation by a turn when the range holds none of its turns', function () {
        expect(listedConversations($this, 'agent=Hidden&range=7d'))->toBe(['c1']);
    });

    it('applies the filters to the total', function () {
        expect(conversationsAt($this, 'failed=1&per_page=1')['pagination'])->toBe(['page' => 1, 'per_page' => 1, 'total' => 3, 'last_page' => 3]);
    });
});

describe('counts', function () {
    beforeEach(function () {
        turn('ok', '2026-01-02 10:00:00', ['name' => 'Alpha', 'user_id' => '1', 'user_type' => 'T']);
        turn('bad', '2026-01-02 10:00:00', ['name' => 'Alpha', 'user_id' => '2', 'user_type' => 'T', 'status' => Status::Failed, 'prompt_excerpt' => 'needle']);
        turn('incomplete', '2026-01-02 10:00:00', ['name' => 'Beta', 'user_id' => '1', 'user_type' => 'T', 'status' => Status::Incomplete]);
        turn('fresh', '2026-01-02 10:00:00', ['name' => 'Beta', 'status' => Status::Running, 'created_at' => '2026-01-02 11:59:00']);
        turn('stale', '2026-01-02 10:00:00', ['name' => 'Beta', 'status' => Status::Running, 'created_at' => '2026-01-02 08:00:00']);
    });

    it('counts the view and the failed conversations in it', function () {
        expect(conversationsAt($this)['counts'])->toBe(['all' => 5, 'failed' => 3]);
    });

    it('is the same object with and without the failed filter', function () {
        expect(conversationsAt($this, 'failed=1')['counts'])->toBe(conversationsAt($this)['counts'])
            ->and(conversationsAt($this, 'failed=1&agent=Beta')['counts'])->toBe(conversationsAt($this, 'agent=Beta')['counts']);
    });

    it('respects the agent, the user and the search', function (string $query, array $expected) {
        expect(conversationsAt($this, $query)['counts'])->toBe($expected);
    })->with([
        'agent' => ['agent=Alpha', ['all' => 2, 'failed' => 1]],
        'user' => ['user_id=1', ['all' => 2, 'failed' => 1]],
        'user and type' => ['user_id=2&user_type=T', ['all' => 1, 'failed' => 1]],
        'search' => ['search=needle', ['all' => 1, 'failed' => 1]],
        'agent and user' => ['agent=Beta&user_id=1', ['all' => 1, 'failed' => 1]],
    ]);

    it('respects the range', function () {
        turn('earlier', '2025-12-20 10:00:00', ['status' => Status::Failed]);

        expect(conversationsAt($this)['counts'])->toBe(['all' => 5, 'failed' => 3])
            ->and(conversationsAt($this, 'from=2025-12-19T00:00:00Z&to=2025-12-21T00:00:00Z')['counts'])->toBe(['all' => 1, 'failed' => 1]);
    });

    it('counts a conversation as failed for a stale running turn only', function () {
        expect(listedConversations($this, 'failed=1&search=stale'))->toBe(['stale'])
            ->and(listedConversations($this, 'failed=1&search=fresh'))->toBe([])
            ->and(conversationsAt($this, 'search=stale')['counts'])->toBe(['all' => 1, 'failed' => 1])
            ->and(conversationsAt($this, 'search=fresh')['counts'])->toBe(['all' => 1, 'failed' => 0]);
    });

    it('counts a conversation whose failed turn is outside the range when another turn is inside', function () {
        turn('whole', '2025-12-20 10:00:00', ['status' => Status::Failed]);
        turn('whole', '2026-01-02 09:00:00');

        expect(conversationsAt($this)['counts'])->toBe(['all' => 6, 'failed' => 4]);
    });

    it('makes the total the count of the rows listed', function () {
        expect(conversationsAt($this)['pagination']['total'])->toBe(5)
            ->and(conversationsAt($this, 'failed=1')['pagination']['total'])->toBe(3)
            ->and(conversationsAt($this, 'failed=0')['pagination']['total'])->toBe(5)
            ->and(conversationsAt($this, 'failed=1&agent=Alpha')['pagination']['total'])->toBe(1);
    });

    it('is zero for an empty view and keeps its counts on a page past the end', function () {
        expect(conversationsAt($this, 'search=nothing-matches')['counts'])->toBe(['all' => 0, 'failed' => 0])
            ->and(conversationsAt($this, 'failed=1&search=nothing-matches')['counts'])->toBe(['all' => 0, 'failed' => 0])
            ->and(conversationsAt($this, 'per_page=2&page=9')['counts'])->toBe(['all' => 5, 'failed' => 3])
            ->and(conversationsAt($this, 'failed=1&per_page=2&page=9')['data'])->toBe([]);
    });
});

describe('search', function () {
    it('is case-insensitive and finds the conversation id, the user id and the prompt', function () {
        turn('Order-77', '2026-01-02 10:00:00');
        turn('c2', '2026-01-02 10:00:00', ['user_id' => 'Ada-1', 'user_type' => 'T']);
        turn('c3', '2026-01-02 10:00:00', ['prompt_excerpt' => 'Refund my ORDER']);
        turn('c4', '2026-01-02 10:00:00', ['name' => 'order', 'prompt_excerpt' => 'something else']);

        expect(listedConversations($this, 'search=order'))->toHaveCount(2)
            ->and(listedConversations($this, 'search=ADA-1'))->toBe(['c2']);
    });

    it('takes % _ and ! literally', function (string $term, string $stored, array $expected) {
        turn('plain', '2026-01-02 10:00:00', ['prompt_excerpt' => 'ab']);
        turn('lit', '2026-01-02 10:00:00', ['prompt_excerpt' => $stored]);

        expect(listedConversations($this, 'search='.rawurlencode($term)))->toBe($expected);
    })->with([
        'percent' => ['100%', 'was 100% sure', ['lit']],
        'percent is not a wildcard' => ['a%b', 'a-b', []],
        'underscore' => ['a_b', 'a_b', ['lit']],
        'underscore is not a wildcard' => ['a_b', 'axb', []],
        'bang' => ['hey!', 'hey! you', ['lit']],
        'bang before a percent' => ['!%', 'ok !% ok', ['lit']],
        'bang is not an escape' => ['!a', 'xay', []],
    ]);

    it('refuses a term of more than 200 characters and takes one of 200', function () {
        $this->getJson('/trail/api/conversations?search='.str_repeat('a', 201))->assertStatus(422)->assertJsonValidationErrors('search');
        $this->getJson('/trail/api/conversations?search='.str_repeat('a', 200))->assertOk();
    });
});

describe('sorting', function () {
    beforeEach(function () {
        turn('mid', '2026-01-02 10:00:00', ['cost' => 1.0]);
        turn('mid', '2026-01-02 10:01:00', ['cost' => 1.0]);
        turn('old', '2026-01-02 08:00:00', ['cost' => 5.0]);
        turn('new', '2026-01-02 11:30:00');
        turn('nothing', '2026-01-02 09:00:00');
        turn('three', '2026-01-02 07:00:00', ['cost' => 0.5]);
        turn('three', '2026-01-02 07:01:00');
        turn('three', '2026-01-02 07:02:00');
    });

    it('sorts', function (string $sort, array $expected) {
        expect(listedConversations($this, 'sort='.$sort))->toBe($expected);
    })->with([
        'default is last activity, newest first' => ['', ['new', 'mid', 'nothing', 'old', 'three']],
        '-last_activity' => ['-last_activity', ['new', 'mid', 'nothing', 'old', 'three']],
        'last_activity' => ['last_activity', ['three', 'old', 'nothing', 'mid', 'new']],
        '-turns, ties by id descending' => ['-turns', ['three', 'mid', 'old', 'nothing', 'new']],
        'turns, ties by id ascending' => ['turns', ['new', 'nothing', 'old', 'mid', 'three']],
        '-cost, rows without cost last by id descending' => ['-cost', ['old', 'mid', 'three', 'nothing', 'new']],
        'cost, rows without cost last by id ascending' => ['cost', ['three', 'mid', 'old', 'new', 'nothing']],
    ]);

    it('sorts by last activity by default', function () {
        expect(listedConversations($this))->toBe(listedConversations($this, 'sort=-last_activity'));
    });

    it('keeps one order across pages when values tie', function (string $sort) {
        // Eight conversations with the same turns, cost and start.
        foreach (range(1, 8) as $number) {
            turn('tie-'.$number, '2026-01-02 06:00:00', ['cost' => 2.0]);
        }

        $all = listedConversations($this, 'per_page=100&sort='.$sort);
        $paged = [];

        foreach (range(1, 5) as $page) {
            $paged = [...$paged, ...listedConversations($this, "per_page=3&page={$page}&sort={$sort}")];
        }

        expect($paged)->toBe($all)->and(array_unique($paged))->toHaveCount(count($all));
    })->with(['-last_activity', 'last_activity', '-turns', 'turns', '-cost', 'cost']);

    it('rejects a sort it does not know', function (string $sort) {
        $this->getJson('/trail/api/conversations?sort='.$sort)->assertStatus(422)->assertJsonValidationErrors('sort');
    })->with(['started_at', 'duration', '--turns', 'agent', 'turns,cost']);
});

describe('pagination', function () {
    it('pages the list and reports the totals', function () {
        foreach (range(1, 5) as $number) {
            turn('c'.$number, '2026-01-02 10:0'.$number.':00');
        }

        $second = conversationsAt($this, 'per_page=2&page=2');

        expect(array_column($second['data'], 'id'))->toBe(['c3', 'c2'])
            ->and($second['pagination'])->toBe(['page' => 2, 'per_page' => 2, 'total' => 5, 'last_page' => 3]);
    });

    it('answers a page past the end with no rows and the same totals', function () {
        foreach (range(1, 5) as $number) {
            turn('c'.$number, '2026-01-02 10:0'.$number.':00');
        }

        $body = conversationsAt($this, 'per_page=2&page=9');

        expect($body['data'])->toBe([])
            ->and($body['pagination'])->toBe(['page' => 9, 'per_page' => 2, 'total' => 5, 'last_page' => 3]);
    });

    it('counts a conversation of many turns once', function () {
        foreach (range(1, 6) as $number) {
            turn('only', '2026-01-02 10:0'.$number.':00');
        }

        expect(conversationsAt($this)['pagination']['total'])->toBe(1);
    });
});

describe('case-insensitive databases', function () {
    it('groups ids the way the database compares them and shows the spelling of the latest turn', function () {
        turn('Case-A', '2026-01-02 09:00:00', ['id' => 'turn-1']);
        turn('case-a', '2026-01-02 10:00:00', ['id' => 'turn-2']);
        turn('CASE-A', '2026-01-02 11:00:00', ['id' => 'turn-3', 'prompt_excerpt' => 'newest']);
        turn('other', '2026-01-02 08:00:00', ['id' => 'turn-4']);

        $body = conversationsAt($this, 'sort=-turns');
        $together = DB::connection()->getDriverName() === 'mysql';
        $case = collect($body['data'])->first(fn (array $row) => strtolower($row['id']) === 'case-a');

        if ($together) {
            // MySQL compares text without regard to case: one conversation of three turns.
            expect($body['pagination']['total'])->toBe(2)
                ->and($case['id'])->toBe('CASE-A')
                ->and($case['turns']['all'])->toBe(3)
                ->and($case['prompt_excerpt'])->toBe('newest')
                ->and($case['first_activity_at'])->toBe('2026-01-02T09:00:00.000Z');
        } else {
            // SQLite and Postgres tell the spellings apart: three conversations of one turn each.
            expect($body['pagination']['total'])->toBe(4)
                ->and(array_column($body['data'], 'id'))->toContain('Case-A', 'case-a', 'CASE-A')
                ->and(collect($body['data'])->every(fn (array $row) => $row['turns']['all'] === 1))->toBeTrue();
        }
    });
});

describe('validation', function () {
    it('answers a 422 in the documented shape', function (string $query, string $field) {
        $this->getJson('/trail/api/conversations?'.$query)
            ->assertStatus(422)
            ->assertJsonValidationErrors($field)
            ->assertJsonStructure(['message', 'errors' => [$field]]);
    })->with([
        'a range it does not know' => ['range=30d', 'range'],
        'a range with from' => ['range=1h&from=2026-01-01T00:00:00Z', 'range'],
        'a from without a to' => ['from=2026-01-01T00:00:00Z', 'to'],
        'a from after the to' => ['from=2026-01-03T00:00:00Z&to=2026-01-02T00:00:00Z', 'from'],
        'a date that is none' => ['from=nonsense&to=2026-01-02T00:00:00Z', 'from'],
        'a page that is not a number' => ['page=abc', 'page'],
        'a page below 1' => ['page=0', 'page'],
        'a per_page that is not a number' => ['per_page=many', 'per_page'],
        'a user_type without a user_id' => ['user_type=Type', 'user_id'],
        'a switch that is none' => ['failed=maybe', 'failed'],
        'a failed list' => ['failed[]=1', 'failed'],
        'an agent list' => ['agent[]=a', 'agent'],
        'a search with a NUL byte' => ['search=a%00b', 'search'],
        'a search that is not UTF-8' => ['search=%FF%FE', 'search'],
        'a sort list' => ['sort[]=turns', 'sort'],
    ]);

    it('clamps per_page instead of refusing it', function () {
        turn('c1', '2026-01-02 10:00:00');

        expect(conversationsAt($this, 'per_page=1000')['pagination']['per_page'])->toBe(100)
            ->and(conversationsAt($this, 'per_page=0')['pagination']['per_page'])->toBe(1);
    });
});

it('refuses an agent of more than 255 characters', function () {
    $this->getJson('/trail/api/conversations?agent='.str_repeat('a', 256))->assertStatus(422)->assertJsonValidationErrors('agent');
});

it('reads the same number of queries for a page of 1 and a page of 25', function () {
    foreach (range(1, 30) as $number) {
        $user = DB::table('users')->insertGetId(['name' => 'User '.$number, 'email' => "u{$number}@example.test", 'password' => 'x']);
        turn(sprintf('c%02d', $number), '2026-01-02 10:'.sprintf('%02d', $number).':00', ['user_id' => (string) $user, 'user_type' => User::class, 'name' => 'Agent '.($number % 4)]);
        turn(sprintf('c%02d', $number), '2026-01-02 09:'.sprintf('%02d', $number).':00', ['status' => Status::Running, 'created_at' => '2026-01-02 08:00:00']);
    }

    $queries = function (int $perPage) {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $rows = count(conversationsAt($this, 'per_page='.$perPage)['data']);
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return [$rows, $count];
    };

    [$one, $queriesForOne] = $queries(1);
    [$many, $queriesForMany] = $queries(25);

    expect($one)->toBe(1)
        ->and($many)->toBe(25)
        ->and($queriesForMany)->toBe($queriesForOne)
        // The page, the total, the totals, the latest turns, the agents, the users, and one lookup of the users' model.
        ->and($queriesForOne)->toBe(7);
});

it('is behind the access check', function () {
    $this->app['env'] = 'production';

    try {
        $this->getJson('/trail/api/conversations')->assertForbidden();
    } finally {
        $this->app['env'] = 'testing';
    }
});
