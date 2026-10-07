<?php

use Astro\Trail\Capture\Payload;
use Astro\Trail\Capture\Recorder;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\InstructedAgent;
use Astro\Trail\Tests\Fixtures\Capture\Captured;
use Astro\Trail\Tests\Fixtures\Capture\Failures;
use Astro\Trail\Tests\Fixtures\Capture\Secrets;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\ApprovalTool;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Illuminate\Config\Repository;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Laravel\Ai\Files\Image;

/*
|--------------------------------------------------------------------------
| What reaches the database of everything a run carried
|--------------------------------------------------------------------------
|
| Secrets are removed before anything is stored, text is cut to a limit, and
| payload capture can be turned off. Each secret below is searched for in every
| column of both tables.
|
*/

beforeEach(function () {
    /** Every column of both tables, as one text. */
    $this->rows = fn (): string => json_encode([DB::table('trail_traces')->get(), DB::table('trail_spans')->get()], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

    $this->stored = function (): Captured {
        Trail::flush();

        return Captured::read($this->sdk->invocationIds()[0]);
    };

    /** The redacted flag of each span, in order. */
    $this->flags = fn (Captured $run, string $column = 'redacted'): array => array_map(fn (array $span) => $span[$column], $run->rawSpans());

    $this->toolTurn = fn (array $input = ['query' => 'x']) => FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => $input]]);

    $this->lookup = fn (string $result = 'found') => new CallbackTool('lookup', fn () => $result);
});

