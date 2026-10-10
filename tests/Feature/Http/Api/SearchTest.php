<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Http\AgentRows;
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
 * A finished run that started inside the default range unless told otherwise.
 *
 * @param  array<string, mixed>  $attributes
 */
function foundRun(string $id, array $attributes = []): void
{
    Rows::trace([...['id' => $id, 'status' => Status::Completed, 'started_at' => '2026-01-02 10:00:00'], ...$attributes]);
}

/**
 * @return array<string, mixed>
 */
function searchAt(mixed $test, string $query): array
{
    return $test->getJson('/trail/api/search?'.$query)->assertOk()->json();
}

/**
 * The ids of a group of a search, in order.
 *
 * @param  'traces'|'conversations'|'agents'  $group
 * @return list<string>
 */
function foundIn(array $body, string $group): array
{
    return array_column($body['data'][$group], $group === 'agents' ? 'name' : 'id');
}

/**
 * @return list<string> every statement the request ran
 */
function searchStatements(mixed $test, string $query): array
{
    return AgentRows::statements(fn () => $test->getJson('/trail/api/search?'.$query)->assertOk());
}

const SEARCH_RUN = '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30';

it('answers an empty database', function () {
    $this->getJson('/trail/api/search?q=refund')->assertOk()->assertExactJson([
        'data' => ['traces' => [], 'conversations' => [], 'agents' => []],
        'query' => ['q' => 'refund', 'minimum' => 2, 'searched' => true],
        'limits' => [
            'traces' => ['limit' => 5, 'truncated' => false],
            'conversations' => ['limit' => 5, 'truncated' => false],
            'agents' => ['limit' => 5, 'truncated' => false],
        ],
        'range' => ['preset' => '24h', 'from' => '2026-01-01T12:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z'],
    ]);
});

