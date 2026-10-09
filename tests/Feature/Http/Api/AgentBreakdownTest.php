<?php

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Http\AgentRows;
use Illuminate\Support\Carbon;

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
function breakdownAt(mixed $test, string $name, string $query = ''): array
{
    return $test->getJson('/trail/api/agents/breakdown?name='.urlencode($name).($query === '' ? '' : '&'.$query))->assertOk()->json();
}

/**
 * A step span of a run.
 *
 * @param  array<string, mixed>  $attributes
 */
function breakdownStep(Trace $run, string $id, string $model, string $started, array $attributes = [], string $provider = 'openai', ?string $parent = null): void
{
    AgentRows::span($run, SpanType::Step, 'step', $started, [...['id' => $id, 'provider' => $provider, 'model' => $model, 'parent_id' => $parent ?? $run->id], ...$attributes]);
}

/**
 * A tool span of a run.
 *
 * @param  array<string, mixed>  $attributes
 */
function breakdownTool(Trace $run, string $id, string $name, string $started, array $attributes = [], ?string $parent = null): void
{
    AgentRows::span($run, SpanType::Tool, $name, $started, [...['id' => $id, 'parent_id' => $parent ?? $run->id], ...$attributes]);
}

/**
 * Runs and spans in the default range (the clock is 2026-01-02 12:00:00):
 *
 * - Alpha, two runs: r1 uses openai/gpt-5 twice, anthropic/claude-sonnet once without a price,
 *   a model that reported nothing and an embeddings model; calls search twice (once failing) and ask;
 *   delegates to Beta, whose step and tool are in the run too. r2 has a step still running, a step
 *   running past the cutoff, and a failing search.
 * - Beta: a run of its own with a step and a tool, and the delegation inside r1.
 * - Host: a run that delegates to Gamma, which is never run on its own.
 * - Before the range: a run of Alpha with a step.
 */
