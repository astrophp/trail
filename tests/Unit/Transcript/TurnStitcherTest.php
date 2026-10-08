<?php

use Astro\Trail\Tests\Fixtures\Transcript\Spans;
use Astro\Trail\Transcript\Transcript;

/*
|--------------------------------------------------------------------------
| How a turn's messages are read out of its spans
|--------------------------------------------------------------------------
|
| One group for each step of the reading. The spans are laid out by hand so that each test states
| exactly what was stored and what it expects to be returned.
|
*/

describe('the root and the shown attempt', function () {
    it('has nothing to read without an agent span', function () {
        $transcript = Spans::stitch([Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::text('Hello'))]);

        expect($transcript)->toEqual(Transcript::none())
            ->and($transcript->state)->toBe('not_stored')
            ->and([$transcript->rootSpanId, $transcript->shownAttempt, $transcript->historyCount, $transcript->attempts, $transcript->messages])->toBe([null, null, null, [], []]);
    });

    it('takes the lowest-sequence agent span without a parent as the root', function () {
        $transcript = Spans::stitch([
            Spans::step('s1', 3, [Spans::user('Hi')], output: Spans::text('Hello')),
            Spans::make('late', null, 'agent', 9, ['input' => ['prompt' => 'Later']]),
            Spans::root(),
        ]);

        expect($transcript->rootSpanId)->toBe('r');
    });

    it('reads only the steps that are children of the root', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::text('Hello')),
            Spans::make('sub', 't', 'agent', 3, ['input' => ['prompt' => 'Dig']]),
            Spans::step('inner', 4, [Spans::user('Dig')], output: Spans::text('Found'), attributes: ['parent' => 'sub']),
        ]);

        expect(Spans::sources($transcript))->toBe(['s1:input.messages.0', 's1:output']);
    });

    it('reads the steps of the root\'s own attempt and lists the others only as attempts', function () {
        $transcript = Spans::stitch([
            Spans::root(attempt: 2),
            Spans::step('a1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c1', 'lookup')]), attributes: ['attempt' => 1, 'status' => 'failed', 'provider' => 'openai', 'model' => 'gpt-5']),
            Spans::step('a2', 3, [Spans::user('Hi')], output: Spans::text('Hello'), attributes: ['attempt' => 2]),
        ]);

        expect($transcript->shownAttempt)->toBe(2)
            ->and(Spans::sources($transcript))->toBe(['a2:input.messages.0', 'a2:output'])
            ->and(array_column($transcript->attempts, 'attempt'))->toBe([1, 2])
            ->and(Spans::outline($transcript))->toBe([['prompt', 'user', 'Hi'], ['response', 'assistant', 'Hello']]);
    });
});

describe('the attempts', function () {
    it('lists each attempt with its first step and, when one failed, the first failed span and its error', function () {
        $error = ['class' => 'RateLimited', 'message' => 'Slow down', 'source' => 'step', 'http_status' => 429];

        $transcript = Spans::stitch([
            Spans::root(attempt: 3),
            Spans::step('a1', 2, [Spans::user('Hi')], attributes: ['attempt' => 1, 'provider' => 'openai', 'model' => 'gpt-5', 'status' => 'completed']),
            Spans::tool('a1t', 3, 'lookup', ['arguments' => []], ['attempt' => 1, 'status' => 'failed', 'error' => ['class' => 'Boom', 'message' => 'x', 'source' => 'tool', 'http_status' => null]]),
            Spans::step('a1f', 4, [Spans::user('Hi')], attributes: ['attempt' => 1, 'status' => 'failed', 'error' => $error]),
            Spans::step('a2', 5, [Spans::user('Hi')], attributes: ['attempt' => 2, 'provider' => 'backup', 'model' => 'claude', 'status' => 'failed', 'error' => $error]),
            Spans::step('a3', 6, [Spans::user('Hi')], output: Spans::text('Hello'), attributes: ['attempt' => 3, 'provider' => 'anthropic', 'model' => 'haiku']),
        ]);

        expect($transcript->attempts)->toBe([
            ['attempt' => 1, 'provider' => 'openai', 'model' => 'gpt-5', 'span_id' => 'a1t', 'error' => ['class' => 'Boom', 'message' => 'x', 'source' => 'tool', 'http_status' => null]],
            ['attempt' => 2, 'provider' => 'backup', 'model' => 'claude', 'span_id' => 'a2', 'error' => $error],
            ['attempt' => 3, 'provider' => 'anthropic', 'model' => 'haiku', 'span_id' => 'a3', 'error' => null],
        ]);
    });

    it('lists the shown attempt even when it has no children yet, with nothing known about it', function () {
        $transcript = Spans::stitch([
            Spans::root(attempt: 2),
            Spans::step('a1', 2, [Spans::user('Hi')], attributes: ['attempt' => 1, 'status' => 'failed']),
        ]);

        expect($transcript->attempts)->toBe([
            ['attempt' => 1, 'provider' => 'anthropic', 'model' => 'claude-test', 'span_id' => 'a1', 'error' => null],
            ['attempt' => 2, 'provider' => null, 'model' => null, 'span_id' => null, 'error' => null],
        ]);
    });

    it('gives only the prompt of the agent for a last attempt that has no step yet, and nothing of the earlier attempt', function () {
        $transcript = Spans::stitch([
            Spans::root(attempt: 2),
            Spans::step('a1', 2, [Spans::user('Hi')], output: Spans::text('Early'), attributes: ['attempt' => 1, 'status' => 'failed']),
        ]);

        expect(Spans::outline($transcript))->toBe([['prompt', 'user', 'Hi']])
            ->and(Spans::sources($transcript))->toBe(['r:input'])
            ->and([$transcript->state, $transcript->reason, $transcript->shownAttempt])->toBe(['partial', 'step_input_missing', 2]);
    });

    it('does not list an attempt a sub-agent or an embedding made', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::text('Hello')),
            Spans::make('sub', 'x', 'step', 3, ['attempt' => 7]),
            Spans::make('emb', 'r', 'embedding', 4, ['attempt' => 5]),
        ]);

        expect(array_column($transcript->attempts, 'attempt'))->toBe([1]);
    });
});

