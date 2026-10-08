<?php

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Queries\ConversationId;
use Astro\Trail\Queries\TraceDetail;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Astro\Trail\Tests\Fixtures\Users\Member;
use Astro\Trail\Tests\Fixtures\Users\User;
use Illuminate\Foundation\Http\Kernel;
use Illuminate\Foundation\Http\Middleware\ConvertEmptyStringsToNull;
use Illuminate\Foundation\Http\Middleware\TrimStrings;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| The endpoint of a conversation's transcript: its id, its window and its cost
|--------------------------------------------------------------------------
|
| What the messages say is tested where they come from: the stitching on hand-laid spans, and
| ConversationTranscriptCaptureTest on spans recorded from the real SDK.
|
*/

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:00:00');

    // The middleware every application has, which would trim and blank a conversation id read the usual way.
    $kernel = $this->app->make(Kernel::class);
    $kernel->pushMiddleware(TrimStrings::class);
    $kernel->pushMiddleware(ConvertEmptyStringsToNull::class);
});

afterEach(fn () => Carbon::setTestNow());

/**
 * The turns of a conversation, one a minute from 09:00 and each a completed run with a prompt.
 *
 * @return list<Trace>
 */
function transcriptTurns(string $conversation, int $count, int $from = 1, array $attributes = []): array
{
    $turns = [];

    for ($number = $from; $number < $from + $count; $number++) {
        $turns[] = Rows::trace([
            'id' => sprintf('t%02d', $number), 'status' => Status::Completed, 'conversation_id' => $conversation,
            'prompt_excerpt' => 'Question '.$number, 'started_at' => Carbon::parse('2026-01-02 09:00:00')->addMinutes($number),
            ...$attributes,
        ]);
    }

    return $turns;
}

/**
 * @return list<string>
 */
function transcriptIds(array $body): array
{
    return array_map(fn (array $turn): string => $turn['trace']['id'], $body['data']['turns']);
}

function transcriptUrl(string $conversation, string $query = ''): string
{
    return '/trail/api/conversations/transcript?id='.rawurlencode($conversation).($query === '' ? '' : '&'.$query);
}

/**
 * @return array<string, mixed>
 */
function transcriptAt(mixed $test, string $conversation, string $query = ''): array
{
    return $test->getJson(transcriptUrl($conversation, $query))->assertOk()->json();
}