function breakdownDataset(): void
{
    $one = AgentRows::run('Alpha', '2026-01-02 10:00:00', ['id' => 'r1']);
    // The run's own span: the steps and tools below are its children, and it is no delegation.
    AgentRows::span($one, SpanType::Agent, 'Alpha', '2026-01-02 10:00:00', ['id' => 'r1']);
    breakdownStep($one, 'st1', 'gpt-5', '2026-01-02 10:00:01', ['input_tokens' => 100, 'output_tokens' => 50, 'cost' => 0.01]);
    breakdownStep($one, 'st2', 'gpt-5', '2026-01-02 10:00:02', ['input_tokens' => 200, 'output_tokens' => 10, 'cost' => 0.02]);
    breakdownStep($one, 'st3', 'claude-sonnet', '2026-01-02 10:00:03', ['input_tokens' => 50, 'output_tokens' => 5], 'anthropic');
    breakdownStep($one, 'st4', 'gpt-5-mini', '2026-01-02 10:00:04');
    breakdownTool($one, 'tool-search-1', 'search', '2026-01-02 10:00:05');
    breakdownTool($one, 'tool-search-2', 'search', '2026-01-02 10:00:06', ['status' => Status::Failed]);
    breakdownTool($one, 'tool-ask', 'ask', '2026-01-02 10:00:07');
    AgentRows::span($one, SpanType::Embedding, 'embed', '2026-01-02 10:00:08', ['id' => 'emb1', 'parent_id' => 'tool-search-1', 'provider' => 'openai', 'model' => 'text-embedding-3-small', 'input_tokens' => 7, 'cost' => 0.0001]);
    AgentRows::span($one, SpanType::Agent, 'Beta', '2026-01-02 10:00:09', ['id' => 'beta-1', 'parent_id' => 'tool-ask']);
    breakdownStep($one, 'b-st1', 'gpt-5', '2026-01-02 10:00:10', ['input_tokens' => 10, 'output_tokens' => 1, 'cost' => 0.001], parent: 'beta-1');
    breakdownTool($one, 'b-tool1', 'beta_tool', '2026-01-02 10:00:11', parent: 'beta-1');

    $two = AgentRows::run('Alpha', '2026-01-02 11:00:00', ['id' => 'r2', 'status' => Status::Failed]);
    breakdownStep($two, 'st5', 'gpt-5', '2026-01-02 11:00:01', ['status' => Status::Running]);
    breakdownStep($two, 'st6', 'claude-sonnet', '2026-01-02 11:00:02', ['input_tokens' => 3, 'cost' => 0.003, 'status' => Status::Running, 'created_at' => Carbon::now()->subHours(3)], 'anthropic');
    breakdownTool($two, 'tool-search-3', 'search', '2026-01-02 11:00:03', ['status' => Status::Failed]);

    $beta = AgentRows::run('Beta', '2026-01-02 09:00:00', ['id' => 'r3']);
    breakdownStep($beta, 'bst', 'gpt-5', '2026-01-02 09:00:01', ['input_tokens' => 1, 'cost' => 0.0001]);
    breakdownTool($beta, 'bt1', 'beta_tool', '2026-01-02 09:00:02');

    $host = AgentRows::run('Host', '2026-01-02 10:30:00', ['id' => 'r4']);
    breakdownTool($host, 'host-tool', 'delegate', '2026-01-02 10:30:01');
    AgentRows::span($host, SpanType::Agent, 'Gamma', '2026-01-02 10:30:02', ['id' => 'gamma-1', 'parent_id' => 'host-tool']);
    breakdownStep($host, 'g-st1', 'claude-sonnet', '2026-01-02 10:30:03', ['input_tokens' => 4, 'cost' => 0.004], 'anthropic', parent: 'gamma-1');
    breakdownTool($host, 'g-tool1', 'gtool', '2026-01-02 10:30:04', ['status' => Status::Failed], parent: 'gamma-1');

    $before = AgentRows::run('Alpha', '2026-01-01 11:00:00', ['id' => 'r0']);
    breakdownStep($before, 'st0', 'gpt-5', '2026-01-01 11:00:01', ['input_tokens' => 999, 'cost' => 9.99]);
    breakdownTool($before, 'tool-0', 'search', '2026-01-01 11:00:02');
}

it('breaks down the models and tools of an agent\'s runs, the agents it delegated to included', function () {
    breakdownDataset();

    $body = breakdownAt($this, 'Alpha');

    expect($body['range'])->toBe(['preset' => '24h', 'from' => '2026-01-01T12:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z'])
        ->and($body['data']['models'])->toBe([
            [
                'provider' => 'anthropic', 'model' => 'claude-sonnet', 'steps' => 2, 'runs' => 2,
                // The step past the cutoff is not running, so the row is final: one step has a price, one has none.
                'usage' => ['state' => 'reported', 'input_tokens' => 53, 'output_tokens' => 5, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => 58],
                'cost' => ['state' => 'partial', 'amount' => 0.003],
                'filters' => ['agent' => 'Alpha', 'provider' => 'anthropic', 'model' => 'claude-sonnet'],
            ],
            [
                // Three steps with usage, one in the delegated agent, and one still running.
                'provider' => 'openai', 'model' => 'gpt-5', 'steps' => 4, 'runs' => 2,
                'usage' => ['state' => 'pending', 'input_tokens' => 310, 'output_tokens' => 61, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => 371],
                'cost' => ['state' => 'pending', 'amount' => 0.031],
                'filters' => ['agent' => 'Alpha', 'provider' => 'openai', 'model' => 'gpt-5'],
            ],
            [
                'provider' => 'openai', 'model' => 'gpt-5-mini', 'steps' => 1, 'runs' => 1,
                'usage' => ['state' => 'not_reported', 'input_tokens' => null, 'output_tokens' => null, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => null],
                'cost' => ['state' => 'not_captured', 'amount' => null],
                'filters' => ['agent' => 'Alpha', 'provider' => 'openai', 'model' => 'gpt-5-mini'],
            ],
            [
                'provider' => 'openai', 'model' => 'text-embedding-3-small', 'steps' => 1, 'runs' => 1,
                'usage' => ['state' => 'reported', 'input_tokens' => 7, 'output_tokens' => null, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => 7],
                'cost' => ['state' => 'estimated', 'amount' => 0.0001],
                'filters' => ['agent' => 'Alpha', 'provider' => 'openai', 'model' => 'text-embedding-3-small'],
            ],
        ])
        ->and($body['data']['tools'])->toBe([
            ['name' => 'search', 'calls' => 3, 'failed' => 2, 'runs' => 2, 'filters' => ['agent' => 'Alpha', 'tool' => 'search']],
            ['name' => 'ask', 'calls' => 1, 'failed' => 0, 'runs' => 1, 'filters' => ['agent' => 'Alpha', 'tool' => 'ask']],
            ['name' => 'beta_tool', 'calls' => 1, 'failed' => 0, 'runs' => 1, 'filters' => ['agent' => 'Alpha', 'tool' => 'beta_tool']],
        ])
        ->and($body['data']['delegated'])->toBe(['models' => [], 'tools' => []])
        ->and($body['limits'])->toBe([
            'models' => ['limit' => 20, 'total' => 4],
            'tools' => ['limit' => 20, 'total' => 3],
            'delegated' => ['models' => ['limit' => 20, 'total' => 0], 'tools' => ['limit' => 20, 'total' => 0]],
        ]);
});