describe('a turn of one step', function () {
    it('is the prompt and the response', function () {
        $transcript = Spans::stitch([Spans::root(), Spans::step('s1', 2, [Spans::user('Where is order 1042?')], output: Spans::text('It shipped.'))]);

        expect(Spans::outline($transcript))->toBe([['prompt', 'user', 'Where is order 1042?'], ['response', 'assistant', 'It shipped.']])
            ->and(Spans::sources($transcript))->toBe(['s1:input.messages.0', 's1:output'])
            ->and([$transcript->state, $transcript->reason, $transcript->historyCount])->toBe(['stored', null, 0])
            ->and($transcript->rootSpanId)->toBe('r')
            ->and($transcript->shownAttempt)->toBe(1);
    });

    it('gives every message all eleven keys', function () {
        $transcript = Spans::stitch([Spans::root(), Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::text('Hello'))]);

        foreach ($transcript->messages as $message) {
            expect(array_keys($message))->toBe(['part', 'role', 'content', 'structured', 'attachments', 'tool_calls', 'tool_results', 'source', 'truncated_paths'])
                ->and(array_keys($message['source']))->toBe(['span_id', 'path', 'redacted', 'truncated']);
        }
    });

    it('builds the response from the output of the step', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: ['text' => 'Hello', 'tool_calls' => [], 'finish_reason' => 'stop', 'structured' => ['answer' => 42]]),
        ]);

        expect($transcript->messages[1])->toMatchArray([
            'part' => 'response', 'role' => 'assistant', 'content' => 'Hello', 'structured' => ['answer' => 42],
            'attachments' => null, 'tool_calls' => [], 'tool_results' => null,
        ])->and(array_key_exists('finish_reason', $transcript->messages[1]))->toBeFalse();
    });
});

describe('a turn with a tool', function () {
    it('returns the assistant message and the tool result once, from the step that holds them', function () {
        $call = Spans::call('toolu_1', 'lookup', ['query' => 'x']);

        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([$call], 'Let me check.')),
            Spans::tool('t1', 3, 'lookup', ['arguments' => ['query' => 'x']]),
            Spans::step('s2', 4, [Spans::assistant('Let me check.', [$call]), Spans::toolResult([['id' => 'toolu_1', 'name' => 'lookup', 'result' => 'ok']])], 1, Spans::text('Done')),
        ]);

        expect(Spans::outline($transcript))->toBe([
            ['prompt', 'user', 'Hi'], ['activity', 'assistant', 'Let me check.'], ['activity', 'tool_result', null], ['response', 'assistant', 'Done'],
        ])->and(Spans::sources($transcript))->toBe(['s1:input.messages.0', 's2:input.messages.0', 's2:input.messages.1', 's2:output'])
            ->and($transcript->messages[1]['tool_calls'][0])->toMatchArray(['id' => 'toolu_1', 'link' => 'linked', 'span' => ['id' => 't1', 'status' => 'completed', 'issue_kind' => null, 'duration_ms' => 1.5]])
            ->and($transcript->messages[2]['tool_results'])->toBe([['id' => 'toolu_1', 'name' => 'lookup', 'result' => 'ok', 'span_id' => 't1']])
            ->and($transcript->state)->toBe('stored');
    });

    it('returns only the output of the last step when it asked for a tool, as activity', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('toolu_1', 'lookup')], 'Checking.')),
        ], status: 'running');

        expect(Spans::outline($transcript))->toBe([['prompt', 'user', 'Hi'], ['activity', 'assistant', 'Checking.']]);
    });

    it('keeps the stored values of an item as they are, and null where it has no such key', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [
                Spans::user('Hi'),
                ['role' => 'assistant', 'content' => '', 'tool_calls' => []],
                ['role' => 'user', 'content' => 'See this', 'attachments' => [['type' => 'image']]],
                ['role' => 'assistant', 'content' => null],
            ], output: Spans::text('')),
        ]);

        // The last stored message is the assistant's, so the turn's start is unknown: see the boundary tests.
        expect($transcript->state)->toBe('partial');

        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [
                ['role' => 'assistant', 'content' => '', 'tool_calls' => []],
                ['role' => 'user', 'content' => '', 'attachments' => [['type' => 'image']]],
            ], output: ['text' => '', 'tool_calls' => []]),
        ]);

        expect($transcript->messages[0])->toMatchArray(['part' => 'prompt', 'content' => '', 'attachments' => [['type' => 'image']], 'tool_calls' => null, 'structured' => null, 'tool_results' => null])
            ->and($transcript->messages[1])->toMatchArray(['content' => '', 'tool_calls' => [], 'attachments' => null]);
    });
});

describe('earlier history', function () {
    it('is dropped and counted: the turn starts at the last message of the first step', function () {
        $transcript = Spans::stitch([
            Spans::root(['prompt' => 'Again']),
            Spans::step('s1', 2, [Spans::user('Hi'), Spans::assistant('One'), Spans::user('Again')], output: Spans::text('Two')),
        ]);

        expect(Spans::outline($transcript))->toBe([['prompt', 'user', 'Again'], ['response', 'assistant', 'Two']])
            ->and($transcript->historyCount)->toBe(2)
            ->and(Spans::sources($transcript)[0])->toBe('s1:input.messages.2')
            ->and($transcript->state)->toBe('stored');
    });

    it('is never returned, whatever it holds', function () {
        $call = Spans::call('old', 'lookup');

        $transcript = Spans::stitch([
            Spans::root(['prompt' => 'Now']),
            Spans::step('s1', 2, [Spans::user('Then'), Spans::assistant('', [$call]), Spans::toolResult([['id' => 'old', 'name' => 'lookup', 'result' => 'r']]), Spans::assistant('Answer'), Spans::user('Now')], output: Spans::text('Fine')),
        ]);

        expect(array_column(Spans::outline($transcript), 2))->toBe(['Now', 'Fine'])
            ->and($transcript->historyCount)->toBe(4);
    });

    it('is zero when the prompt is the only message', function () {
        $transcript = Spans::stitch([Spans::root(), Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::text('Hello'))]);

        expect($transcript->historyCount)->toBe(0);
    });
});