describe('the id of the conversation', function () {
    it('is read from the query, whatever characters it holds', function (string $id) {
        Rows::trace(['id' => 'other', 'status' => Status::Completed, 'conversation_id' => 'decoy', 'started_at' => '2026-01-02 09:00:00']);
        Rows::trace(['id' => 'turn-1', 'status' => Status::Completed, 'conversation_id' => $id, 'started_at' => '2026-01-02 10:00:00']);

        $body = transcriptAt($this, $id);

        expect($body['data']['conversation']['id'])->toBe($id)
            ->and(transcriptIds($body))->toBe(['turn-1'])
            ->and($body['data']['turns'][0]['trace']['conversation_id'])->toBe($id);
    })->with([
        'a slash' => ['support/ada'],
        'a trailing slash' => ['support/'],
        'a dot' => ['.'],
        'two dots' => ['..'],
        'a leading space' => [' lead'],
        'a trailing space' => ['trail '],
        'edge spaces' => [' both '],
        'an inner space' => ['in ner'],
        'a percent sign' => ['100%'],
        'an encoded slash, literally' => ['a%2Fb'],
        'a hash' => ['a#b'],
        'a question mark' => ['a?b'],
        'an ampersand' => ['a&b'],
        'an equals sign' => ['a=b'],
        'a plus' => ['a+b'],
        'a bracket' => ['a[]b'],
        'non-ascii' => ['sürü ☃ 日本'],
        'the width of the column' => [str_repeat('x', 255)],
        'the width of the column in multibyte characters' => [str_repeat('é', 255)],
    ]);

    it('is not trimmed by the framework, which would have trimmed it from the query bag', function () {
        $this->app['router']->get('/trail-probe', fn (Request $request) => response()->json(['query' => $request->query('id'), 'raw' => $request->server->get('QUERY_STRING')]));

        // Proves the middleware under test is in effect: the framework's own view of the id has lost its spaces.
        $this->getJson('/trail-probe?id=%20a%20')->assertOk()->assertJson(['query' => 'a']);

        Rows::trace(['id' => 'turn-1', 'status' => Status::Completed, 'conversation_id' => ' a ', 'started_at' => '2026-01-02 10:00:00']);
        Rows::trace(['id' => 'turn-2', 'status' => Status::Completed, 'conversation_id' => 'a', 'started_at' => '2026-01-02 11:00:00']);

        expect(transcriptIds(transcriptAt($this, ' a ')))->toBe(['turn-1'])
            ->and(transcriptIds(transcriptAt($this, 'a')))->toBe(['turn-2']);
    });

    it('is a 404 before any query when it is missing, empty, a list, too long or not text', function (string $query) {
        Rows::trace(['id' => 'turn-1', 'status' => Status::Completed, 'conversation_id' => 'c', 'started_at' => '2026-01-02 10:00:00']);
        DB::enableQueryLog();

        $this->getJson('/trail/api/conversations/transcript'.$query)->assertNotFound()->assertJsonStructure(['message']);

        expect(DB::getQueryLog())->toBe([]);
    })->with([
        'missing' => [''],
        'missing, with other parameters' => ['?limit=3'],
        'empty' => ['?id='],
        'without a value' => ['?id'],
        'a list' => ['?id[]=c'],
        'a map' => ['?id[a]=c'],
        'too long' => ['?id='.str_repeat('x', 256)],
        'too long in multibyte characters' => ['?id='.str_repeat('%C3%A9', 256)],
        'a NUL byte' => ['?id=c%00'],
        'invalid UTF-8' => ['?id=c%FF%FE'],
    ]);

    it('is a 404 for a conversation that has no turns, and for a turn with an empty one', function () {
        Rows::trace(['id' => 'turn-1', 'status' => Status::Completed, 'conversation_id' => '', 'started_at' => '2026-01-02 10:00:00']);
        Rows::trace(['id' => 'turn-2', 'status' => Status::Completed, 'conversation_id' => null, 'started_at' => '2026-01-02 10:00:00']);

        $this->getJson(transcriptUrl('unknown'))->assertNotFound();
        $this->getJson('/trail/api/conversations/transcript?id=')->assertNotFound();
    });

    it('has no route that takes the id in the path', function () {
        Rows::trace(['id' => 'turn-1', 'status' => Status::Completed, 'conversation_id' => 'c', 'started_at' => '2026-01-02 10:00:00']);

        $this->getJson('/trail/api/conversations/c')->assertNotFound()->assertJsonStructure(['message']);
        $this->getJson('/trail/api/conversations/c/transcript')->assertNotFound();
        $this->getJson('/trail/api/conversations/transcript/c')->assertNotFound();
    });

    it('has one rule for what a possible id is', function () {
        expect(ConversationId::isPossible('a'))->toBeTrue()
            ->and(ConversationId::isPossible(str_repeat('é', 255)))->toBeTrue()
            ->and(ConversationId::isPossible(str_repeat('é', 256)))->toBeFalse()
            ->and(ConversationId::isPossible(''))->toBeFalse()
            ->and(ConversationId::isPossible("a\0"))->toBeFalse()
            ->and(ConversationId::isPossible("a\xFF"))->toBeFalse();
    });

    it('is matched by the database, so a case variant resolves on MySQL and names the latest spelling', function () {
        Rows::trace(['id' => 'turn-1', 'status' => Status::Completed, 'conversation_id' => 'Case-Id', 'started_at' => '2026-01-02 10:00:00']);
        Rows::trace(['id' => 'turn-2', 'status' => Status::Completed, 'conversation_id' => 'case-id', 'started_at' => '2026-01-02 11:00:00']);

        $body = $this->getJson(transcriptUrl('CASE-ID'));

        if (DB::connection()->getDriverName() === 'mysql') {
            expect($body->assertOk()->json('data.conversation.id'))->toBe('case-id')
                ->and(transcriptIds($body->json()))->toBe(['turn-1', 'turn-2']);

            return;
        }

        $body->assertNotFound();
        expect(transcriptIds(transcriptAt($this, 'case-id')))->toBe(['turn-2']);
    });

    it('is a 403 as JSON when the access check refuses', function () {
        $this->app['env'] = 'production';

        try {
            $this->getJson(transcriptUrl('c'))->assertForbidden()->assertJsonStructure(['message']);
        } finally {
            $this->app['env'] = 'testing';
        }
    });
});