describe('runs by id', function () {
    it('finds a whole id whenever the run started', function () {
        foundRun(SEARCH_RUN, ['started_at' => '2025-12-01 09:00:00']);
        foundRun('0199c2f4-ffff-7000-8000-000000000000', ['started_at' => '2025-12-01 09:00:00']);

        $body = searchAt($this, 'q='.SEARCH_RUN);

        expect(foundIn($body, 'traces'))->toBe([SEARCH_RUN])
            ->and($body['data']['traces'][0]['started_at'])->toBe('2025-12-01T09:00:00.000Z')
            ->and($body['limits']['traces'])->toBe(['limit' => 5, 'truncated' => false]);
    });

    it('finds the runs that begin with 8 characters or more, the latest first, whenever they started', function () {
        foundRun('0199c2f4-0001-7000-8000-000000000000', ['started_at' => '2025-12-01 09:00:00']);
        foundRun('0199c2f4-0002-7000-8000-000000000000', ['started_at' => '2025-12-03 09:00:00']);
        foundRun('0199c2f4-0003-7000-8000-000000000000', ['started_at' => '2025-12-02 09:00:00']);
        foundRun('0199c2f5-0004-7000-8000-000000000000', ['started_at' => '2025-12-04 09:00:00']);
        foundRun('0199c2f3-ffff-7000-8000-000000000000', ['started_at' => '2025-12-04 09:00:00']);

        expect(foundIn(searchAt($this, 'q=0199c2f4'), 'traces'))->toBe([
            '0199c2f4-0002-7000-8000-000000000000',
            '0199c2f4-0003-7000-8000-000000000000',
            '0199c2f4-0001-7000-8000-000000000000',
        ])
            ->and(foundIn(searchAt($this, 'q=0199C2F4-0003'), 'traces'))->toBe(['0199c2f4-0003-7000-8000-000000000000'])
            ->and(foundIn(searchAt($this, 'q='.urlencode('0199c2f4-')), 'traces'))->toHaveCount(3);
    });

    it('reads a prefix whose last digits are the largest as far as it goes', function () {
        foundRun('0199c2ff-ffff-7000-8000-000000000000', ['started_at' => '2025-12-01 09:00:00']);
        foundRun('0199c300-0000-7000-8000-000000000000', ['started_at' => '2025-12-01 09:00:00']);
        foundRun('ffffffff-ffff-7000-8000-000000000000', ['started_at' => '2025-12-01 09:00:00']);

        expect(foundIn(searchAt($this, 'q=0199c2ff'), 'traces'))->toBe(['0199c2ff-ffff-7000-8000-000000000000'])
            ->and(foundIn(searchAt($this, 'q=ffffffff'), 'traces'))->toBe(['ffffffff-ffff-7000-8000-000000000000'])
            ->and(foundIn(searchAt($this, 'q=0199c29f'), 'traces'))->toBe([]);
    });

    it('finds a run by an uppercase beginning of its lowercase id, as a prefix or as text', function () {
        // In the range, so that the text match finds it where the prefix read (lowercased, compared with LIKE) cannot.
        foundRun('0199c2f4-0001-7000-8000-000000000000');

        expect(foundIn(searchAt($this, 'q=0199C2F4'), 'traces'))->toBe(['0199c2f4-0001-7000-8000-000000000000'])
            ->and(foundIn(searchAt($this, 'q=0199C2F4-0001-7000-8000-000000000000'), 'traces'))->toBe(['0199c2f4-0001-7000-8000-000000000000']);
    });

    it('does not take 7 characters for the beginning of an id', function () {
        foundRun(SEARCH_RUN, ['started_at' => '2025-12-01 09:00:00']);

        expect(foundIn(searchAt($this, 'q=0199c2f'), 'traces'))->toBe([])
            ->and(foundIn(searchAt($this, 'q=0199c2f4'), 'traces'))->toBe([SEARCH_RUN]);
    });

    it('does not take a beginning that is not hexadecimal for an id', function () {
        foundRun('trace-abcdefgh-1', ['started_at' => '2025-12-01 09:00:00']);

        expect(foundIn(searchAt($this, 'q='.urlencode('trace-abcdefgh')), 'traces'))->toBe([])
            ->and(foundIn(searchAt($this, 'q='.urlencode('trace-abcdefgh-1')), 'traces'))->toBe(['trace-abcdefgh-1']);
    });

    it('lists a run that matches by id and by text once', function () {
        foundRun(SEARCH_RUN);

        $body = searchAt($this, 'q='.SEARCH_RUN);

        expect(foundIn($body, 'traces'))->toBe([SEARCH_RUN]);
    });

    it('does not report a cut when the runs found twice are all there is', function () {
        foreach (range(1, 5) as $i) {
            foundRun("0199c2f4-000{$i}-7000-8000-000000000000", ['started_at' => '2026-01-02 0'.$i.':00:00']);
        }

        $body = searchAt($this, 'q=0199c2f4');

        expect(foundIn($body, 'traces'))->toHaveCount(5)
            ->and($body['limits']['traces']['truncated'])->toBeFalse();
    });

    it('puts the runs found by id ahead of the runs found by text', function () {
        foundRun('0199c2f4-0001-7000-8000-000000000000', ['started_at' => '2025-12-01 09:00:00']);
        foundRun('0199c2f4-0002-7000-8000-000000000000', ['started_at' => '2025-12-02 09:00:00']);
        foundRun('text-newer', ['prompt_excerpt' => 'note 0199c2f4 here', 'started_at' => '2026-01-02 11:00:00']);
        foundRun('text-older', ['prompt_excerpt' => 'note 0199c2f4 there', 'started_at' => '2026-01-02 09:00:00']);

        expect(foundIn(searchAt($this, 'q=0199c2f4'), 'traces'))->toBe([
            '0199c2f4-0002-7000-8000-000000000000',
            '0199c2f4-0001-7000-8000-000000000000',
            'text-newer',
            'text-older',
        ]);
    });
});