describe('where the turn starts', function () {
    it('is unknown when the first step begins after other steps\' messages', function () {
        $transcript = Spans::stitch([
            Spans::root(['prompt' => '']),
            Spans::step('s1', 2, [Spans::user('Hi')], 3, Spans::text('Hello')),
        ]);

        expect(Spans::outline($transcript))->toBe([['activity', 'user', 'Hi'], ['response', 'assistant', 'Hello']])
            ->and($transcript->historyCount)->toBeNull()
            ->and([$transcript->state, $transcript->reason])->toBe(['partial', 'offset_gap']);
    });

    it('is unknown when the first step stored no messages at all', function () {
        $transcript = Spans::stitch([Spans::root(), Spans::step('s1', 2, [], output: Spans::text('Hello'))]);

        expect(Spans::outline($transcript)[0])->toBe(['prompt', 'user', 'Hi'])
            ->and($transcript->messages[0]['source'])->toBe(['span_id' => 'r', 'path' => 'input', 'redacted' => false, 'truncated' => false])
            ->and($transcript->historyCount)->toBeNull()
            ->and([$transcript->state, $transcript->reason])->toBe(['partial', 'history_boundary_unknown']);
    });

    it('is unknown when the last message of the first step is neither the user\'s nor a tool result', function () {
        $transcript = Spans::stitch([
            Spans::root(['prompt' => '']),
            Spans::step('s1', 2, [Spans::user('Hi'), Spans::assistant('Hello')], output: Spans::text('Again')),
        ]);

        expect(Spans::outline($transcript))->toBe([['response', 'assistant', 'Again']])
            ->and($transcript->historyCount)->toBeNull()
            ->and([$transcript->state, $transcript->reason])->toBe(['partial', 'history_boundary_unknown']);
    });

    it('takes the prompt from the agent when the start is unknown and the agent has one', function () {
        $transcript = Spans::stitch([
            Spans::root(['prompt' => 'Hi', 'attachments' => [['type' => 'image']]]),
            Spans::step('s1', 2, [Spans::user('Hi'), Spans::assistant('Hello')], output: Spans::text('Again')),
        ]);

        expect(Spans::outline($transcript))->toBe([['prompt', 'user', 'Hi'], ['response', 'assistant', 'Again']])
            ->and($transcript->messages[0]['attachments'])->toBe([['type' => 'image']])
            ->and($transcript->reason)->toBe('history_boundary_unknown');
    });
});

describe('a turn that starts at a tool result', function () {
    it('starts at the merged tool result, has no prompt and says it counted earlier history', function () {
        $call = Spans::call('toolu_1', 'delete_records', ['table' => 'users']);

        $transcript = Spans::stitch([
            Spans::root(['prompt' => '']),
            Spans::tool('t1', 2, 'delete_records', ['arguments' => ['table' => 'users']]),
            Spans::step('s1', 3, [Spans::user('Delete'), Spans::assistant('', [$call]), Spans::toolResult([['id' => 'toolu_1', 'name' => 'delete_records', 'result' => 'Deleted users']])], output: Spans::text('Deleted them')),
        ], resolved: ['toolu_1']);

        expect(Spans::outline($transcript))->toBe([['activity', 'tool_result', null], ['response', 'assistant', 'Deleted them']])
            ->and($transcript->historyCount)->toBe(2)
            ->and($transcript->messages[0]['tool_results'])->toBe([['id' => 'toolu_1', 'name' => 'delete_records', 'result' => 'Deleted users', 'span_id' => 't1']])
            ->and($transcript->state)->toBe('stored');
    });

    it('never takes a prompt from the agent, even when it has one', function () {
        $transcript = Spans::stitch([
            Spans::root(['prompt' => 'A prompt']),
            Spans::step('s1', 2, [Spans::user('Old'), Spans::toolResult([['id' => 'a', 'name' => 'x', 'result' => 'r']])], output: Spans::text('Done')),
        ]);

        expect(array_column(Spans::outline($transcript), 0))->toBe(['activity', 'response']);
    });

    it('links an approved tool by its arguments and leaves a tool that ran in the history without a span', function () {
        $approved = Spans::call('toolu_1', 'delete_records', ['table' => 'users']);
        $ordinary = Spans::call('toolu_2', 'lookup', ['query' => 'laravel']);

        $transcript = Spans::stitch([
            Spans::root(['prompt' => '']),
            Spans::tool('t1', 2, 'delete_records', ['arguments' => ['table' => 'users']]),
            Spans::step('s1', 3, [
                Spans::user('Do both'),
                Spans::assistant('', [$approved, $ordinary]),
                Spans::toolResult([['id' => 'toolu_1', 'name' => 'delete_records', 'result' => 'Deleted'], ['id' => 'toolu_2', 'name' => 'lookup', 'result' => 'Found']]),
            ], output: Spans::text('Done')),
        ], resolved: ['toolu_1']);

        expect(array_column($transcript->messages[0]['tool_results'], 'span_id'))->toBe(['t1', null]);
    });

    it('links the approved tools only among the tools recorded before the first step', function () {
        $call = Spans::call('toolu_1', 'delete_records', ['table' => 'users']);

        $transcript = Spans::stitch([
            Spans::root(['prompt' => '']),
            Spans::step('s1', 2, [Spans::user('Delete'), Spans::assistant('', [$call]), Spans::toolResult([['id' => 'toolu_1', 'name' => 'delete_records', 'result' => 'r']])], output: Spans::asking([Spans::call('toolu_9', 'x')])),
            Spans::tool('after', 3, 'delete_records', ['arguments' => ['table' => 'users']]),
        ], resolved: ['toolu_1']);

        expect($transcript->messages[0]['tool_results'][0]['span_id'])->toBeNull();
    });

    it('does not link a call whose id the turn did not resolve', function () {
        $call = Spans::call('toolu_1', 'delete_records', ['table' => 'users']);

        $transcript = Spans::stitch([
            Spans::root(['prompt' => '']),
            Spans::tool('t1', 2, 'delete_records', ['arguments' => ['table' => 'users']]),
            Spans::step('s1', 3, [Spans::user('Delete'), Spans::assistant('', [$call]), Spans::toolResult([['id' => 'toolu_1', 'name' => 'delete_records', 'result' => 'r']])], output: Spans::text('Done')),
        ]);

        expect($transcript->messages[0]['tool_results'][0]['span_id'])->toBeNull();
    });

    it('has a reject-only turn with no step and no prompt that is not stored', function () {
        $transcript = Spans::stitch([Spans::root(['prompt' => ''])], resolved: ['toolu_1']);

        expect([$transcript->state, $transcript->reason, $transcript->messages, $transcript->historyCount])->toBe(['not_stored', null, [], null]);
    });
});

