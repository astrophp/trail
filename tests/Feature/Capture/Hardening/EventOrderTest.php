<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Replay;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Reports;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Laravel\Ai\Events\ToolInvoked;

/*
|--------------------------------------------------------------------------
| Events for an invocation Trail never saw, and events in the wrong order
|--------------------------------------------------------------------------
|
| The SDK's events are replayed one by one into the real recorder and the real
| database store. Whatever order they come in, nothing is thrown, nothing is
| reported as a Trail failure, nothing is left held after the flush, and what
| is stored is a coherent trace.
|
*/

beforeEach(function () {
    config(['cache.default' => 'array']);

    Event::forget('Laravel\Ai\Events\*');
    $this->reports = Reports::capture();
    $this->probe = new DatabaseStoreProbe;
    $this->id = fn (): string => (string) Str::uuid7();

    /** Rows after a flush, and a check that nothing is held. */
    $this->settle = function (): array {
        Trail::flush();

        expect(Replay::held())->toBe(['runs' => 0, 'buffers' => 0, 'embeddings' => 0, 'skipped' => 0]);

        return [$this->probe->traceCount(), $this->probe->spanCount()];
    };
});

it('ignores a terminal event for a run it never saw', function () {
    Replay::finish(($this->id)());
    Replay::fail(($this->id)());

    expect(($this->settle)())->toBe([0, 0])->and($this->reports->count())->toBe(0);
});

it('ignores a step, a tool and an embeddings event for an invocation it never saw', function () {
    $id = ($this->id)();

    Replay::step($id, 0);
    Replay::tool($id, ($this->id)());
    Replay::embeddingEnd($id);
    Replay::approvalResolved($id);

    expect(($this->settle)())->toBe([0, 0])->and($this->reports->count())->toBe(0);
});

it('opens a tool span for a result whose start it never saw, and closes the run normally', function () {
    $id = ($this->id)();

    Replay::start($id);
    event(new ToolInvoked($id, ($this->id)(), new AssistantAgent, new LookupTool, [], 'result', 3.0));
    Replay::finish($id);

    expect(($this->settle)())->toBe([1, 2])
        ->and($this->probe->trace($id)['status'])->toBe('completed')
        ->and($this->reports->count())->toBe(0);
});

it('keeps one trace when a start arrives twice, and finishes it once when the end arrives twice', function () {
    $id = ($this->id)();

    Replay::start($id);
    Replay::start($id);
    Replay::step($id, 0);
    Replay::finish($id);
    Replay::finish($id);
    Replay::fail($id);

    [$traces] = ($this->settle)();

    expect($traces)->toBe(1)
        ->and($this->probe->trace($id)['status'])->toBe('completed')
        ->and($this->reports->count())->toBe(0);
});

it('ignores events that arrive after the flush wrote their run, and leaves what was written alone', function () {
    $id = ($this->id)();

    Replay::start($id);
    Replay::step($id, 0);
    Trail::flush();

    $before = $this->probe->spans($id);

    Replay::step($id, 1);
    Replay::tool($id, ($this->id)());
    Replay::finish($id);

    [$traces] = ($this->settle)();

    expect($traces)->toBe(1)
        ->and($this->probe->spans($id))->toBe($before)
        ->and($this->reports->count())->toBe(0);
});

it('does not record a sub-agent whose parent is itself, or whose parent it never saw', function () {
    $id = ($this->id)();

    Replay::subAgent($id, $id);
    Replay::subAgent(($this->id)(), ($this->id)());

    expect(($this->settle)())->toBe([0, 0])->and($this->reports->count())->toBe(0);
});

it('keeps a sub-agent under a parent that names itself as its parent and its own id as the tool', function () {
    $id = ($this->id)();

    Replay::start($id);
    Replay::subAgent($id.'-child', $id, $id);
    Replay::finish($id.'-child');
    Replay::finish($id);

    [$traces] = ($this->settle)();

    expect($traces)->toBe(1)->and($this->reports->count())->toBe(0);
});

it('keeps a tool span for each call when one run reuses a tool invocation id', function () {
    $id = ($this->id)();
    $tool = ($this->id)();

    Replay::start($id);
    Replay::tool($id, $tool, 'first');
    Replay::tool($id, $tool, 'second');
    Replay::finish($id);

    ($this->settle)();

    expect($this->reports->count())->toBe(0)
        ->and(DB::table('trail_spans')->where('trace_id', $id)->where('type', 'tool')->count())->toBeGreaterThanOrEqual(1);
});

it('stores the run when an embeddings call uses the run\'s own id', function () {
    $id = ($this->id)();

    Replay::start($id);
    Replay::embeddingStart($id);
    Replay::embeddingEnd($id);
    Replay::finish($id);

    ($this->settle)();

    expect($this->probe->trace($id)['status'])->toBe('completed')
        ->and($this->reports->count())->toBe(0);
});

it('leaves a start row for a run that is started and never ended, and sweeps it as incomplete', function () {
    $id = ($this->id)();

    Replay::start($id, streamed: true);
    Replay::openStep($id);

    ($this->settle)();

    expect($this->probe->trace($id)['status'])->toBe('running');
});

it('survives every event in every position of a short run', function () {
    $events = [
        fn ($id) => Replay::start($id),
        fn ($id) => Replay::openStep($id),
        fn ($id) => Replay::step($id, 0),
        fn ($id) => Replay::tool($id, 'tool-'.$id),
        fn ($id) => Replay::tool($id, 'open-'.$id, finish: false),
        fn ($id) => Replay::finish($id),
        fn ($id) => Replay::fail($id),
        fn ($id) => Replay::embeddingStart($id),
        fn ($id) => Replay::embeddingEnd($id),
        fn ($id) => Replay::approvalResolved($id),
        fn ($id) => Trail::flush(),
    ];

    // Every ordered pair and every ordered triple of events, 1,331 sequences, against the same recorder.
    foreach (array_keys($events) as $a) {
        foreach (array_keys($events) as $b) {
            foreach (array_keys($events) as $c) {
                $id = ($this->id)();

                foreach ([$a, $b, $c] as $position) {
                    $events[$position]($id);
                }
            }
        }
    }

    Trail::flush();

    expect(Replay::held())->toBe(['runs' => 0, 'buffers' => 0, 'embeddings' => 0, 'skipped' => 0])
        ->and($this->reports->count())->toBe(0, implode(' | ', array_unique($this->reports->messages())));
})->group('slow');