it('gives each row the parameters of a list that returns exactly its runs', function (string $range) {
    breakdownDataset();

    $body = breakdownAt($this, 'Alpha', $range);

    expect($body['data']['models'])->not->toBe([])->and($body['data']['tools'])->not->toBe([]);

    foreach ([...$body['data']['models'], ...$body['data']['tools']] as $row) {
        $list = $this->getJson('/trail/api/traces?'.http_build_query($row['filters']).($range === '' ? '' : '&'.$range))->assertOk()->json('pagination.total');

        expect($row['runs'])->toBe($list, json_encode($row['filters']));
    }
})->with(['', 'range=7d', 'from=2026-01-02T10:00:00Z&to=2026-01-02T10:30:00Z']);

it('breaks down the models and tools of the delegated runs apart, without parameters that cannot reproduce them', function () {
    breakdownDataset();

    $beta = breakdownAt($this, 'Beta');
    $gamma = breakdownAt($this, 'Gamma');

    // Beta has runs of its own, and is delegated to once, in r1.
    expect($beta['data']['models'])->toHaveCount(1)
        ->and($beta['data']['models'][0])->toMatchArray(['provider' => 'openai', 'model' => 'gpt-5', 'steps' => 1, 'runs' => 1])
        ->and($beta['data']['tools'])->toBe([['name' => 'beta_tool', 'calls' => 1, 'failed' => 0, 'runs' => 1, 'filters' => ['agent' => 'Beta', 'tool' => 'beta_tool']]])
        ->and($beta['data']['delegated']['models'])->toBe([[
            'provider' => 'openai', 'model' => 'gpt-5', 'steps' => 1, 'runs' => 1,
            'usage' => ['state' => 'reported', 'input_tokens' => 10, 'output_tokens' => 1, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => 11],
            'cost' => ['state' => 'estimated', 'amount' => 0.001],
        ]])
        ->and($beta['data']['delegated']['tools'])->toBe([['name' => 'beta_tool', 'calls' => 1, 'failed' => 0, 'runs' => 1]])
        // Gamma is only ever delegated to: nothing of its own, and what its delegated runs used.
        ->and($gamma['data']['models'])->toBe([])
        ->and($gamma['data']['tools'])->toBe([])
        ->and($gamma['data']['delegated']['models'][0])->toMatchArray(['provider' => 'anthropic', 'model' => 'claude-sonnet', 'steps' => 1, 'runs' => 1])
        ->and($gamma['data']['delegated']['tools'])->toBe([['name' => 'gtool', 'calls' => 1, 'failed' => 1, 'runs' => 1]])
        ->and($gamma['limits']['models'])->toBe(['limit' => 20, 'total' => 0]);
});