describe('later steps', function () {
    $first = fn () => Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c1', 'x')]));

    it('adds all of a step\'s messages when it follows on from the one before', function () use ($first) {
        $transcript = Spans::stitch([Spans::root(), $first(), Spans::step('s2', 3, [Spans::assistant('a'), Spans::user('b')], 1, Spans::text('Done'))]);

        expect(Spans::sources($transcript))->toBe(['s1:input.messages.0', 's2:input.messages.0', 's2:input.messages.1', 's2:output'])
            ->and($transcript->state)->toBe('stored');
    });

    it('adds all of them and says there is a gap when it starts later than the one before ended', function () use ($first) {
        $transcript = Spans::stitch([Spans::root(), $first(), Spans::step('s2', 3, [Spans::assistant('a')], 4, Spans::text('Done'))]);

        expect(Spans::sources($transcript))->toBe(['s1:input.messages.0', 's2:input.messages.0', 's2:output'])
            ->and([$transcript->state, $transcript->reason])->toBe(['partial', 'offset_gap']);
    });

    it('adds only what is past the history it already holds when it starts inside it', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi'), Spans::assistant('a'), Spans::toolResult([['id' => 'c', 'name' => 'x', 'result' => 'r']])]),
            Spans::step('s2', 3, [Spans::assistant('dup'), Spans::user('new')], 2, Spans::text('Done')),
        ]);

        // s1 sent three messages; s2 stores from the third on, so its first message is the one s1 already holds.
        expect(Spans::sources($transcript))->toBe(['s1:input.messages.2', 's2:input.messages.1', 's2:output'])
            ->and($transcript->reason)->toBe('offset_gap');
    });

    it('keeps what it has and adds only the tail after the last assistant message when the history was sent whole again', function () use ($first) {
        $transcript = Spans::stitch([
            Spans::root(),
            $first(),
            Spans::step('s2', 3, [Spans::user('Hi'), Spans::assistant('first'), Spans::user('more'), Spans::assistant('tail', [Spans::call('c1', 'x')]), Spans::toolResult([['id' => 'c1', 'name' => 'x', 'result' => 'r']])], 0, Spans::text('Done')),
        ]);

        expect(Spans::outline($transcript))->toBe([['prompt', 'user', 'Hi'], ['activity', 'assistant', 'tail'], ['activity', 'tool_result', null], ['response', 'assistant', 'Done']])
            ->and(Spans::sources($transcript))->toBe(['s1:input.messages.0', 's2:input.messages.3', 's2:input.messages.4', 's2:output'])
            ->and([$transcript->state, $transcript->reason])->toBe(['partial', 'history_rewritten']);
    });

    it('adds nothing from a step sent whole again that has no assistant message', function () use ($first) {
        $transcript = Spans::stitch([Spans::root(), $first(), Spans::step('s2', 3, [Spans::user('Hi')], 0, Spans::text('Done'))]);

        expect(Spans::sources($transcript))->toBe(['s1:input.messages.0', 's2:output'])
            ->and($transcript->reason)->toBe('history_rewritten');
    });

    it('does not call a step after a shortened history a gap', function () use ($first) {
        $transcript = Spans::stitch([
            Spans::root(),
            $first(),
            Spans::step('s2', 3, [Spans::user('Hi'), Spans::assistant('a')], 0, Spans::asking([Spans::call('c2', 'x')])),
            Spans::step('s3', 4, [Spans::toolResult([['id' => 'c2', 'name' => 'x', 'result' => 'r']])], 2, Spans::text('Done')),
        ]);

        expect($transcript->reason)->toBe('history_rewritten')
            ->and(Spans::sources($transcript))->toBe(['s1:input.messages.0', 's2:input.messages.1', 's3:input.messages.0', 's3:output']);
    });

    it('reports the first reason in the order span_limit, offset_gap, history_rewritten, history_boundary_unknown, step_input_missing', function () {
        $rewritten = [
            Spans::root(['prompt' => 'Hi']),
            Spans::step('s1', 2, [Spans::assistant('x')], output: Spans::asking([Spans::call('c', 'x')])),
            Spans::step('s2', 3, [Spans::user('y'), Spans::assistant('z')], 0, Spans::asking([Spans::call('d', 'x')])),
            Spans::step('s3', 4, [Spans::assistant('q')], 9),
        ];

        expect(Spans::stitch($rewritten)->reason)->toBe('offset_gap')
            ->and(Spans::stitch($rewritten, limited: true)->reason)->toBe('span_limit')
            ->and(Spans::stitch(array_slice($rewritten, 0, 3))->reason)->toBe('history_rewritten');
    });
});

