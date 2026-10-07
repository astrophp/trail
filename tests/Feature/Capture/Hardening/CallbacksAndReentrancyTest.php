<?php

use Astro\Trail\Capture\Payload;
use Astro\Trail\Capture\Recorder;
use Astro\Trail\Capture\Sampler;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\RecordingCandidate;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Replay;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Reports;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Scenarios;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\StepCompleted;
use Laravel\Ai\Responses\Data\ToolCall;

/*
|--------------------------------------------------------------------------
| Callbacks, listeners and bindings that misbehave
|--------------------------------------------------------------------------
|
| The filter, withoutRecording, the application's own listeners on the same SDK
| events, and the container bindings Trail resolves while a run is in flight.
|
*/

beforeEach(function () {
    config(['cache.default' => 'array']);

    $this->reports = Reports::capture();
    $this->probe = new DatabaseStoreProbe;

    /** A run whose tool calls $inTool halfway, so the callback runs while the run is in flight. */
    $this->runWithTool = function (Closure $inTool): string {
        AssistantAgent::fake([new ToolCall('call_1', 'poke', ['query' => 'x']), 'Done']);

        return (new AssistantAgent([new CallbackTool('poke', function () use ($inTool) {
            $inTool();

            return 'poked';
        })]))->prompt('Hi')->text;
    };

    $this->traceStatus = function (): ?string {
        $id = DB::table('trail_traces')->value('id');

        return $id === null ? null : $this->probe->trace($id)['status'];
    };
});

describe('the filter', function () {
    it('can throw an Error, and the run is recorded and the Error reported', function () {
        Trail::filter(fn () => throw new TypeError('filter broke'));

        expect(Scenarios::hello())->toBe('Hello');
        Trail::flush();

        expect($this->probe->traceCount())->toBe(1)
            ->and($this->reports->count())->toBe(1);
    });

    it('can call Trail::flush() while deciding', function () {
        Trail::filter(function () {
            Trail::flush();

            return true;
        });

        expect(Scenarios::hello())->toBe('Hello');
        Trail::flush();

        expect($this->probe->traceCount())->toBe(1)->and(($this->traceStatus)())->toBe('completed');
    });

    it('can call withoutRecording and start runs of its own while deciding', function () {
        Trail::filter(function () {
            Trail::withoutRecording(fn () => Scenarios::hello());
            Scenarios::hello();

            return true;
        });

        Scenarios::hello();
        Trail::flush();

        expect($this->probe->traceCount())->toBe(1);
    });

    it('can replace or clear itself while it runs', function () {
        Trail::filter(function () {
            Trail::filter(null);

            return false;
        });

        Scenarios::hello();
        Scenarios::hello();
        Trail::flush();

        // The first run is skipped by the filter that cleared itself; the second has no filter.
        expect($this->probe->traceCount())->toBe(1);
    });

    it('is asked once per top-level run, not per step, sub-agent or embeddings call', function () {
        $asked = 0;
        Trail::filter(function (RecordingCandidate $candidate) use (&$asked) {
            $asked++;

            return true;
        });

        Scenarios::nested();
        Scenarios::plain();

        expect($asked)->toBe(2);
    });
});

describe('withoutRecording', function () {
    it('gives recording back when the callback throws an Error, and nested', function () {
        try {
            Trail::withoutRecording(fn () => Trail::withoutRecording(fn () => throw new TypeError('inside')));
        } catch (TypeError) {
        }

        Scenarios::hello();
        Trail::flush();

        expect($this->probe->traceCount())->toBe(1);
    });

    it('still runs the callback and returns its value when the sampler cannot be built', function () {
        $this->app->bind(Sampler::class, fn () => throw new RuntimeException('no sampler'));

        $value = Trail::withoutRecording(fn () => 'the callback ran');

        expect($value)->toBe('the callback ran');
    });

    it('still lets Trail::filter be called when the sampler cannot be built', function () {
        $this->app->bind(Sampler::class, fn () => throw new RuntimeException('no sampler'));

        Trail::filter(fn () => false);

        expect(true)->toBeTrue();
    });
});