it('keeps the runs of the range only', function () {
    breakdownDataset();

    $before = breakdownAt($this, 'Alpha', 'from=2026-01-01T00:00:00Z&to=2026-01-01T12:00:00Z');

    expect($before['data']['models'])->toHaveCount(1)
        ->and($before['data']['models'][0])->toMatchArray(['model' => 'gpt-5', 'steps' => 1, 'runs' => 1])
        ->and($before['data']['models'][0]['usage']['input_tokens'])->toBe(999)
        ->and($before['data']['tools'])->toBe([['name' => 'search', 'calls' => 1, 'failed' => 0, 'runs' => 1, 'filters' => ['agent' => 'Alpha', 'tool' => 'search']]]);
});

it('lists at most twenty of each, the ones in most runs, and says how many there are', function () {
    $run = AgentRows::run('Alpha', '2026-01-02 10:00:00', ['id' => 'big']);
    $other = AgentRows::run('Alpha', '2026-01-02 10:30:00', ['id' => 'big-2']);

    foreach (range(1, 21) as $i) {
        $name = sprintf('%02d', $i);
        breakdownStep($run, "s{$name}", "model-{$name}", '2026-01-02 10:00:01');
        breakdownTool($run, "t{$name}", "tool-{$name}", '2026-01-02 10:00:02');
    }

    // The last model and tool are in two runs, so they come first although their names sort last.
    breakdownStep($other, 's21b', 'model-21', '2026-01-02 10:30:01');
    breakdownTool($other, 't21b', 'tool-21', '2026-01-02 10:30:02');

    $body = breakdownAt($this, 'Alpha');

    expect($body['data']['models'])->toHaveCount(20)
        ->and($body['data']['models'][0]['model'])->toBe('model-21')
        ->and($body['data']['models'][1]['model'])->toBe('model-01')
        ->and($body['data']['models'][19]['model'])->toBe('model-19')
        ->and($body['limits']['models'])->toBe(['limit' => 20, 'total' => 21])
        ->and($body['data']['tools'])->toHaveCount(20)
        ->and($body['data']['tools'][0]['name'])->toBe('tool-21')
        ->and($body['limits']['tools'])->toBe(['limit' => 20, 'total' => 21]);
});

it('leaves out a span that started before the range although its run started in it, as the runs list does', function () {
    $run = AgentRows::run('Alpha', '2026-01-01 12:00:00.500', ['id' => 'edge']);
    breakdownTool($run, 'early-tool', 'early_tool', '2026-01-01 11:59:59');
    breakdownStep($run, 'early-step', 'early-model', '2026-01-01 11:59:59');
    breakdownTool($run, 'kept-tool', 'kept_tool', '2026-01-01 12:00:01');

    $body = breakdownAt($this, 'Alpha');

    expect(array_column($body['data']['tools'], 'name'))->toBe(['kept_tool'])
        ->and($body['data']['models'])->toBe([])
        ->and($this->getJson('/trail/api/traces?agent=Alpha&tool=early_tool')->json('pagination.total'))->toBe(0)
        ->and($this->getJson('/trail/api/traces?agent=Alpha&model=early-model')->json('pagination.total'))->toBe(0)
        ->and($this->getJson('/trail/api/traces?agent=Alpha&tool=kept_tool')->json('pagination.total'))->toBe(1);
});