describe('the window', function () {
    beforeEach(function () {
        transcriptTurns('c', 25);
    });

    it('is the newest ten turns, oldest first', function () {
        $body = transcriptAt($this, 'c');

        expect(transcriptIds($body))->toBe(array_map(fn (int $n): string => sprintf('t%02d', $n), range(16, 25)))
            ->and($body['turn_limit'])->toBe(['limit' => 10, 'total' => 25, 'truncated' => true])
            ->and($body['window'])->toBe(['older' => 15, 'newer' => 0, 'anchor' => null])
            ->and(array_keys($body))->toBe(['data', 'turn_limit', 'window'])
            ->and(array_keys($body['data']))->toBe(['conversation', 'turns'])
            ->and($body['data']['conversation']['turns']['all'])->toBe(25);
    });

    it('clamps the limit to between one and ten and reports the one it used', function (string $limit, int $expected) {
        $body = transcriptAt($this, 'c', $limit);

        expect($body['turn_limit']['limit'])->toBe($expected)
            ->and($body['data']['turns'])->toHaveCount($expected)
            ->and(array_slice(transcriptIds($body), -1))->toBe(['t25']);
    })->with([
        'zero' => ['limit=0', 1],
        'negative' => ['limit=-4', 1],
        'one' => ['limit=1', 1],
        'three' => ['limit=3', 3],
        'ten' => ['limit=10', 10],
        'eleven' => ['limit=11', 10],
        'huge' => ['limit=99999999999', 10],
        'too large for an integer' => ['limit=99999999999999999999', 10],
        'too small for an integer' => ['limit=-99999999999999999999', 1],
        'too large with a sign' => ['limit=%2B99999999999999999999', 10],
        'empty' => ['limit=', 10],
    ]);

    it('rejects a limit that is not a whole number with a 422', function (string $limit) {
        $this->getJson(transcriptUrl('c', $limit))->assertUnprocessable()->assertJsonValidationErrors('limit');
    })->with(['text' => ['limit=ten'], 'a fraction' => ['limit=2.5'], 'an exponent' => ['limit=1e1'], 'a list' => ['limit[]=2'], 'a space' => ['limit=%201x']]);

    it('ends at the turn when it is asked for, inclusive, and takes the older ones', function () {
        $body = transcriptAt($this, 'c', 'turn=t15&limit=4');

        expect(transcriptIds($body))->toBe(['t12', 't13', 't14', 't15'])
            ->and($body['window'])->toBe(['older' => 11, 'newer' => 10, 'anchor' => ['param' => 'turn', 'id' => 't15', 'found' => true]]);
    });

    it('starts the window ending at the first turn with that one alone', function () {
        $body = transcriptAt($this, 'c', 'turn=t01');

        expect(transcriptIds($body))->toBe(['t01'])
            ->and($body['window'])->toMatchArray(['older' => 0, 'newer' => 24]);
    });

    it('takes the turns strictly older than the one before, the nearest ones, oldest first', function () {
        $body = transcriptAt($this, 'c', 'before=t15&limit=3');

        expect(transcriptIds($body))->toBe(['t12', 't13', 't14'])
            ->and($body['window'])->toBe(['older' => 11, 'newer' => 11, 'anchor' => ['param' => 'before', 'id' => 't15', 'found' => true]]);
    });

    it('takes the turns strictly newer than the one after, the nearest ones, oldest first', function () {
        $body = transcriptAt($this, 'c', 'after=t15&limit=3');

        expect(transcriptIds($body))->toBe(['t16', 't17', 't18'])
            ->and($body['window'])->toBe(['older' => 15, 'newer' => 7, 'anchor' => ['param' => 'after', 'id' => 't15', 'found' => true]]);
    });

    it('counts the turns beyond the window at the first and the last turn', function () {
        expect(transcriptAt($this, 'c', 'before=t02&limit=5')['window'])->toMatchArray(['older' => 0, 'newer' => 24])
            ->and(transcriptAt($this, 'c', 'after=t24&limit=5')['window'])->toMatchArray(['older' => 24, 'newer' => 0]);
    });

    it('has no turns before the first one, and says everything is newer', function () {
        $body = transcriptAt($this, 'c', 'before=t01');

        expect($body['data']['turns'])->toBe([])
            ->and($body['window'])->toBe(['older' => 0, 'newer' => 25, 'anchor' => ['param' => 'before', 'id' => 't01', 'found' => true]])
            ->and($body['turn_limit'])->toBe(['limit' => 10, 'total' => 25, 'truncated' => true])
            ->and($body['data']['conversation']['id'])->toBe('c');
    });

    it('has no turns after the last one, and says everything is older', function () {
        $body = transcriptAt($this, 'c', 'after=t25');

        expect($body['data']['turns'])->toBe([])
            ->and($body['window'])->toBe(['older' => 25, 'newer' => 0, 'anchor' => ['param' => 'after', 'id' => 't25', 'found' => true]])
            ->and($body['turn_limit']['truncated'])->toBeTrue();
    });

    it('ignores the range, the trace filters, the paging and parameters it does not know', function () {
        $plain = transcriptAt($this, 'c', 'turn=t15&limit=4');
        $noisy = transcriptAt($this, 'c', 'turn=t15&limit=4&range=1h&from=2020-01-01&to=2020-01-02&status=failed&agent=Nobody&conversation=other&search=zzz&sort=-cost&page=7&per_page=1&failed=1&unknown=1');

        expect($noisy)->toBe($plain);
    });

    it('answers the newest window, and says the anchor was not found, for a turn that is not in the conversation', function (string $anchor) {
        Rows::trace(['id' => 'elsewhere', 'status' => Status::Completed, 'conversation_id' => 'other', 'started_at' => '2026-01-02 10:00:00']);

        $newest = transcriptAt($this, 'c');
        $body = transcriptAt($this, 'c', $anchor);

        expect($body['data'])->toBe($newest['data'])
            ->and($body['turn_limit'])->toBe($newest['turn_limit'])
            ->and(explode('=', $anchor)[0])->toBe($body['window']['anchor']['param'])
            ->and($body['window']['anchor']['found'])->toBeFalse()
            ->and($body['window']['anchor']['id'])->toBe(explode('=', $anchor)[1])
            ->and($body['window']['older'])->toBe($newest['window']['older'])
            ->and($body['window']['newer'])->toBe(0);
    })->with([
        'a pruned turn' => ['turn=pruned'],
        'before a pruned turn' => ['before=pruned'],
        'after a pruned turn' => ['after=pruned'],
        'a turn of another conversation' => ['turn=elsewhere'],
        'after a turn of another conversation' => ['after=elsewhere'],
    ]);

    it('is a 422 with more than one anchor, or an anchor that cannot be a turn', function (string $query, string $field) {
        $this->getJson(transcriptUrl('c', $query))->assertUnprocessable()->assertJsonValidationErrors($field);
    })->with([
        'turn and before' => ['turn=t01&before=t02', 'before'],
        'before and after' => ['before=t01&after=t02', 'after'],
        'all three' => ['turn=t01&before=t02&after=t03', 'before'],
        'empty' => ['turn=', 'turn'],
        'empty before' => ['before=', 'before'],
        'spaces only' => ['after=%20%20', 'after'],
        'a list' => ['turn[]=t01', 'turn'],
        'too long' => ['before='.str_repeat('x', 65), 'before'],
        'invalid UTF-8' => ['turn=%FF', 'turn'],
    ]);

    it('is a 422 for an anchor with a NUL byte inside it', function () {
        $this->getJson(transcriptUrl('c', 'after=t%0001'))->assertUnprocessable()->assertJsonValidationErrors('after');
    });

    it('reads an anchor with a NUL byte at its end as the anchor, because the byte is trimmed at the edge', function () {
        $body = transcriptAt($this, 'c', 'after=t01%00');

        expect($body['window']['anchor'])->toBe(['param' => 'after', 'id' => 't01', 'found' => true]);
    });

    it('accepts an anchor as long as the column', function () {
        $body = transcriptAt($this, 'c', 'turn='.str_repeat('x', 64));

        expect($body['window']['anchor']['found'])->toBeFalse();
    });

    it('is a 404 before a 422 for an id that cannot be a conversation', function () {
        $this->getJson('/trail/api/conversations/transcript?turn=a&before=b')->assertNotFound();
    });
});