describe('re-entrancy', function () {
    it('writes a run as running when its tool calls Trail::flush(), and does not follow it after that', function () {
        // A flush is for between runs: it writes what is held, finished or not, and forgets it.
        expect(($this->runWithTool)(fn () => Trail::flush()))->toBe('Done');
        Trail::flush();

        expect(($this->traceStatus)())->toBe('running')
            ->and(DB::table('trail_spans')->orderBy('sequence')->pluck('status')->all())->toBe(['running', 'completed', 'running'])
            ->and(Replay::held())->toBe(['runs' => 0, 'buffers' => 0, 'embeddings' => 0, 'skipped' => 0]);
    });

    it('gives the caller the same result, and writes the run as running, when a listener calls Trail::flush() on every step', function () {
        Event::listen(StepCompleted::class, fn () => Trail::flush());

        $withTrail = Scenarios::plain();
        Trail::flush();

        Replay::detach();
        $without = Scenarios::plain();

        expect($withTrail)->toBe($without)
            ->and(($this->traceStatus)())->toBe('running');
    });

    it('holds nothing after a flush from inside a listener, a tool and a terminating callback', function () {
        Event::listen(AgentPrompted::class, fn () => Trail::flush());
        $this->app->terminating(fn () => Trail::flush());

        ($this->runWithTool)(fn () => Trail::flush());
        $this->app->terminate();

        expect(Replay::held())->toBe(['runs' => 0, 'buffers' => 0, 'embeddings' => 0, 'skipped' => 0]);
    });

    it('lets the caller see the application listener\'s exception, and records nothing wrong, when it throws before Trail\'s', function () {
        Replay::first(StepCompleted::class, fn () => throw new DomainException('the application\'s listener broke'));

        $thrown = null;

        try {
            AssistantAgent::fake(['Hello']);
            (new AssistantAgent)->prompt('Hi');
        } catch (Throwable $e) {
            $thrown = $e;
        }

        expect($thrown)->toBeInstanceOf(DomainException::class);

        Trail::flush();

        // The run is reported as it was seen, and nothing is held for the next one.
        expect(Replay::held())->toBe(['runs' => 0, 'buffers' => 0, 'embeddings' => 0, 'skipped' => 0]);

        $this->app['events']->forget(StepCompleted::class);
        Scenarios::hello();
        Trail::flush();

        expect($this->probe->traceCount())->toBe(2);
    });

    it('triggers no Eloquent events with its own writes', function () {
        $fired = [];
        Event::listen('eloquent.*', function (string $name) use (&$fired) {
            $fired[] = $name;
        });

        Scenarios::plain();
        Trail::flush();

        expect($fired)->toBe([]);
    });

    it('does not record a run that is started by a query listener while Trail writes its own rows', function () {
        $depth = 0;

        DB::listen(function ($query) use (&$depth) {
            // A query listener that calls an agent on every query, Trail\'s own included, would feed on its own inserts.
            if ($depth < 3 && str_contains($query->sql, 'trail_traces')) {
                $depth++;
                Scenarios::hello();
            }
        });

        Scenarios::hello();
        Trail::flush();

        expect($this->probe->traceCount())->toBe(1);
    });
});

describe('Trail::fake() and broken bindings in the middle of a run', function () {
    it('lets the run finish when the store is swapped for a fake halfway', function () {
        expect(($this->runWithTool)(fn () => Trail::fake()))->toBe('Done');
        Trail::flush();

        expect($this->reports->count())->toBe(0);
    });

    it('lets the run finish when a binding breaks halfway', function (string $abstract) {
        $result = ($this->runWithTool)(function () use ($abstract) {
            $this->app->bind($abstract, fn () => throw new LogicException("$abstract is gone"));
        });
        Trail::flush();

        expect($result)->toBe('Done');
    })->with([Recorder::class, Sampler::class, Payload::class, TraceStore::class, CostCalculator::class]);

    it('reports a broken binding a handful of times, not once per event', function (string $abstract) {
        $this->app->bind($abstract, fn () => throw new LogicException("$abstract is gone"));

        AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'x']), 'Done']);
        (new AssistantAgent([new LookupTool]))->prompt('Hi');
        Trail::flush();

        // The run has eight events and the flush one more.
        expect($this->reports->count())->toBeLessThanOrEqual(9);
    })->with([Recorder::class, Sampler::class, Payload::class, TraceStore::class, CostCalculator::class]);
});