it('lists no model for a span that recorded no provider or model', function () {
    $run = AgentRows::run('Alpha', '2026-01-02 10:00:00', ['id' => 'r1']);
    breakdownStep($run, 'known', 'gpt-5', '2026-01-02 10:00:01');
    AgentRows::span($run, SpanType::Step, 'step', '2026-01-02 10:00:02', ['id' => 'no-model', 'parent_id' => 'r1', 'provider' => 'openai', 'model' => null]);
    AgentRows::span($run, SpanType::Step, 'step', '2026-01-02 10:00:03', ['id' => 'no-provider', 'parent_id' => 'r1', 'provider' => null, 'model' => 'gpt-5']);

    $body = breakdownAt($this, 'Alpha');

    expect(array_column($body['data']['models'], 'steps', 'model'))->toBe(['gpt-5' => 1])
        ->and($body['limits']['models']['total'])->toBe(1);
});

it('answers an agent recorded outside the range with nothing to break down', function () {
    breakdownDataset();
    AgentRows::run('Omega', '2025-12-01 10:00:00', ['id' => 'omega']);

    $body = breakdownAt($this, 'Omega');

    expect($body['data'])->toBe(['models' => [], 'tools' => [], 'delegated' => ['models' => [], 'tools' => []]])
        ->and($body['limits'])->toBe([
            'models' => ['limit' => 20, 'total' => 0],
            'tools' => ['limit' => 20, 'total' => 0],
            'delegated' => ['models' => ['limit' => 20, 'total' => 0], 'tools' => ['limit' => 20, 'total' => 0]],
        ])
        ->and($body['range']['preset'])->toBe('24h');
});

it('answers an agent only delegated to outside the range the same way', function () {
    $before = AgentRows::run('Zed', '2026-01-01 11:59:59', ['id' => 'z1']);
    AgentRows::span($before, SpanType::Agent, 'Yankee', '2026-01-02 11:00:00', ['id' => 'yankee-1', 'parent_id' => 'z1']);

    expect(breakdownAt($this, 'Yankee')['data']['models'])->toBe([])
        ->and(breakdownAt($this, 'Yankee', 'range=7d')['data']['delegated'])->toBe(['models' => [], 'tools' => []]);
});

it('answers a name never recorded with a 404', function () {
    breakdownDataset();

    $this->getJson('/trail/api/agents/breakdown?name=Nobody')->assertNotFound()->assertJsonStructure(['message']);
    // A step, a tool and a root agent span are not agents delegated to.
    $this->getJson('/trail/api/agents/breakdown?name=search')->assertNotFound();
    $this->getJson('/trail/api/agents/breakdown?name=step')->assertNotFound();
});

it('spells the filters as the latest run spells the name', function () {
    AgentRows::run('support', '2026-01-02 09:00:00', ['id' => 's1']);
    $run = AgentRows::run('support', '2026-01-02 11:00:00', ['id' => 's2']);
    breakdownTool($run, 'st', 'search', '2026-01-02 11:00:01');

    $body = breakdownAt($this, 'support');

    expect($body['data']['tools'][0]['filters'])->toBe(['agent' => 'support', 'tool' => 'search']);
});

describe('the reads', function () {
    it('are the lookup of the name and four reads of spans', function () {
        breakdownDataset();

        expect(AgentRows::statements(fn () => breakdownAt($this, 'Alpha')))->toHaveCount(5)
            // Gamma has no run of its own: its latest run is looked for first.
            ->and(AgentRows::statements(fn () => breakdownAt($this, 'Gamma')))->toHaveCount(6);
    });

    it('are the lookups alone for an agent with nothing in the range', function () {
        breakdownDataset();
        AgentRows::run('Omega', '2025-12-01 10:00:00', ['id' => 'omega']);

        // In the range by run, by delegated span; then ever, by run.
        expect(AgentRows::statements(fn () => breakdownAt($this, 'Omega')))->toHaveCount(3);
    });
});