describe('the outputs of steps', function () {
    it('returns the output of the last stored step and no earlier one, which a later input already holds', function () {
        $call = Spans::call('c1', 'x');

        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([$call], 'one')),
            Spans::step('s2', 3, [Spans::assistant('one', [$call])], 1, Spans::asking([Spans::call('c2', 'x')], 'two')),
            Spans::step('s3', 4, [Spans::assistant('two', [Spans::call('c2', 'x')])], 2, Spans::text('three')),
        ], status: 'completed');

        expect(array_column(Spans::outline($transcript), 2))->toBe(['Hi', 'one', 'two', 'three'])
            ->and(count(array_filter(Spans::sources($transcript), fn (string $source): bool => str_ends_with($source, ':output'))))->toBe(1);
    });

    it('skips a null output', function () {
        $transcript = Spans::stitch([Spans::root(), Spans::step('s1', 2, [Spans::user('Hi')], output: null)]);

        expect(Spans::outline($transcript))->toBe([['prompt', 'user', 'Hi']]);
    });

    it('returns the output of a step recorded without its start event, and of the stored step before it', function () {
        $call = Spans::call('c1', 'x');

        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([$call], 'one')),
            Spans::step('s2', 3, null, output: Spans::text('two')),
        ]);

        expect(Spans::outline($transcript))->toBe([['prompt', 'user', 'Hi'], ['activity', 'assistant', 'one'], ['response', 'assistant', 'two']])
            ->and([$transcript->state, $transcript->reason])->toBe(['partial', 'step_input_missing']);
    });

    it('returns the output of every step when none stored its input', function () {
        $transcript = Spans::stitch([
            Spans::root(['prompt' => 'Hi']),
            Spans::step('s1', 2, null, output: Spans::asking([Spans::call('c1', 'x')], 'one')),
            Spans::step('s2', 3, null, output: Spans::text('two')),
        ]);

        expect(Spans::outline($transcript))->toBe([['prompt', 'user', 'Hi'], ['activity', 'assistant', 'one'], ['response', 'assistant', 'two']])
            ->and($transcript->reason)->toBe('step_input_missing');
    });

    it('treats a step whose input was not stored but is covered by a later one as stored', function () {
        $call = Spans::call('c1', 'x');

        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, null, output: Spans::asking([$call])),
            Spans::step('s2', 3, [Spans::user('Hi'), Spans::assistant('', [$call]), Spans::toolResult([['id' => 'c1', 'name' => 'x', 'result' => 'r']])], 0, Spans::text('Done')),
        ]);

        // The first step lost its start, so its history is the whole of the second step's: the turn begins at the last prompt.
        expect(Spans::outline($transcript))->toBe([['prompt', 'user', 'Hi'], ['activity', 'assistant', ''], ['activity', 'tool_result', null], ['response', 'assistant', 'Done']])
            ->and($transcript->historyCount)->toBe(0)
            ->and([$transcript->state, $transcript->reason])->toBe(['stored', null]);
    });

    it('does not take a mid-turn tool result for the start of the turn when the first step lost its start', function () {
        $call = Spans::call('c1', 'x');

        $transcript = Spans::stitch([
            Spans::root(['prompt' => 'Now']),
            Spans::step('s1', 2, null, output: Spans::asking([$call])),
            Spans::step('s2', 3, [Spans::user('Before'), Spans::assistant('earlier'), Spans::user('Now'), Spans::assistant('', [$call]), Spans::toolResult([['id' => 'c1', 'name' => 'x', 'result' => 'r']])], 0, Spans::text('Done')),
        ]);

        expect(array_column(Spans::outline($transcript), 0))->toBe(['prompt', 'activity', 'activity', 'response'])
            ->and($transcript->messages[0]['content'])->toBe('Now')
            ->and($transcript->historyCount)->toBe(2);
    });

    it('returns nothing from the messages when the first step lost its start and the turn began at a tool result', function () {
        $transcript = Spans::stitch([
            Spans::root(['prompt' => '']),
            Spans::step('s1', 2, null, output: Spans::asking([Spans::call('c1', 'x')])),
            Spans::step('s2', 3, [Spans::user('Before'), Spans::assistant('', [Spans::call('c0', 'x')]), Spans::toolResult([['id' => 'c0', 'name' => 'x', 'result' => 'r']]), Spans::assistant('', [Spans::call('c1', 'x')]), Spans::toolResult([['id' => 'c1', 'name' => 'x', 'result' => 'r']])], 0, Spans::text('Done')),
        ], resolved: ['c0']);

        expect(Spans::outline($transcript))->toBe([['response', 'assistant', 'Done']])
            ->and([$transcript->state, $transcript->reason, $transcript->historyCount])->toBe(['partial', 'history_boundary_unknown', null]);
    });
});

describe('the parts of a turn', function () {
    $turn = fn (array $output) => [Spans::root(), Spans::step('s1', 2, [Spans::user('Hi')], output: $output)];

    it('calls the last output the response only when the turn completed', function (string $status, string $part) use ($turn) {
        $transcript = Spans::stitch($turn(Spans::text('Done')), status: $status);

        expect(array_column($transcript->messages, 'part'))->toBe(['prompt', $part]);
    })->with([
        'completed' => ['completed', 'response'],
        'failed' => ['failed', 'activity'],
        'incomplete' => ['incomplete', 'activity'],
        'running' => ['running', 'activity'],
        'awaiting approval' => ['awaiting_approval', 'activity'],
    ]);

    it('calls the last output the response when it has no tool calls key, a null one or an empty list', function (array $output) use ($turn) {
        expect(array_column(Spans::stitch($turn($output))->messages, 'part'))->toBe(['prompt', 'response']);
    })->with([
        'absent' => [['text' => 'Done']],
        'null' => [['text' => 'Done', 'tool_calls' => null]],
        'empty' => [['text' => 'Done', 'tool_calls' => []]],
    ]);

    it('does not call an output that asked for a tool the response', function () use ($turn) {
        expect(array_column(Spans::stitch($turn(Spans::asking([Spans::call('c1', 'x')])))->messages, 'part'))->toBe(['prompt', 'activity']);
    });

    it('calls a failed turn\'s output activity and never a response', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::text('Partial answer')),
        ], status: 'failed');

        expect(in_array('response', array_column($transcript->messages, 'part'), true))->toBeFalse();
    });
});

describe('the prompt of the agent', function () {
    it('is the prompt when no step stored one, with its attachments', function () {
        $transcript = Spans::stitch([Spans::root(['prompt' => 'Hi', 'attachments' => [['type' => 'image']]])], status: 'failed');

        expect($transcript->messages)->toHaveCount(1)
            ->and($transcript->messages[0])->toMatchArray([
                'part' => 'prompt', 'role' => 'user', 'content' => 'Hi', 'attachments' => [['type' => 'image']], 'tool_calls' => null, 'tool_results' => null, 'structured' => null,
                'source' => ['span_id' => 'r', 'path' => 'input', 'redacted' => false, 'truncated' => false],
            ])->and([$transcript->state, $transcript->reason, $transcript->historyCount])->toBe(['partial', 'step_input_missing', null]);
    });

    it('has no attachments key to copy when the agent stored none', function () {
        expect(Spans::stitch([Spans::root(['prompt' => 'Hi'])])->messages[0]['attachments'])->toBeNull();
    });

    it('is not used when it is empty or not a string', function (mixed $prompt) {
        expect(Spans::stitch([Spans::root(['prompt' => $prompt])])->messages)->toBe([]);
    })->with(['empty' => [''], 'null' => [null], 'a number' => [5]]);

    it('is not used when a step stored the prompt', function () {
        $transcript = Spans::stitch([Spans::root(['prompt' => 'Hi']), Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::text('Hello'))]);

        expect(array_column($transcript->messages, 'part'))->toBe(['prompt', 'response']);
    });

    it('does not replace a reason that is already set', function () {
        $transcript = Spans::stitch([Spans::root(['prompt' => 'Hi']), Spans::step('s1', 2, [], output: null)]);

        expect($transcript->reason)->toBe('history_boundary_unknown');
    });
});