describe('the counts beyond the window', function () {
    it('are right whatever the number of turns', function (int $turns, int $older, int $newer) {
        transcriptTurns('c', $turns);

        $body = transcriptAt($this, 'c');

        expect($body['window'])->toBe(['older' => $older, 'newer' => $newer, 'anchor' => null])
            ->and($body['turn_limit'])->toBe(['limit' => 10, 'total' => $turns, 'truncated' => $older + $newer > 0])
            ->and($body['data']['turns'])->toHaveCount(min($turns, 10));
    })->with([
        'nine' => [9, 0, 0],
        'ten' => [10, 0, 0],
        'eleven' => [11, 1, 0],
        'twenty-five' => [25, 15, 0],
    ]);

    it('are right in the middle of eleven turns', function () {
        transcriptTurns('c', 11);

        expect(transcriptAt($this, 'c', 'turn=t06&limit=2')['window'])->toMatchArray(['older' => 4, 'newer' => 5])
            ->and(transcriptAt($this, 'c', 'before=t11&limit=10')['window'])->toMatchArray(['older' => 0, 'newer' => 1]);
    });

    it('count the turns of this conversation only', function () {
        transcriptTurns('c', 12);
        transcriptTurns('other', 30, 40);

        expect(transcriptAt($this, 'c')['window'])->toMatchArray(['older' => 2, 'newer' => 0]);
    });
});

