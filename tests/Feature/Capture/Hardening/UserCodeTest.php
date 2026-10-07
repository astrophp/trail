<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\ProbeAgent;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Replay;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Reports;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Ai\Responses\Data\ToolCall;

/*
|--------------------------------------------------------------------------
| User code that Trail calls
|--------------------------------------------------------------------------
|
| An agent's instructions(), its conversation methods, a tool's name(), the
| names of classes. Trail reads them to describe a run; it must not call them
| more often than the SDK would, or more expensively, or let them change what
| the caller sees.
|
*/

beforeEach(function () {
    config(['cache.default' => 'array']);

    // The harness's own event log reads the agent's conversation methods; it would be counted as Trail.
    Event::forget('Laravel\Ai\Events\*');

    $this->reports = Reports::capture();
    $this->probe = new DatabaseStoreProbe;

    /** What a call returns or throws, as [class, message] for an exception. */
    $this->outcome = function (Closure $call): mixed {
        try {
            return $call();
        } catch (Throwable $e) {
            return [$e::class, $e->getMessage()];
        }
    };
});

describe('an agent\'s instructions()', function () {
    /** How often instructions() is called by one run, with Trail's recording on or off. */
    $calls = function (bool $trail): int {
        ProbeAgent::reset();
        ProbeAgent::fake(['Hello']);

        if (! $trail) {
            Replay::detach();
        }

        (new ProbeAgent)->prompt('Hi');
        Trail::flush();

        return ProbeAgent::$instructionsCalls;
    };

    it('is read once more by Trail for each run, to capture the system prompt', function () use ($calls) {
        $with = $calls(true);
        $without = $calls(false);

        Replay::say("instructions() called $with times with Trail, $without without");

        expect($with)->toBe($without + 1);
    });

    it('is not read by Trail when the system prompt is switched off', function () use ($calls) {
        config(['trail.capture.system_prompt' => false]);

        expect($calls(true))->toBe($calls(false));
    });

    it('costs one query more than the SDK runs itself, and none when the system prompt is switched off', function (bool $systemPrompt, int $extra) {
        config(['trail.capture.system_prompt' => $systemPrompt]);

        $count = function (bool $trail): int {
            ProbeAgent::reset('queries');
            ProbeAgent::fake(['Hello']);

            if (! $trail) {
                Replay::detach();
            }

            $queries = 0;
            DB::listen(function ($query) use (&$queries) {
                if (! str_contains($query->sql, 'trail_traces')) {
                    $queries++;
                }
            });

            (new ProbeAgent)->prompt('Hi');

            return $queries;
        };

        $with = $count(true);
        $without = $count(false);

        expect($with - $without)->toBe($extra);
    })->with([[true, 1], [false, 0]]);

    it('does not make a slow instructions() slower than the SDK already does when the system prompt is switched off', function () {
        config(['trail.capture.system_prompt' => false]);
        ProbeAgent::reset('slow');
        ProbeAgent::fake(['Hello']);

        $with = Replay::ms(fn () => (new ProbeAgent)->prompt('Hi'));

        Replay::detach();
        ProbeAgent::fake(['Hello']);
        $without = Replay::ms(fn () => (new ProbeAgent)->prompt('Hi'));

        Replay::say(sprintf('instructions() that takes 80 ms: %.0f ms with Trail, %.0f ms without', $with, $without));

        expect($with - $without)->toBeLessThan(40);
    });

    it('can throw, and the caller gets the exception the SDK raises', function (string $mode) {
        ProbeAgent::reset($mode);
        ProbeAgent::fake(['Hello']);

        $with = ($this->outcome)(fn () => (new ProbeAgent)->prompt('Hi'));
        Trail::flush();

        Replay::detach();
        ProbeAgent::fake(['Hello']);
        $without = ($this->outcome)(fn () => (new ProbeAgent)->prompt('Hi'));

        expect($with)->toEqual($without)
            ->and($this->reports->count())->toBeLessThanOrEqual(2);
    })->with(['throws', 'stringable that throws']);
});

describe('an agent\'s conversation methods', function () {
    it('are never asked of an agent that does not remember conversations, since the SDK never asks it', function () {
        ProbeAgent::reset();
        ProbeAgent::fake(['Hello']);

        (new ProbeAgent)->prompt('Hi');
        Trail::flush();

        Replay::say(sprintf('per run: conversationParticipant() %d times, currentConversation() %d times', ProbeAgent::$participantCalls, ProbeAgent::$conversationCalls));

        expect(ProbeAgent::$participantCalls)->toBe(0)
            ->and(ProbeAgent::$conversationCalls)->toBe(0);
    });

    it('add no query of their own to a run when the application\'s method queries', function () {
        ProbeAgent::reset();
        ProbeAgent::fake(['Hello']);

        $queries = [];
        DB::listen(function ($query) use (&$queries) {
            $queries[] = $query->sql;
        });

        (new ProbeAgent)->prompt('Hi');

        // The early insert is Trail's one allowed query. The application's participant method is not a Trail query,
        // but Trail is what called it: the SDK never does for an agent that does not remember conversations.
        $others = array_values(array_filter($queries, fn ($sql) => preg_match('/^insert into ["`]trail_traces["`]/', $sql) !== 1));

        expect($others)->toBe([], 'Trail made the application run: '.implode(' | ', $others));
    });
});

describe('a tool\'s name()', function () {
    it('can throw: the caller gets the SDK\'s exception', function () {
        $tool = new class extends CallbackTool
        {
            public function __construct()
            {
                parent::__construct('x', fn () => 'ok');
            }

            public function name(): string
            {
                throw new RuntimeException('name() failed');
            }
        };

        AssistantAgent::fake([new ToolCall('call_1', 'x', []), 'Done']);

        $with = ($this->outcome)(fn () => (new AssistantAgent([$tool]))->prompt('Hi'));
        Trail::flush();

        Replay::detach();
        AssistantAgent::fake([new ToolCall('call_1', 'x', []), 'Done']);
        $without = ($this->outcome)(fn () => (new AssistantAgent([$tool]))->prompt('Hi'));

        expect($with)->toEqual($without);
    });
});

describe('very long names', function () {
    it('are stored cut to the column, for an agent class, a tool, an exception class and a user type', function () {
        $suffix = str_repeat('Z', 480);

        eval("namespace Hardening; class LongAgent{$suffix} extends \\Astro\\Trail\\Tests\\Fixtures\\Agents\\AssistantAgent {}");
        eval("namespace Hardening; class LongException{$suffix} extends \\RuntimeException {}");

        $agent = "Hardening\\LongAgent{$suffix}";
        $exception = "Hardening\\LongException{$suffix}";
        $tool = new CallbackTool(str_repeat('t', 500), fn () => throw new $exception('too long'));

        $agent::fake([new ToolCall('call_1', str_repeat('t', 500), []), 'Done']);

        try {
            (new $agent([$tool]))->prompt('Hi');
        } catch (Throwable) {
        }

        Trail::flush();

        $id = DB::table('trail_traces')->value('id');
        $lengths = collect($this->probe->spans($id))->flatMap(fn ($span) => [strlen($span['name']), strlen((string) $span['agent_class']), strlen((string) $span['error_class'])]);

        expect($this->probe->trace($id)['status'])->not->toBe('running')
            ->and(strlen($this->probe->trace($id)['agent_class']))->toBeLessThanOrEqual(255)
            ->and($lengths->max())->toBeLessThanOrEqual(255)
            ->and($this->reports->count())->toBe(0);
    });
});