describe('what is not stored', function () {
    it('is not stored, with no messages and no reason, when payload capture was off', function () {
        $transcript = Spans::stitch([
            Spans::make('r', null, 'agent', 1),
            Spans::make('s1', 'r', 'step', 2),
        ]);

        expect([$transcript->state, $transcript->reason, $transcript->messages, $transcript->rootSpanId, $transcript->shownAttempt])->toBe(['not_stored', null, [], 'r', 1]);
    });

    it('has a step with no start event say so, and still returns its output', function () {
        $transcript = Spans::stitch([Spans::root(['prompt' => '']), Spans::step('s1', 2, null, output: Spans::text('Hello'))]);

        expect(Spans::outline($transcript))->toBe([['response', 'assistant', 'Hello']])
            ->and([$transcript->state, $transcript->reason])->toBe(['partial', 'step_input_missing']);
    });

    it('is not partial because of a step without a start event that a later step covers', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c1', 'x')])),
            Spans::step('s2', 3, null, output: null),
            Spans::step('s3', 4, [Spans::toolResult([['id' => 'c1', 'name' => 'x', 'result' => 'r']])], 1, Spans::text('Done')),
        ]);

        expect($transcript->state)->toBe('stored');
    });

    it('passes an item with no role through with its content, and an item that is not an array as content', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c1', 'x')])),
            Spans::step('s2', 3, [['role' => null, 'content' => 'a bare string'], 'not even an array'], 1, Spans::text('Done')),
        ]);

        expect($transcript->messages[1])->toMatchArray(['part' => 'activity', 'role' => null, 'content' => 'a bare string', 'tool_calls' => null])
            ->and($transcript->messages[2])->toMatchArray(['part' => 'activity', 'role' => null, 'content' => 'not even an array', 'tool_calls' => null]);
    });

    it('does not take an item with no role for the start of the turn', function () {
        $transcript = Spans::stitch([Spans::root(), Spans::step('s1', 2, [Spans::user('x'), ['role' => null, 'content' => 'a bare string']], output: Spans::text('Hello'))]);

        expect($transcript->reason)->toBe('history_boundary_unknown')
            ->and($transcript->historyCount)->toBeNull();
    });
});

describe('the tool calls', function () {
    it('are the stored id, name and arguments, with null for what is missing', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([['name' => 'lookup'], ['id' => 'c2', 'arguments' => ['a' => 1]], 'stray'])),
        ], status: 'failed');

        expect($transcript->messages[1]['tool_calls'])->toBe([
            ['id' => null, 'name' => 'lookup', 'arguments' => null, 'link' => 'unlinked', 'span' => null, 'agent' => null],
            ['id' => 'c2', 'name' => null, 'arguments' => ['a' => 1], 'link' => 'unlinked', 'span' => null, 'agent' => null],
            ['id' => null, 'name' => null, 'arguments' => 'stray', 'link' => 'unlinked', 'span' => null, 'agent' => null],
        ]);
    });

    it('wait for approval when the turn does and the call is pending', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c1', 'refund'), Spans::call('c2', 'refund'), Spans::call('c3', 'refund')])),
        ], status: 'awaiting_approval', pending: ['c1']);

        expect(array_column($transcript->messages[1]['tool_calls'], 'link'))->toBe(['awaiting_approval', 'unlinked', 'unlinked']);
    });

    it('are not pending when the turn is not awaiting approval', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c1', 'refund')])),
        ], status: 'failed', pending: ['c1']);

        expect($transcript->messages[1]['tool_calls'][0]['link'])->toBe('unlinked');
    });

    it('have not started while the turn runs', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c1', 'lookup', ['q' => 'a'])])),
        ], status: 'running');

        expect($transcript->messages[1]['tool_calls'][0])->toMatchArray(['link' => 'not_started', 'span' => null, 'agent' => null]);
    });

    it('take a span over waiting and not starting', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c1', 'lookup', ['q' => 'a'])])),
            Spans::tool('t1', 3, 'lookup', ['arguments' => ['q' => 'a']], ['status' => 'running', 'duration_ms' => null]),
        ], status: 'running', pending: ['c1']);

        expect($transcript->messages[1]['tool_calls'][0])->toMatchArray(['link' => 'linked', 'span' => ['id' => 't1', 'status' => 'running', 'issue_kind' => null, 'duration_ms' => null]]);
    });

    it('show the status the span has, not a worse one a failed sub-agent might suggest', function () {
        $call = Spans::call('c1', 'Researcher', ['task' => 'Dig']);

        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([$call])),
            Spans::tool('t1', 3, 'Researcher', ['arguments' => ['task' => 'Dig']], ['status' => 'completed']),
            Spans::make('a2', 't1', 'agent', 4, [
                'name' => 'Researcher', 'agent_class' => 'App\\Researcher', 'status' => 'failed', 'issue_kind' => 'exception', 'provider' => 'openai', 'model' => 'gpt-5', 'duration_ms' => 12.5,
                'pending_approvals' => [['tool_call_id' => 'x', 'tool' => 'y', 'arguments' => null, 'reason' => null]], 'resolved_tool_call_ids' => ['z'],
            ]),
        ]);

        expect($transcript->messages[1]['tool_calls'][0]['span']['status'])->toBe('completed')
            ->and($transcript->messages[1]['tool_calls'][0]['agent'])->toBe([
                'span_id' => 'a2', 'name' => 'Researcher', 'agent_class' => 'App\\Researcher', 'status' => 'failed', 'issue_kind' => 'exception', 'provider' => 'openai', 'model' => 'gpt-5',
                'duration_ms' => 12.5, 'pending_approvals' => [['tool_call_id' => 'x', 'tool' => 'y', 'arguments' => null, 'reason' => null]], 'resolved_tool_call_ids' => ['z'],
            ]);
    });

    it('take the first agent under the tool span, by sequence', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c1', 'Researcher', [])])),
            Spans::tool('t1', 3, 'Researcher', ['arguments' => []]),
            Spans::make('second', 't1', 'agent', 6, ['name' => 'Second']),
            Spans::make('first', 't1', 'agent', 4, ['name' => 'First']),
        ]);

        expect($transcript->messages[1]['tool_calls'][0]['agent']['span_id'])->toBe('first');
    });

    it('attach an agent directly under the root to no call', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c1', 'Researcher', [])])),
            Spans::tool('t1', 3, 'Researcher', ['arguments' => []]),
            Spans::make('stray', 'r', 'agent', 4, ['name' => 'Researcher']),
        ]);

        expect($transcript->messages[1]['tool_calls'][0]['span']['id'])->toBe('t1')
            ->and($transcript->messages[1]['tool_calls'][0]['agent'])->toBeNull();
    });

    it('give a result its span by the id of its call, and none when the id is unknown', function () {
        $call = Spans::call('c1', 'lookup', ['q' => 'a']);

        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([$call])),
            Spans::tool('t1', 3, 'lookup', ['arguments' => ['q' => 'a']]),
            Spans::step('s2', 4, [Spans::assistant('', [$call]), Spans::toolResult([['id' => 'c1', 'name' => 'lookup', 'result' => 'r'], ['id' => 'ghost', 'name' => 'lookup', 'result' => 'r'], ['name' => 'lookup'], 'stray'])], 1, Spans::text('Done')),
        ]);

        expect($transcript->messages[2]['tool_results'])->toBe([
            ['id' => 'c1', 'name' => 'lookup', 'result' => 'r', 'span_id' => 't1'],
            ['id' => 'ghost', 'name' => 'lookup', 'result' => 'r', 'span_id' => null],
            ['id' => null, 'name' => 'lookup', 'result' => null, 'span_id' => null],
            ['id' => null, 'name' => null, 'result' => 'stray', 'span_id' => null],
        ]);
    });
});