describe('turns that start together', function () {
    /** Pages through the conversation, newer or older each time, and returns every id in the order met. */
    function transcriptWalk(mixed $test, string $conversation, string $direction, int $limit): array
    {
        $seen = [];
        $body = transcriptAt($test, $conversation, "limit={$limit}");

        // Start from the newest page for walking back, or from the oldest for walking forward.
        if ($direction === 'after') {
            $body = transcriptAt($test, $conversation, 'turn='.transcriptEdge($conversation, oldest: true).'&limit=1');
        }

        $pages = 0;

        while ($body['data']['turns'] !== [] && $pages++ < 50) {
            $ids = transcriptIds($body);
            array_push($seen, ...($direction === 'before' ? array_reverse($ids) : $ids));
            $edge = $direction === 'before' ? $ids[0] : $ids[count($ids) - 1];
            $body = transcriptAt($test, $conversation, "{$direction}={$edge}&limit={$limit}");
        }

        return $seen;
    }

    function transcriptEdge(string $conversation, bool $oldest): string
    {
        return (string) Trace::query()->where('conversation_id', $conversation)->orderBy('started_at', $oldest ? 'asc' : 'desc')->orderBy('id', $oldest ? 'asc' : 'desc')->value('id');
    }

    it('page with none lost and none repeated', function (string $direction) {
        // Eight turns in the same millisecond, three a millisecond apart, and two a second later.
        foreach (['b', 'a', 'd', 'c', 'f', 'e', 'h', 'g'] as $id) {
            Rows::trace(['id' => 'tie-'.$id, 'status' => Status::Completed, 'conversation_id' => 'c', 'started_at' => '2026-01-02 09:00:00.500']);
        }
        foreach (['x' => '.501', 'y' => '.502', 'z' => '.503'] as $id => $milliseconds) {
            Rows::trace(['id' => 'ms-'.$id, 'status' => Status::Completed, 'conversation_id' => 'c', 'started_at' => '2026-01-02 09:00:00'.$milliseconds]);
        }
        foreach (['p', 'q'] as $id) {
            Rows::trace(['id' => 'late-'.$id, 'status' => Status::Completed, 'conversation_id' => 'c', 'started_at' => '2026-01-02 09:00:01.000']);
        }

        $expected = ['tie-a', 'tie-b', 'tie-c', 'tie-d', 'tie-e', 'tie-f', 'tie-g', 'tie-h', 'ms-x', 'ms-y', 'ms-z', 'late-p', 'late-q'];
        $order = fn (array $seen): array => $direction === 'before' ? array_reverse($seen) : $seen;

        expect($order(transcriptWalk($this, 'c', $direction, 3)))->toBe($expected)
            ->and($order(transcriptWalk($this, 'c', $direction, 10)))->toBe($expected)
            ->and($order(transcriptWalk($this, 'c', $direction, 1)))->toBe($expected);
    })->with(['walking back' => ['before'], 'walking forward' => ['after']]);

    it('keep their order when they differ only in milliseconds', function () {
        Rows::trace(['id' => 'a', 'status' => Status::Completed, 'conversation_id' => 'c', 'started_at' => '2026-01-02 09:00:00.002']);
        Rows::trace(['id' => 'z', 'status' => Status::Completed, 'conversation_id' => 'c', 'started_at' => '2026-01-02 09:00:00.001']);

        expect(transcriptIds(transcriptAt($this, 'c')))->toBe(['z', 'a'])
            ->and(transcriptIds(transcriptAt($this, 'c', 'after=z')))->toBe(['a'])
            ->and(transcriptIds(transcriptAt($this, 'c', 'before=a')))->toBe(['z'])
            ->and(transcriptIds(transcriptAt($this, 'c', 'turn=z')))->toBe(['z']);
    });
});