describe('runs by text', function () {
    it('finds a word of the prompt, the latest first, within the range', function () {
        foundRun('old', ['prompt_excerpt' => 'Refund the duplicate charge', 'started_at' => '2026-01-02 08:00:00']);
        foundRun('new', ['prompt_excerpt' => 'Another DUPLICATE here', 'started_at' => '2026-01-02 09:00:00']);
        foundRun('outside', ['prompt_excerpt' => 'A duplicate long ago', 'started_at' => '2025-12-01 09:00:00']);
        foundRun('other', ['prompt_excerpt' => 'Nothing to see']);

        expect(foundIn(searchAt($this, 'q=duplicate'), 'traces'))->toBe(['new', 'old']);
    });

    it('does not return a text match outside the range, and returns it when the range holds it', function () {
        foundRun('outside', ['prompt_excerpt' => 'A duplicate long ago', 'started_at' => '2025-12-01 09:00:00']);

        expect(foundIn(searchAt($this, 'q=duplicate'), 'traces'))->toBe([])
            ->and(foundIn(searchAt($this, 'q=duplicate&range=7d'), 'traces'))->toBe([])
            ->and(foundIn(searchAt($this, 'q=duplicate&from=2025-12-01T00:00:00Z&to=2025-12-02T00:00:00Z'), 'traces'))->toBe(['outside']);
    });

    it('matches what the list of runs matches', function (string $term) {
        $user = DB::table('users')->insertGetId(['name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);
        foundRun('by-name', ['name' => 'Zeta Planner']);
        foundRun('by-provider', ['provider' => 'zetaai', 'started_at' => '2026-01-02 09:00:00']);
        foundRun('by-model', ['model' => 'zeta-1', 'started_at' => '2026-01-02 08:00:00']);
        foundRun('by-prompt', ['prompt_excerpt' => 'about zeta', 'started_at' => '2026-01-02 07:00:00']);
        foundRun('by-conversation', ['conversation_id' => 'zeta-chat', 'started_at' => '2026-01-02 06:00:00']);
        foundRun('by-user', ['user_id' => 'zeta-'.$user, 'user_type' => User::class, 'started_at' => '2026-01-02 05:00:00']);
        foundRun('by-id-zeta', ['started_at' => '2026-01-02 04:00:00']);
        foundRun('by-response', ['response_excerpt' => 'zeta in the answer', 'started_at' => '2026-01-02 03:00:00']);
        foundRun('by-class', ['agent_class' => 'App\\Ai\\Zeta', 'name' => 'Plain', 'started_at' => '2026-01-02 02:00:00']);

        $list = array_column($this->getJson('/trail/api/traces?search='.urlencode($term))->assertOk()->json('data'), 'id');
        $found = foundIn(searchAt($this, 'q='.urlencode($term)), 'traces');

        // The list holds seven; the search shows five of them in the list's order.
        expect(array_slice($list, 0, 5))->toBe($found)->and($found)->toHaveCount(5);
    })->with(['zeta', 'ZETA', 'eta']);

    it('does not find a user by name or email', function () {
        DB::table('users')->insert(['id' => 7, 'name' => 'Ada Lovelace', 'email' => 'ada@example.test', 'password' => 'x']);
        foundRun('mine', ['user_id' => '7', 'user_type' => User::class]);

        expect(foundIn(searchAt($this, 'q=lovelace'), 'traces'))->toBe([])
            ->and(foundIn(searchAt($this, 'q=ada%40example'), 'traces'))->toBe([]);
    });

    it('takes a percent sign and an underscore literally', function () {
        foundRun('pct', ['prompt_excerpt' => 'discount 50% off']);
        foundRun('und', ['prompt_excerpt' => 'file a_b']);
        foundRun('plain', ['prompt_excerpt' => 'file axb costs 500 or so']);

        expect(foundIn(searchAt($this, 'q='.urlencode('0%')), 'traces'))->toBe(['pct'])
            ->and(foundIn(searchAt($this, 'q='.urlencode('%%')), 'traces'))->toBe([])
            ->and(foundIn(searchAt($this, 'q='.urlencode('a_')), 'traces'))->toBe(['und'])
            ->and(foundIn(searchAt($this, 'q='.urlencode('__')), 'traces'))->toBe([]);
    });
});

describe('conversations', function () {
    it('finds a conversation by its whole id, with a slash in it, whenever it took place', function () {
        foundRun('turn-1', ['conversation_id' => 'support/ada 1042', 'started_at' => '2025-12-01 09:00:00']);
        foundRun('turn-2', ['conversation_id' => 'support/ada 1042', 'started_at' => '2025-12-01 09:05:00']);
        foundRun('other', ['conversation_id' => 'support/ada 1043', 'started_at' => '2025-12-01 09:00:00']);

        $body = searchAt($this, 'q='.urlencode('support/ada 1042'));

        expect(foundIn($body, 'conversations'))->toBe(['support/ada 1042'])
            ->and($body['data']['conversations'][0]['turns']['all'])->toBe(2)
            ->and(foundIn($body, 'traces'))->toBe([]);
    });

    it('does not find a conversation by part of its id, but finds its runs', function () {
        foundRun('turn-1', ['conversation_id' => 'support/ada 1042', 'started_at' => '2026-01-02 09:00:00']);
        foundRun('turn-2', ['conversation_id' => 'support/ada 1042', 'started_at' => '2026-01-02 10:00:00']);

        $body = searchAt($this, 'q='.urlencode('ada 10'));

        expect(foundIn($body, 'conversations'))->toBe([])
            ->and(foundIn($body, 'traces'))->toBe(['turn-2', 'turn-1'])
            ->and(array_column($body['data']['traces'], 'conversation_id'))->toBe(['support/ada 1042', 'support/ada 1042']);
    });

    it('does not find a conversation by a word of its turns or by its user', function () {
        foundRun('turn-1', ['conversation_id' => 'chat-a', 'prompt_excerpt' => 'needle one', 'user_id' => 'needle-user']);

        $body = searchAt($this, 'q=needle');

        expect(foundIn($body, 'conversations'))->toBe([])
            ->and(foundIn($body, 'traces'))->toBe(['turn-1']);
    });

    it('holds one conversation at most, and never reports a cut', function () {
        foreach (range(1, 7) as $i) {
            foundRun("turn-{$i}", ['conversation_id' => "chat-{$i}"]);
        }
        foundRun('turn-same', ['conversation_id' => 'chat-1']);

        $body = searchAt($this, 'q=chat-1');

        expect(foundIn($body, 'conversations'))->toBe(['chat-1'])
            ->and($body['data']['conversations'][0]['turns']['all'])->toBe(2)
            ->and($body['limits']['conversations'])->toBe(['limit' => 5, 'truncated' => false]);
    });

    it('takes a percent sign and an underscore in the id literally', function () {
        foundRun('a', ['conversation_id' => 'chat%1']);
        foundRun('b', ['conversation_id' => 'chat_2']);
        foundRun('c', ['conversation_id' => 'chatx2']);

        expect(foundIn(searchAt($this, 'q='.urlencode('chat%1')), 'conversations'))->toBe(['chat%1'])
            ->and(foundIn(searchAt($this, 'q='.urlencode('chat_2')), 'conversations'))->toBe(['chat_2'])
            ->and(foundIn(searchAt($this, 'q='.urlencode('chat%')), 'conversations'))->toBe([])
            ->and(foundIn(searchAt($this, 'q='.urlencode('chat_')), 'conversations'))->toBe([]);
    });

    it('does not find a run without a conversation as one', function () {
        foundRun('alone', ['prompt_excerpt' => 'needle']);

        $body = searchAt($this, 'q=needle');

        expect(foundIn($body, 'traces'))->toBe(['alone'])->and(foundIn($body, 'conversations'))->toBe([]);
    });
});

describe('agents', function () {
    it('finds an agent by a part of its name, whatever the case, as the list of agents does', function () {
        AgentRows::run('RefundAssistant', '2026-01-02 10:00:00', ['id' => 'r1']);
        AgentRows::run('RefundAssistant', '2026-01-02 10:30:00', ['id' => 'r2']);
        AgentRows::run('RefundsAudit', '2026-01-02 11:00:00', ['id' => 'r3']);
        AgentRows::run('Support', '2026-01-02 11:30:00', ['id' => 'r4']);

        $body = searchAt($this, 'q=REFUND');
        $listed = $this->getJson('/trail/api/agents?search=REFUND')->assertOk()->json();

        expect(foundIn($body, 'agents'))->toBe(['RefundAssistant', 'RefundsAudit'])
            ->and($body['data']['agents'])->toBe($listed['data'])
            ->and(count($body['data']['agents'][0]['activity']))->toBe(count($listed['buckets']['edges']));
    });

    it('finds only the agents of the range', function () {
        AgentRows::run('RefundAssistant', '2025-12-01 10:00:00', ['id' => 'old']);

        expect(foundIn(searchAt($this, 'q=refund'), 'agents'))->toBe([]);
    });

    it('takes a percent sign and an underscore literally', function () {
        AgentRows::run('Agent_One', '2026-01-02 10:00:00', ['id' => 'a']);
        AgentRows::run('AgentXOne', '2026-01-02 10:00:00', ['id' => 'b']);

        expect(foundIn(searchAt($this, 'q='.urlencode('t_o')), 'agents'))->toBe(['Agent_One'])
            ->and(foundIn(searchAt($this, 'q='.urlencode('%%')), 'agents'))->toBe([]);
    });
});

it('finds one query in all three groups', function () {
    foundRun('r1', ['name' => 'RefundAssistant', 'conversation_id' => 'refund', 'prompt_excerpt' => 'please refund me']);
    foundRun('r2', ['name' => 'Other', 'conversation_id' => 'refund-chat', 'prompt_excerpt' => 'refund again', 'started_at' => '2026-01-02 11:00:00']);

    $body = searchAt($this, 'q=refund');

    expect(foundIn($body, 'traces'))->toBe(['r2', 'r1'])
        ->and(foundIn($body, 'conversations'))->toBe(['refund'])
        ->and(foundIn($body, 'agents'))->toBe(['RefundAssistant'])
        ->and($body['query'])->toBe(['q' => 'refund', 'minimum' => 2, 'searched' => true]);
});

describe('the cap on a group', function () {
    it('returns 5 runs and says nothing is cut when exactly 5 match, and cuts at 5 when 6 do', function (int $matching, bool $truncated) {
        foreach (range(1, $matching) as $i) {
            foundRun("run-{$i}", ['prompt_excerpt' => 'needle', 'started_at' => '2026-01-02 0'.$i.':00:00']);
        }

        $body = searchAt($this, 'q=needle');

        expect(foundIn($body, 'traces'))->toBe(array_slice(['run-6', 'run-5', 'run-4', 'run-3', 'run-2', 'run-1'], $matching === 6 ? 0 : 1, 5))
            ->and($body['limits']['traces'])->toBe(['limit' => 5, 'truncated' => $truncated]);
    })->with([[5, false], [6, true]]);

    it('returns 5 agents and says nothing is cut when exactly 5 match, and cuts at 5 when 6 do', function (int $matching, bool $truncated) {
        // The agent with most runs first: Needle1 has the most.
        foreach (range(1, $matching) as $i) {
            foreach (range(1, $matching + 1 - $i) as $run) {
                AgentRows::run("Needle{$i}", '2026-01-02 10:00:00', ['id' => "agent-run-{$i}-{$run}"]);
            }
        }

        $body = searchAt($this, 'q=needle');

        expect(foundIn($body, 'agents'))->toBe(['Needle1', 'Needle2', 'Needle3', 'Needle4', 'Needle5'])
            ->and($body['limits']['agents'])->toBe(['limit' => 5, 'truncated' => $truncated]);
    })->with([[5, false], [6, true]]);

    it('counts the runs found by id and by text together', function () {
        foreach (range(1, 3) as $i) {
            foundRun("0199c2f4-000{$i}-7000-8000-000000000000", ['started_at' => '2025-12-0'.$i.' 09:00:00']);
        }

        foreach (range(1, 4) as $i) {
            foundRun("text-{$i}", ['prompt_excerpt' => 'see 0199c2f4', 'started_at' => '2026-01-02 0'.$i.':00:00']);
        }

        $body = searchAt($this, 'q=0199c2f4');

        expect(foundIn($body, 'traces'))->toBe([
            '0199c2f4-0003-7000-8000-000000000000',
            '0199c2f4-0002-7000-8000-000000000000',
            '0199c2f4-0001-7000-8000-000000000000',
            'text-4',
            'text-3',
        ])->and($body['limits']['traces']['truncated'])->toBeTrue();
    });

    it('reports a cut when the runs found by id alone are more than 5', function () {
        foreach (range(1, 6) as $i) {
            foundRun("0199c2f4-000{$i}-7000-8000-000000000000", ['started_at' => '2025-12-0'.$i.' 09:00:00']);
        }

        $body = searchAt($this, 'q=0199c2f4');

        expect(foundIn($body, 'traces'))->toHaveCount(5)->and($body['limits']['traces']['truncated'])->toBeTrue();
    });
});

describe('a query that is too short', function () {
    it('answers an empty search and reads nothing', function (string $query) {
        foundRun('a', ['name' => 'Alpha', 'conversation_id' => 'a', 'prompt_excerpt' => 'a']);

        $statements = searchStatements($this, $query);
        $body = searchAt($this, $query);

        expect($statements)->toBe([])
            ->and($body['data'])->toBe(['traces' => [], 'conversations' => [], 'agents' => []])
            ->and($body['query']['searched'])->toBeFalse()
            ->and($body['query']['minimum'])->toBe(2)
            ->and($body['limits']['traces'])->toBe(['limit' => 5, 'truncated' => false]);
    })->with([
        'missing' => [''],
        'empty' => ['q='],
        'one character' => ['q=a'],
        'one character and spaces' => ['q=+a+'],
        'only spaces' => ['q=+++'],
        'one multibyte character' => ['q=%C3%A9'],
    ]);

    it('searches from 2 characters and answers the text it searched', function () {
        foundRun('a', ['prompt_excerpt' => 'ab']);

        $body = searchAt($this, 'q=+ab+');

        expect($body['query'])->toBe(['q' => 'ab', 'minimum' => 2, 'searched' => true])
            ->and(foundIn($body, 'traces'))->toBe(['a']);
    });

    it('still validates the range', function () {
        $this->getJson('/trail/api/search?range=bad')->assertUnprocessable()->assertJsonValidationErrors(['range']);
    });
});

it('finds nothing and says so', function () {
    foundRun('a', ['prompt_excerpt' => 'hello', 'conversation_id' => 'chat']);
    AgentRows::run('Alpha', '2026-01-02 10:00:00', ['id' => 'b']);

    $body = searchAt($this, 'q=zzzz');

    expect($body['data'])->toBe(['traces' => [], 'conversations' => [], 'agents' => []])
        ->and($body['query']['searched'])->toBeTrue()
        ->and($body['limits']['traces']['truncated'])->toBeFalse();
});

describe('validation', function () {
    it('refuses what the lists refuse', function (string $query) {
        $this->getJson('/trail/api/search?'.$query)->assertUnprocessable()->assertJsonValidationErrors(['q']);
    })->with([
        'too long' => ['q='.str_repeat('a', 201)],
        'an array' => ['q[]=ab'],
        'a NUL byte' => ['q=ab%00cd'],
        'not UTF-8' => ['q=%FFab'],
        'cut in a character' => ['q=ab%C3'],
        'overlong UTF-8' => ['q=ab%C0%AF'],
    ]);

    it('answers a NUL byte at either end like the lists do: the framework trims it away', function () {
        foundRun('a', ['prompt_excerpt' => 'ab']);

        $trailing = searchAt($this, 'q=ab%00');
        $alone = searchAt($this, 'q=%00');

        expect($trailing['query'])->toBe(['q' => 'ab', 'minimum' => 2, 'searched' => true])
            ->and(foundIn($trailing, 'traces'))->toBe(['a'])
            ->and($alone['query']['searched'])->toBeFalse();
    });

    it('accepts a query of exactly 200 characters', function () {
        $body = searchAt($this, 'q='.str_repeat('a', 200));

        expect($body['query']['searched'])->toBeTrue();
    });

    it('reads nothing for a query it refuses', function () {
        foundRun('a', ['prompt_excerpt' => 'ab']);

        $statements = AgentRows::statements(fn () => $this->getJson('/trail/api/search?q=ab%00cd')->assertUnprocessable());

        expect($statements)->toBe([]);
    });
});

describe('queries', function () {
    it('runs no more queries for twelve matching runs than for one', function () {
        $user = DB::table('users')->insertGetId(['name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);

        $make = function (int $from, int $to) use ($user) {
            foreach (range($from, $to) as $i) {
                foundRun("run-{$i}", ['name' => "Needle{$i}", 'conversation_id' => "needle-{$i}", 'prompt_excerpt' => 'needle', 'user_id' => (string) $user, 'user_type' => User::class]);
            }
        };

        // The conversation whose id is the text, so that it is described too.
        foundRun('whole', ['conversation_id' => 'needle', 'user_id' => (string) $user, 'user_type' => User::class]);
        $make(1, 1);
        $one = count(searchStatements($this, 'q=needle'));

        $make(2, 12);
        $many = count(searchStatements($this, 'q=needle'));

        // Two reads of runs (a whole id, then text), one of the conversation (its whole id), four of
        // agents, four to describe the conversation, the bookmarks of the runs, and one lookup of
        // the users of each user type for the runs and again for the conversation.
        expect($many)->toBe($one)->and($one)->toBe(14);
    });

    it('runs the most queries when every group has a hit and the text is also the beginning of an id', function () {
        $user = DB::table('users')->insertGetId(['name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);
        foundRun('0199c2f4-0001-7000-8000-000000000000', ['name' => '0199c2f4 agent', 'conversation_id' => '0199c2f4', 'user_id' => (string) $user, 'user_type' => User::class]);

        // The most the endpoint reads: every group has a match, and the runs are looked up as a prefix too.
        expect(count(searchStatements($this, 'q=0199c2f4')))->toBe(15);
    });
});

describe('access', function () {
    it('answers a denied request with a JSON 403 outside local, and the gate lets it through', function () {
        $this->app['env'] = 'production';

        try {
            $this->get('/trail/api/search?q=refund', ['Accept' => 'text/html'])->assertForbidden()->assertJsonStructure(['message']);

            Trail::auth(fn () => true);

            $this->get('/trail/api/search?q=refund', ['Accept' => 'text/html'])->assertOk();
        } finally {
            // Rolling back this test's migrations asks for confirmation in production.
            $this->app['env'] = 'testing';
        }
    });

    it('answers a JSON 404 when the dashboard is switched off', function () {
        config(['trail.dashboard.enabled' => false]);

        $this->get('/trail/api/search?q=refund', ['Accept' => 'text/html'])->assertNotFound()->assertJsonStructure(['message']);
    });
});