describe('a secret', function () {
    it('in the prompt never reaches the database', function () {
        FakeAnthropic::script([FakeAnthropic::text('ok')]);

        (new AssistantAgent)->prompt('My key is '.Secrets::PROMPT.' please remember it', model: FakeAnthropic::MODEL);
        $run = ($this->stored)();

        expect(($this->rows)())->not->toContain(Secrets::PROMPT)
            ->and($run->rawSpans()[0]['input']['prompt'])->toBe('My key is [redacted] please remember it')
            ->and(($this->flags)($run))->toBe([true, true])
            ->and($run->rawTrace()['prompt_excerpt'])->toBe('My key is [redacted] please remember it');
    });

    it('in a tool argument, by key and by pattern, never reaches the database', function () {
        FakeAnthropic::script([
            ($this->toolTurn)(['api_key' => Secrets::KEYED, 'note' => 'use '.Secrets::PATTERN, 'query' => 'x']),
            FakeAnthropic::text('ok'),
        ]);

        (new AssistantAgent([($this->lookup)()]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $run = ($this->stored)();

        expect(($this->rows)())->not->toContain(Secrets::KEYED)->not->toContain(Secrets::PATTERN)
            ->and($run->rawSpans()[2]['input'])->toBe(['arguments' => ['api_key' => '[redacted]', 'note' => 'use [redacted]', 'query' => 'x']])
            // The prompt and the answer are clean; the call is in the first step's output, the tool's input and the second step's history.
            ->and(($this->flags)($run))->toBe([false, true, true, true]);
    });

    it('in a tool result never reaches the database, including the history of the next step', function () {
        FakeAnthropic::script([($this->toolTurn)(), FakeAnthropic::text('ok')]);

        (new AssistantAgent([($this->lookup)('the key is '.Secrets::RESULT)]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $run = ($this->stored)();

        expect(($this->rows)())->not->toContain(Secrets::RESULT)
            ->and($run->rawSpans()[2]['output'])->toBe(['result' => 'the key is [redacted]'])
            ->and($run->rawSpans()[3]['input']['messages'][2]['tool_results'][0]['result'])->toBe('the key is [redacted]')
            ->and(($this->flags)($run))->toBe([false, false, true, true]);
    });

    it('in the system prompt never reaches the database', function () {
        InstructedAgent::$text = 'Use the key '.Secrets::SYSTEM.' for everything.';
        FakeAnthropic::script([FakeAnthropic::text('ok')]);

        (new InstructedAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
        $run = ($this->stored)();
        InstructedAgent::$text = 'You are a test assistant.';

        expect(($this->rows)())->not->toContain(Secrets::SYSTEM)
            ->and($run->rawSpans()[0]['input']['system'])->toBe('Use the key [redacted] for everything.')
            ->and(($this->flags)($run))->toBe([true, false]);
    });

    it('in the model output never reaches the database or the excerpt', function () {
        FakeAnthropic::script([FakeAnthropic::text('The key is '.Secrets::OUTPUT)]);

        (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
        $run = ($this->stored)();

        expect(($this->rows)())->not->toContain(Secrets::OUTPUT)
            ->and($run->rawSpans()[0]['output'])->toBe(['text' => 'The key is [redacted]'])
            ->and($run->rawTrace()['response_excerpt'])->toBe('The key is [redacted]')
            ->and(($this->flags)($run))->toBe([true, true]);
    });

    it('in an exception message never reaches the database', function () {
        FakeAnthropic::script([($this->toolTurn)()]);

        $tool = new CallbackTool('lookup', fn () => throw new RuntimeException('failed with '.Secrets::ERROR));

        Failures::thrown(fn () => (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)();

        expect(($this->rows)())->not->toContain(Secrets::ERROR)
            ->and($run->rawTrace()['error_message'])->toBe('failed with [redacted]')
            ->and($run->rawSpans()[0]['error_message'])->toBe('failed with [redacted]')
            ->and($run->rawSpans()[2]['error_message'])->toBe('failed with [redacted]')
            ->and(($this->flags)($run))->toBe([true, false, true]);
    });

    it('in a pending approval, its arguments and its reason, never reaches the database', function () {
        FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'delete_records', 'input' => ['table' => 'users', 'note' => Secrets::APPROVAL, 'token' => Secrets::KEYED]]])]);

        (new AssistantAgent([(new ApprovalTool)->requireApproval('because of '.Secrets::REASON)]))->withMessages([])->prompt('Delete', model: FakeAnthropic::MODEL);
        $run = ($this->stored)();

        expect(($this->rows)())->not->toContain(Secrets::APPROVAL)->not->toContain(Secrets::REASON)->not->toContain(Secrets::KEYED)
            ->and($run->rawTrace()['metadata']['pending_approvals'][0])->toBe([
                'tool_call_id' => 'toolu_1', 'tool' => 'delete_records', 'arguments' => ['table' => 'users', 'note' => '[redacted]', 'token' => '[redacted]'], 'reason' => 'because of [redacted]',
            ])->and(($this->flags)($run))->toBe([true, true]);
    });
});

describe('truncation', function () {
    it('cuts a long string to the limit and says where and from what length', function () {
        config(['trail.capture.max_length' => 50]);
        FakeAnthropic::script([FakeAnthropic::text('ok')]);

        (new AssistantAgent)->prompt(str_repeat('abcdefghij', 12), model: FakeAnthropic::MODEL);
        $run = ($this->stored)();

        expect($run->rawSpans()[0]['input']['prompt'])->toBe(str_repeat('abcdefghij', 5))
            ->and($run->rawSpans()[0]['metadata'])->toBe(['truncated' => ['input.prompt' => 120]])
            ->and($run->rawSpans()[1]['metadata'])->toBe(['truncated' => ['input.messages.0.content' => 120]])
            ->and(($this->flags)($run, 'truncated'))->toBe([true, true])
            ->and(($this->flags)($run))->toBe([false, false]);
    });

    it('cuts an exception message too', function () {
        config(['trail.capture.max_length' => 30]);
        FakeAnthropic::script([($this->toolTurn)()]);

        $tool = new CallbackTool('lookup', fn () => throw new RuntimeException(str_repeat('e', 100)));

        Failures::thrown(fn () => (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)();

        expect($run->rawTrace()['error_message'])->toBe(str_repeat('e', 30))
            ->and($run->rawSpans()[2]['metadata'])->toBe(['truncated' => ['error_message' => 100]])
            ->and(($this->flags)($run, 'truncated'))->toBe([true, false, true]);
    });
});

describe('excerpts', function () {
    it('are redacted, at most a thousand characters, and null for an empty prompt', function () {
        FakeAnthropic::script([FakeAnthropic::text(str_repeat('answer ', 400)), FakeAnthropic::text('ok')]);

        $long = (new AssistantAgent)->prompt('Start '.Secrets::PROMPT.' '.str_repeat('word ', 800), model: FakeAnthropic::MODEL);
        $empty = (new AssistantAgent)->prompt('', model: FakeAnthropic::MODEL);
        Trail::flush();

        $first = Captured::read($long->invocationId)->rawTrace();
        $second = Captured::read($empty->invocationId)->rawTrace();

        expect(mb_strlen($first['prompt_excerpt']))->toBe(1000)
            ->and($first['prompt_excerpt'])->toStartWith('Start [redacted] word')
            ->and(mb_strlen($first['response_excerpt']))->toBe(1000)
            ->and($second['prompt_excerpt'])->toBeNull()
            ->and($second['response_excerpt'])->toBe('ok');
    });
});

describe('with payload capture off', function () {
    it('stores no payload, but everything else', function () {
        config(['trail.capture.enabled' => false]);
        config(['trail.pricing.anthropic' => [FakeAnthropic::MODEL => ['input' => 3.0, 'output' => 15.0]]]);
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
            FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3]),
        ]);

        (new AssistantAgent([($this->lookup)()]))->prompt('Hi '.Secrets::PROMPT, model: FakeAnthropic::MODEL);
        $run = ($this->stored)()->assertVolatileColumns();

        expect(array_column($run->rawSpans(), 'input'))->each->toBeNull()
            ->and(array_column($run->rawSpans(), 'output'))->each->toBeNull()
            ->and([$run->rawTrace()['prompt_excerpt'], $run->rawTrace()['response_excerpt']])->toBe([null, null])
            ->and(Captured::pick([$run->trace()], ['status', 'input_tokens', 'output_tokens', 'cost', 'span_count'])[0])->toBe(['status' => 'completed', 'input_tokens' => 107, 'output_tokens' => 23, 'cost' => '0.0006660000', 'span_count' => 4])
            ->and(($this->rows)())->not->toContain(Secrets::PROMPT);
    });

    it('keeps an exception message, redacted, and the arguments of a pending approval out', function () {
        config(['trail.capture.enabled' => false]);
        FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'delete_records', 'input' => ['table' => 'users']]])]);

        (new AssistantAgent([(new ApprovalTool)->requireApproval('Deletes data')]))->withMessages([])->prompt('Delete', model: FakeAnthropic::MODEL);
        $paused = ($this->stored)();

        expect($paused->rawTrace()['metadata']['pending_approvals'])->toBe([['tool_call_id' => 'toolu_1', 'tool' => 'delete_records']]);

        $this->sdk->clear();
        FakeAnthropic::script([($this->toolTurn)()]);
        $tool = new CallbackTool('lookup', fn () => throw new RuntimeException('failed with '.Secrets::ERROR));

        Failures::thrown(fn () => (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL));
        $failed = ($this->stored)();

        expect($failed->rawTrace()['error_message'])->toBe('failed with [redacted]')
            ->and($failed->rawSpans()[2]['input'])->toBeNull();
    });

    it('does not read the system prompt when it is turned off', function () {
        FakeAnthropic::script([FakeAnthropic::text('ok'), FakeAnthropic::text('ok')]);

        InstructedAgent::$reads = 0;
        (new InstructedAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
        $withCapture = InstructedAgent::$reads;

        config(['trail.capture.system_prompt' => false]);
        // The setting is read once per process, so a fresh application is needed: the recorder is rebuilt instead.
        app()->forgetInstance(Payload::class);
        app()->forgetInstance(Recorder::class);

        InstructedAgent::$reads = 0;
        (new InstructedAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
        $without = InstructedAgent::$reads;
        $run = ($this->stored)();

        // The SDK reads the instructions itself on every run; Trail's own read is the difference.
        expect($withCapture - $without)->toBe(1)
            ->and(Captured::read($this->sdk->invocationIds()[1])->rawSpans()[0]['input']['system'])->toBeNull();
    });
});