describe('the marks of a message', function () {
    it('are rebased to the message from the span\'s paths, with the index in the stored slice', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c1', 'x')])),
            Spans::step('s2', 3, [Spans::assistant('a'), Spans::toolResult([['id' => 'c1', 'name' => 'x', 'result' => 'long']])], 1, ['text' => 'done', 'tool_calls' => [], 'structured' => ['k' => 'v']], [
                'truncated' => true,
                'redacted' => true,
                'truncated_paths' => [
                    'input.messages.1.tool_results.0.result' => 18422,
                    'input.messages.0.content' => 5000,
                    'output.text' => 700,
                    'output.structured.k' => 90,
                    'output.tool_calls.2.arguments.q' => 12,
                    'input.messages.10.content' => 1,
                ],
            ]),
        ]);

        [, $assistant, $result, $response] = $transcript->messages;

        expect($assistant['truncated_paths'])->toBe(['content' => 5000])
            ->and($result['truncated_paths'])->toBe(['tool_results.0.result' => 18422])
            ->and($response['truncated_paths'])->toBe(['content' => 700, 'structured.k' => 90, 'tool_calls.2.arguments.q' => 12])
            ->and($result['source'])->toBe(['span_id' => 's2', 'path' => 'input.messages.1', 'redacted' => true, 'truncated' => true]);
    });

    it('match whole segments only: message 1 never captures message 10', function () {
        $messages = [Spans::user('Hi'), ...array_map(fn (int $index): array => Spans::assistant('m'.$index), range(1, 10))];
        array_unshift($messages, Spans::assistant('zero'));

        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c', 'x')])),
            Spans::step('s2', 3, $messages, 1, Spans::text('Done'), ['truncated' => true, 'truncated_paths' => ['input.messages.1.content' => 11, 'input.messages.10.content' => 1010]]),
        ]);

        $byPath = [];

        foreach ($transcript->messages as $message) {
            $byPath[$message['source']['span_id'].':'.$message['source']['path']] = $message['truncated_paths'];
        }

        expect($byPath['s2:input.messages.1'])->toBe(['content' => 11])
            ->and($byPath['s2:input.messages.10'])->toBe(['content' => 1010])
            ->and($byPath['s2:input.messages.2'])->toBe([]);
    });

    it('can say a span was cut with no path to point to', function () {
        $transcript = Spans::stitch([Spans::root(), Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::text('Hello'), attributes: ['truncated' => true])]);

        expect($transcript->messages[1]['source']['truncated'])->toBeTrue()
            ->and($transcript->messages[1]['truncated_paths'])->toBe([]);
    });

    it('rebase the prompt of the agent', function () {
        $transcript = Spans::stitch([
            Spans::make('r', null, 'agent', 1, ['input' => ['prompt' => 'Hi', 'attachments' => []], 'truncated' => true, 'redacted' => true, 'truncated_paths' => ['input.prompt' => 90000, 'input.attachments.0.name' => 300, 'input.system' => 5, 'output.text' => 4]]),
        ], status: 'failed');

        expect($transcript->messages[0]['truncated_paths'])->toBe(['content' => 90000, 'attachments.0.name' => 300])
            ->and($transcript->messages[0]['attachments'])->toBe([])
            ->and($transcript->messages[0]['source'])->toBe(['span_id' => 'r', 'path' => 'input', 'redacted' => true, 'truncated' => true]);
    });
});

describe('a list of messages that was cut', function () {
    $old = fn () => [Spans::user('Earlier'), Spans::assistant('Reply'), Spans::user('Another earlier')];

    it('does not give the last stored message as the start of the turn when nothing says where the list was cut', function (array $attributes) use ($old) {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, $old(), output: Spans::text('Done'), attributes: ['truncated' => true, ...$attributes]),
        ], status: 'completed');

        expect(Spans::outline($transcript))->toBe([['prompt', 'user', 'Hi'], ['response', 'assistant', 'Done']])
            ->and(Spans::sources($transcript))->toBe(['r:input', 's1:output'])
            ->and([$transcript->state, $transcript->reason, $transcript->historyCount])->toBe(['partial', 'history_boundary_unknown', null]);
    })->with([
        'with no path' => [[]],
        'with as many paths as are kept' => [['truncated_paths' => array_fill_keys(array_map(fn (int $n): string => 'input.messages.'.$n.'.content', range(0, 49)), 900)]],
    ]);

    it('does not take an old tool result for the start of a turn from decisions when the list was cut', function () {
        $transcript = Spans::stitch([
            Spans::root(['prompt' => '']),
            Spans::step('s1', 2, [Spans::user('Earlier'), Spans::toolResult([['id' => 'a', 'name' => 'x', 'result' => 'r']])], output: Spans::text('Done'), attributes: ['truncated' => true]),
        ]);

        expect(Spans::sources($transcript))->toBe(['s1:output'])
            ->and([$transcript->state, $transcript->reason, $transcript->historyCount])->toBe(['partial', 'history_boundary_unknown', null]);
    });

    it('still finds the start when the cuts it lists are in strings', function () use ($old) {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, $old(), output: Spans::text('Done'), attributes: ['truncated' => true, 'truncated_paths' => ['input.messages.0.content' => 9000]]),
        ]);

        expect(Spans::outline($transcript))->toBe([['prompt', 'user', 'Another earlier'], ['response', 'assistant', 'Done']])
            ->and([$transcript->state, $transcript->historyCount])->toBe(['stored', 2]);
    });

    it('says messages may be missing after a later step whose list was cut with no path', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c1', 'x')])),
            Spans::step('s2', 3, [Spans::assistant('a'), Spans::toolResult([['id' => 'c1', 'name' => 'x', 'result' => 'r']])], 1, Spans::text('Done'), ['truncated' => true]),
        ]);

        expect(Spans::sources($transcript))->toBe(['s1:input.messages.0', 's2:input.messages.0', 's2:input.messages.1', 's2:output'])
            ->and([$transcript->state, $transcript->reason])->toBe(['partial', 'offset_gap']);
    });
});