describe('the cost of a request', function () {
    beforeEach(function () {
        $this->queries = [];
        DB::listen(function ($query) {
            $this->queries[] = $query->sql;
        });
    });

    /**
     * How many queries a request makes, and how many of them read the users table.
     *
     * @return array{int, int}
     */
    function transcriptCost(mixed $test, string $query): array
    {
        $test->queries = [];
        transcriptAt($test, 'c', $query);

        return [count($test->queries), count(array_filter($test->queries, fn (string $sql): bool => str_contains($sql, 'from "users"') || str_contains($sql, 'from `users`')))];
    }

    function transcriptUsers(): void
    {
        DB::table('users')->insert([['id' => 7, 'name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x'], ['id' => 8, 'name' => 'Grace', 'email' => 'grace@example.test', 'password' => 'x']]);
    }

    it('is the same for one turn and for ten, in every mode', function (string $anchor) {
        transcriptUsers();
        transcriptTurns('c', 12, 1, ['user_id' => '7', 'user_type' => User::class]);
        transcriptTurns('c', 1, 13, ['user_id' => '8', 'user_type' => User::class]);

        $one = transcriptCost($this, ltrim($anchor.'&limit=1', '&'));
        $ten = transcriptCost($this, ltrim($anchor.'&limit=10', '&'));

        // The two requests read windows of different sizes.
        expect(count(transcriptAt($this, 'c', ltrim($anchor.'&limit=1', '&'))['data']['turns']))->toBe(1)
            ->and(count(transcriptAt($this, 'c', ltrim($anchor.'&limit=10', '&'))['data']['turns']))->toBe(10)
            ->and($ten)->toBe($one)
            ->and($ten[1])->toBe(1);
    })->with([
        'the newest' => [''],
        'ending at a turn' => ['turn=t11'],
        'before a turn' => ['before=t12'],
        'after a turn' => ['after=t01'],
    ]);

    it('is eight queries and one for the users, plus one for an anchor', function () {
        transcriptUsers();
        transcriptTurns('c', 12, 1, ['user_id' => '7', 'user_type' => User::class]);

        expect(transcriptCost($this, ''))->toBe([9, 1])
            ->and(transcriptCost($this, 'turn=t05'))->toBe([10, 1])
            ->and(transcriptCost($this, 'before=t05'))->toBe([10, 1])
            ->and(transcriptCost($this, 'after=t05'))->toBe([10, 1])
            ->and(transcriptCost($this, 'turn=pruned'))->toBe([10, 1]);
    });

    it('looks up each type of user once, for the header and the turns together', function () {
        DB::table('users')->insert(['id' => 7, 'name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);
        transcriptTurns('c', 3, 1, ['user_id' => '7', 'user_type' => User::class]);
        transcriptTurns('c', 2, 4, ['user_id' => '7', 'user_type' => Member::class]);

        // Two models over one table: the eight queries, and one lookup for each model, not for each turn or for the header.
        expect(transcriptCost($this, ''))->toBe([10, 2]);
    });

    it('reads one more for a turn that has more spans than the limit', function () {
        transcriptTurns('c', 2, 1);
        $baseline = transcriptCost($this, '');

        $big = Rows::trace(['id' => 't03', 'status' => Status::Completed, 'conversation_id' => 'c', 'started_at' => '2026-01-02 10:00:00', 'span_count' => 2001]);
        $now = Carbon::now()->format('Y-m-d H:i:s.v');

        foreach (array_chunk(range(1, 2001), 250) as $chunk) {
            DB::table('trail_spans')->insert(array_map(fn (int $sequence): array => [
                'id' => sprintf('big-%05d', $sequence), 'trace_id' => $big->id, 'type' => $sequence === 1 ? 'agent' : 'step', 'name' => 'step', 'status' => 'completed',
                'sequence' => $sequence, 'started_at' => $now, 'created_at' => $now, 'updated_at' => $now,
            ], $chunk));
        }

        $body = transcriptAt($this, 'c');
        $this->queries = [];
        transcriptAt($this, 'c');

        expect(count($this->queries))->toBe($baseline[0] + 1)
            ->and(array_slice($body['data']['turns'], -1)[0]['span_limit'])->toBe(['limit' => TraceDetail::SPAN_LIMIT, 'total' => 2001, 'truncated' => true]);
    });
});

describe('the status of a turn', function () {
    it('is the effective status: a stale running turn is incomplete and a stale running tool is too', function () {
        $stale = Carbon::now()->subHours(5)->format('Y-m-d H:i:s.v');
        $turn = Rows::trace(['id' => 't01', 'status' => Status::Running, 'conversation_id' => 'c', 'started_at' => '2026-01-02 06:55:00', 'created_at' => $stale]);
        Rows::span($turn, ['id' => 'r', 'type' => SpanType::Agent, 'sequence' => 1, 'status' => Status::Running, 'created_at' => $stale, 'input' => ['prompt' => 'Hi']]);
        Rows::span($turn, [
            'id' => 's1', 'parent_id' => 'r', 'sequence' => 2, 'status' => Status::Completed, 'created_at' => $stale,
            'input' => ['messages' => [['role' => 'user', 'content' => 'Hi']], 'messages_offset' => 0],
            'output' => ['text' => '', 'tool_calls' => [['id' => 'c1', 'name' => 'lookup', 'arguments' => ['q' => 'a']]]],
        ]);
        Rows::span($turn, ['id' => 't1', 'parent_id' => 'r', 'type' => SpanType::Tool, 'name' => 'lookup', 'sequence' => 3, 'status' => Status::Running, 'created_at' => $stale, 'input' => ['arguments' => ['q' => 'a']]]);

        $body = transcriptAt($this, 'c');
        $call = $body['data']['turns'][0]['messages'][1]['tool_calls'][0];

        expect($body['data']['turns'][0]['trace'])->toMatchArray(['status' => 'incomplete', 'issue_kind' => 'abandoned'])
            ->and($call['link'])->toBe('linked')
            ->and($call['span'])->toMatchArray(['id' => 't1', 'status' => 'incomplete', 'issue_kind' => 'abandoned'])
            ->and($body['data']['turns'][0]['messages'][1]['part'])->toBe('activity')
            ->and($body['data']['conversation']['turns'])->toMatchArray(['incomplete' => 1, 'running' => 0]);
    });

    it('leaves the header pending while a turn is running, and the calls not started', function () {
        $turn = Rows::trace(['id' => 't01', 'status' => Status::Running, 'conversation_id' => 'c', 'started_at' => '2026-01-02 11:59:00', 'input_tokens' => 10]);
        Rows::span($turn, ['id' => 'r', 'type' => SpanType::Agent, 'sequence' => 1, 'status' => Status::Running, 'input' => ['prompt' => 'Hi']]);
        Rows::span($turn, [
            'id' => 's1', 'parent_id' => 'r', 'sequence' => 2, 'status' => Status::Completed,
            'input' => ['messages' => [['role' => 'user', 'content' => 'Hi']], 'messages_offset' => 0],
            'output' => ['text' => '', 'tool_calls' => [['id' => 'c1', 'name' => 'lookup', 'arguments' => ['q' => 'a']]]],
        ]);

        $body = transcriptAt($this, 'c');
        $call = $body['data']['turns'][0]['messages'][1]['tool_calls'][0];

        expect($body['data']['conversation']['usage']['state'])->toBe('pending')
            ->and($body['data']['conversation']['cost']['state'])->toBe('pending')
            ->and($body['data']['turns'][0]['trace']['status'])->toBe('running')
            ->and($call)->toMatchArray(['link' => 'not_started', 'span' => null, 'agent' => null])
            ->and($body['data']['turns'][0]['messages_state'])->toBe('stored');
    });

    it('polls one running turn: the window ending at it, limit one, is the same turn', function () {
        transcriptTurns('c', 3);

        $newest = transcriptAt($this, 'c');
        $polled = transcriptAt($this, 'c', 'turn=t02&limit=1');

        expect($polled['data']['turns'])->toBe([$newest['data']['turns'][1]])
            ->and($polled['data']['conversation'])->toBe($newest['data']['conversation']);
    });
});

describe('a turn over the span limit', function () {
    it('is partial with the reason span_limit, and carries what it could read', function () {
        $turn = Rows::trace(['id' => 't01', 'status' => Status::Completed, 'conversation_id' => 'c', 'started_at' => '2026-01-02 09:00:00', 'span_count' => 2001]);
        $now = Carbon::now()->format('Y-m-d H:i:s.v');

        $row = fn (int $sequence, string $type, ?string $parent, mixed $input = null, mixed $output = null): array => [
            'id' => sprintf('big-%05d', $sequence), 'trace_id' => $turn->id, 'parent_id' => $parent, 'type' => $type, 'name' => $type, 'status' => 'completed', 'sequence' => $sequence,
            'input' => $input === null ? null : json_encode($input), 'output' => $output === null ? null : json_encode($output),
            'started_at' => $now, 'created_at' => $now, 'updated_at' => $now,
        ];

        $rows = [
            $row(1, 'agent', null, ['prompt' => 'Hi']),
            $row(2, 'step', 'big-00001', ['messages' => [['role' => 'user', 'content' => 'Hi']], 'messages_offset' => 0], ['text' => 'Hello', 'tool_calls' => []]),
        ];

        foreach (range(3, 2001) as $sequence) {
            $rows[] = $row($sequence, 'embedding', 'big-00001');
        }

        foreach (array_chunk($rows, 250) as $chunk) {
            DB::table('trail_spans')->insert($chunk);
        }

        $turn = transcriptAt($this, 'c')['data']['turns'][0];

        expect($turn['messages_state'])->toBe('partial')
            ->and($turn['messages_reason'])->toBe('span_limit')
            ->and($turn['span_limit'])->toBe(['limit' => 2000, 'total' => 2001, 'truncated' => true])
            ->and(array_column($turn['messages'], 'part'))->toBe(['prompt', 'response']);
    });
});

describe('what the endpoint repeats from the others', function () {
    it('has the conversation of the list, and each turn\'s run and detail as the run\'s own endpoint returns them', function () {
        DB::table('users')->insert(['id' => 7, 'name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);
        $turns = transcriptTurns('c', 3, 1, ['user_id' => '7', 'user_type' => User::class, 'input_tokens' => 12, 'output_tokens' => 3, 'cost' => 0.01, 'duration_ms' => 40.5, 'ended_at' => '2026-01-02 10:00:00']);
        Rows::bookmark($turns[1]);
        Rows::trace([
            'id' => 't04', 'status' => Status::Failed, 'conversation_id' => 'c', 'started_at' => '2026-01-02 09:30:00', 'error_class' => 'RuntimeException',
            'error_message' => 'Boom', 'metadata' => ['resolved_tool_call_ids' => ['x'], 'pending_approvals' => [['tool_call_id' => 'y', 'tool' => 'refund', 'arguments' => ['a' => 1], 'reason' => null]]],
        ]);

        $body = transcriptAt($this, 'c');
        $listed = $this->getJson('/trail/api/conversations?range=7d')->assertOk()->json('data');

        expect($body['data']['conversation'])->toBe($listed[0]);

        foreach ($body['data']['turns'] as $turn) {
            $own = $this->getJson('/trail/api/traces/'.$turn['trace']['id'])->assertOk()->json('data');

            expect($turn['trace'])->toBe($own['trace'])
                ->and($turn['detail'])->toBe($own['detail']);
        }

        expect(array_column(array_column($body['data']['turns'], 'trace'), 'bookmarked'))->toBe([false, true, false, false]);
    });

    it('uses the same shape for the turn\'s span limit as the run\'s endpoint', function () {
        $turn = Rows::trace(['id' => 't01', 'status' => Status::Completed, 'conversation_id' => 'c', 'started_at' => '2026-01-02 09:00:00']);
        Rows::span($turn, ['id' => 'r', 'type' => SpanType::Agent, 'sequence' => 1, 'status' => Status::Completed, 'input' => ['prompt' => 'Hi']]);

        $own = $this->getJson('/trail/api/traces/t01')->json('span_limit');

        expect(transcriptAt($this, 'c')['data']['turns'][0]['span_limit'])->toBe($own);
    });
});

describe('a turn with nothing stored', function () {
    it('has no root and no messages when it has no spans', function () {
        transcriptTurns('c', 1);

        $turn = transcriptAt($this, 'c')['data']['turns'][0];

        expect($turn)->toMatchArray([
            'root_span_id' => null, 'shown_attempt' => null, 'attempts' => [], 'messages_state' => 'not_stored',
            'messages_reason' => null, 'history_count' => null, 'messages' => [],
            'span_limit' => ['limit' => 2000, 'total' => 0, 'truncated' => false],
        ]);
    });

    it('has no messages and no reason when payload capture was off', function () {
        $turn = Rows::trace(['id' => 't01', 'status' => Status::Completed, 'conversation_id' => 'c', 'started_at' => '2026-01-02 09:00:00']);
        Rows::span($turn, ['id' => 'r', 'type' => SpanType::Agent, 'sequence' => 1, 'status' => Status::Completed]);
        Rows::span($turn, ['id' => 's1', 'parent_id' => 'r', 'sequence' => 2, 'status' => Status::Completed, 'provider' => 'anthropic', 'model' => 'm']);

        $body = transcriptAt($this, 'c')['data']['turns'][0];

        expect($body)->toMatchArray(['messages_state' => 'not_stored', 'messages_reason' => null, 'messages' => [], 'root_span_id' => 'r', 'shown_attempt' => 1, 'history_count' => null])
            ->and($body['attempts'])->toBe([['attempt' => 1, 'provider' => 'anthropic', 'model' => 'm', 'span_id' => 's1', 'error' => null]]);
    });
});