describe('attachments', function () {
    it('are stored as descriptions, never as content', function () {
        $content = 'PRIVATE-BINARY-CONTENT-OF-AN-IMAGE';
        FakeAnthropic::script([FakeAnthropic::text('ok')]);

        (new AssistantAgent)->prompt('Describe it', attachments: [Image::fromBase64(base64_encode($content), 'image/png')->as('photo.png')], model: FakeAnthropic::MODEL);
        $run = ($this->stored)();

        $description = ['type' => 'base64-image', 'name' => 'photo.png', 'size' => strlen($content)];

        expect($run->rawSpans()[0]['input']['attachments'])->toBe([$description])
            ->and($run->rawSpans()[1]['input']['messages'][0]['attachments'])->toBe([$description])
            ->and(($this->rows)())->not->toContain($content)->not->toContain(base64_encode($content));
    });
});

it('records the run normally and reports a bad redaction pattern once', function () {
    Exceptions::fake();
    config(['trail.redaction.patterns' => ['/(unclosed/', '/\bACME-\d{4}\b/']]);
    FakeAnthropic::script([($this->toolTurn)(), FakeAnthropic::text('ticket ACME-1234 done')]);

    (new AssistantAgent([($this->lookup)()]))->prompt('Look up ACME-9999', model: FakeAnthropic::MODEL);
    $run = ($this->stored)();

    Exceptions::assertReportedCount(1);
    expect($run->rawTrace()['status'])->toBe('completed')
        ->and($run->rawSpans()[0]['input']['prompt'])->toBe('Look up [redacted]')
        ->and($run->rawTrace()['response_excerpt'])->toBe('ticket [redacted] done');
});