describe('a step that stored its messages oddly', function () {
    it('reads a negative offset as zero', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], -1, Spans::asking([Spans::call('c1', 'x')])),
            Spans::step('s2', 3, [Spans::assistant('a'), Spans::toolResult([['id' => 'c1', 'name' => 'x', 'result' => 'r']])], 1, Spans::text('Done')),
        ]);

        expect(Spans::sources($transcript))->toBe(['s1:input.messages.0', 's2:input.messages.0', 's2:input.messages.1', 's2:output'])
            ->and([$transcript->state, $transcript->reason])->toBe(['stored', null]);
    });

    it('does not read messages stored as a map', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, ['role' => 'user', 'content' => 'Mapped'], output: Spans::text('Done')),
        ]);

        expect(Spans::outline($transcript))->toBe([['prompt', 'user', 'Hi'], ['response', 'assistant', 'Done']])
            ->and([$transcript->state, $transcript->reason, $transcript->historyCount])->toBe(['partial', 'step_input_missing', null]);
    });
});

describe('the calls settled by the first message', function () {
    $history = fn (array $calls) => [Spans::user('Do it'), Spans::assistant('', $calls), Spans::toolResult([['id' => 'toolu_1', 'name' => 'delete_records', 'result' => 'r']])];

    it('are not linked by id when the history repeats an id', function () use ($history) {
        $call = Spans::call('toolu_1', 'delete_records', ['table' => 'users']);

        $transcript = Spans::stitch([
            Spans::root(['prompt' => '']),
            Spans::tool('t1', 2, 'delete_records', ['arguments' => ['table' => 'users']]),
            Spans::step('s1', 3, [...$history([$call]), Spans::assistant('', [$call]), Spans::toolResult([['id' => 'toolu_1', 'name' => 'delete_records', 'result' => 'r']])], output: Spans::text('Done')),
        ], resolved: ['toolu_1']);

        expect($transcript->messages[0]['tool_results'][0]['span_id'])->toBeNull();
    });

    it('are not linked when the arguments in the history were cut', function () use ($history) {
        $call = Spans::call('toolu_1', 'delete_records', ['table' => 'use']);

        $transcript = Spans::stitch([
            Spans::root(['prompt' => '']),
            Spans::tool('t1', 2, 'delete_records', ['arguments' => ['table' => 'use']]),
            Spans::step('s1', 3, $history([$call]), output: Spans::text('Done'), attributes: ['truncated' => true, 'truncated_paths' => ['input.messages.1.tool_calls.0.arguments.table' => 900]]),
        ], resolved: ['toolu_1']);

        expect($transcript->messages[0]['tool_results'][0]['span_id'])->toBeNull();
    });

    it('are not linked when the arguments in the history were redacted', function () use ($history) {
        $call = Spans::call('toolu_1', 'delete_records', ['table' => '[redacted]']);

        $transcript = Spans::stitch([
            Spans::root(['prompt' => '']),
            Spans::tool('t1', 2, 'delete_records', ['arguments' => ['table' => '[redacted]']]),
            Spans::step('s1', 3, $history([$call]), output: Spans::text('Done'), attributes: ['redacted' => true]),
        ], resolved: ['toolu_1']);

        expect($transcript->messages[0]['tool_results'][0]['span_id'])->toBeNull();
    });

    it('are linked when the history is sound', function () use ($history) {
        $call = Spans::call('toolu_1', 'delete_records', ['table' => 'users']);

        $transcript = Spans::stitch([
            Spans::root(['prompt' => '']),
            Spans::tool('t1', 2, 'delete_records', ['arguments' => ['table' => 'users']]),
            Spans::step('s1', 3, $history([$call]), output: Spans::text('Done')),
        ], resolved: ['toolu_1']);

        expect($transcript->messages[0]['tool_results'][0]['span_id'])->toBe('t1');
    });
});

describe('the calls of an earlier request', function () {
    it('have not started only in the latest request of a turn that runs', function () {
        $transcript = Spans::stitch([
            Spans::root(),
            Spans::step('s1', 2, [Spans::user('Hi')], output: Spans::asking([Spans::call('c1', 'lookup', ['q' => 'a'])])),
            Spans::tool('t1', 3, 'lookup', ['arguments' => ['q' => 'other']]),
            Spans::step('s2', 4, [Spans::assistant('', [Spans::call('c1', 'lookup', ['q' => 'a'])]), Spans::toolResult([['id' => 'c1', 'name' => 'lookup', 'result' => 'r']])], 1, Spans::asking([Spans::call('c2', 'lookup', ['q' => 'b'])])),
        ], status: 'running');

        $links = fn (array $message): array => array_column($message['tool_calls'], 'link', 'id');

        expect(Spans::sources($transcript))->toBe(['s1:input.messages.0', 's2:input.messages.0', 's2:input.messages.1', 's2:output'])
            ->and($links($transcript->messages[1]))->toBe(['c1' => 'unlinked'])
            ->and($links($transcript->messages[3]))->toBe(['c2' => 'not_started']);
    });
});