describe('the name', function () {
    it('is read from the raw query, whatever characters it holds', function (string $name) {
        AgentRows::run($name, '2026-01-02 10:00:00', ['id' => 'odd']);
        AgentRows::run(trim($name).'x', '2026-01-02 10:00:00', ['id' => 'other']);

        $body = $this->getJson('/trail/api/agents/breakdown?name='.rawurlencode($name))->assertOk()->json();

        expect($body['data'])->toBe(['models' => [], 'tools' => [], 'delegated' => ['models' => [], 'tools' => []]]);
    })->with([
        'a slash' => 'a/b',
        'a leading space' => ' padded',
        'a percent sign' => '100%',
        'a plus sign' => 'c++',
        'a question mark' => 'is it?',
        'an ampersand' => 'a&b=c',
        'multibyte' => 'Zoë',
    ]);

    it('does not read a plus sign as a space', function () {
        AgentRows::run('a b', '2026-01-02 10:00:00');

        $this->getJson('/trail/api/agents/breakdown?name=a+b')->assertOk();
        $this->getJson('/trail/api/agents/breakdown?name=a%2Bb')->assertNotFound();
    });

    it('is not trimmed, so a leading space is part of it', function () {
        AgentRows::run(' padded', '2026-01-02 10:00:00');

        $this->getJson('/trail/api/agents/breakdown?name=padded')->assertNotFound();
        $this->getJson('/trail/api/agents/breakdown?name=%20padded')->assertOk();
    });

    it('may be 255 characters long, and not 256', function () {
        AgentRows::run(str_repeat('a', 255), '2026-01-02 10:00:00');

        $this->getJson('/trail/api/agents/breakdown?name='.str_repeat('a', 255))->assertOk();
        expect(AgentRows::statements(fn () => $this->getJson('/trail/api/agents/breakdown?name='.str_repeat('a', 256))->assertNotFound()))->toBe([]);
    });

    it('is a 404 that does not reach the database when it cannot be a name', function (string $query) {
        AgentRows::run('a', '2026-01-02 10:00:00');

        expect(AgentRows::statements(fn () => $this->getJson('/trail/api/agents/breakdown'.$query)->assertNotFound()->assertJsonStructure(['message'])))->toBe([]);
    })->with([
        'missing' => [''],
        'empty' => ['?name='],
        'a NUL byte' => ['?name=a%00b'],
        'not UTF-8' => ['?name=%FF'],
        'a list' => ['?name[]=a'],
        'a keyed list' => ['?name[a]=a'],
    ]);

    it('is a 404 for a name of 256 multibyte characters without reaching the database', function () {
        expect(AgentRows::statements(fn () => $this->getJson('/trail/api/agents/breakdown?name='.str_repeat('%C3%A9', 256))->assertNotFound()))->toBe([]);
    });

    it('is checked before the range', function () {
        $this->getJson('/trail/api/agents/breakdown?name=&range=bad')->assertNotFound();
    });
});

describe('errors', function () {
    it('answers a bad range with a 422', function () {
        AgentRows::run('a', '2026-01-02 10:00:00');

        $this->getJson('/trail/api/agents/breakdown?name=a&range=bad')->assertUnprocessable()->assertJsonValidationErrors(['range']);
    });

    it('answers a denied request with a JSON 403', function () {
        $this->app['env'] = 'production';

        $this->get('/trail/api/agents/breakdown?name=a', ['Accept' => 'text/html'])->assertForbidden()->assertJsonStructure(['message']);

        Trail::auth(fn () => true);
        $this->get('/trail/api/agents/breakdown?name=a', ['Accept' => 'text/html'])->assertNotFound();
    });

    it('answers a JSON 404 when the dashboard is switched off', function () {
        AgentRows::run('a', '2026-01-02 10:00:00');
        config(['trail.dashboard.enabled' => false]);

        $this->get('/trail/api/agents/breakdown?name=a', ['Accept' => 'text/html'])->assertNotFound()->assertJsonStructure(['message']);
    });
});