describe('settings', function () {
    it('reports an invalid pattern once however often it captures, and keeps applying the others', function () {
        Exceptions::fake();

        $payload = new Payload(patterns: ['/(unclosed/', '/\bACME-\d{4}\b/']);

        foreach (range(1, 20) as $i) {
            $captured = $payload->capture("ACME-1234 call {$i}");
        }

        Exceptions::assertReportedCount(1);
        Exceptions::assertReported(fn (InvalidArgumentException $e) => str_contains($e->getMessage(), '/(unclosed/'));
        expect($captured->value)->toBe('[redacted] call 20');
    });

    it('uses the default limit for a limit that is not positive, and says so', function (mixed $limit) {
        Exceptions::fake();

        $payload = Payload::fromConfig(new Repository(['trail' => ['capture' => ['max_length' => $limit]]]));
        $captured = $payload->capture(str_repeat('x', 12_000));

        Exceptions::assertReportedCount(1);
        expect(strlen($captured->value))->toBe(Payload::DEFAULT_MAX_LENGTH);
    })->with([0, -5, 'ten', '0', '-5', '5000.5', '', true]);

    it('accepts a limit that arrives as text, as it does from an environment variable', function (mixed $limit, int $expected) {
        Exceptions::fake();

        $payload = Payload::fromConfig(new Repository(['trail' => ['capture' => ['max_length' => $limit]]]));

        Exceptions::assertNothingReported();
        expect(mb_strlen($payload->capture(str_repeat('x', 12_000))->value))->toBe($expected);
    })->with([['5000', 5000], [' 42 ', 42], [7, 7]]);

    it('says why a pattern is not valid', function () {
        Exceptions::fake();

        new Payload(patterns: ['/(unclosed/']);

        Exceptions::assertReported(fn (InvalidArgumentException $e) => str_contains($e->getMessage(), 'missing closing parenthesis') && ! str_contains($e->getMessage(), 'Internal error'));
    });

    it('reports a key entry that cannot work, and keeps the rest', function () {
        Exceptions::fake();

        $payload = new Payload(keys: ['*', 'pa*ss', '**x', '*_', '', 'ssn']);

        Exceptions::assertReportedCount(5);
        expect($payload->capture(['ssn' => '1', 'pa*ss' => '2', 'x' => '3', 'anything' => '4'])->value)
            ->toBe(['ssn' => '[redacted]', 'pa*ss' => '2', 'x' => '3', 'anything' => '4']);
    });

    it('takes no limit from null', function () {
        $payload = Payload::fromConfig(new Repository(['trail' => ['capture' => ['max_length' => null]]]));

        expect(strlen($payload->capture(str_repeat('x', 30_000))->value))->toBe(30_000);
    });
});

it('builds nothing when capture is off', function () {
    config(['trail.capture.enabled' => false]);
    $recorder = app(Recorder::class);
    $built = 0;

    $captured = (new ReflectionMethod($recorder, 'capturing'))->invoke($recorder, 'input', function () use (&$built): array {
        $built++;

        return ['messages' => 'x'];
    });

    expect($built)->toBe(0)->and($captured->value)->toBeNull();

    config(['trail.capture.enabled' => true]);
    app()->forgetInstance(Payload::class);
    app()->forgetInstance(Recorder::class);
    $recorder = app(Recorder::class);

    $captured = (new ReflectionMethod($recorder, 'capturing'))->invoke($recorder, 'input', function () use (&$built): array {
        $built++;

        return ['messages' => 'x'];
    });

    expect($built)->toBe(1)->and($captured->value)->toBe(['messages' => 'x']);
});
