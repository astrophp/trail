<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Http\AgentRows;
use Astro\Trail\Tests\Fixtures\Http\UsageRows;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:00:00');
});

afterEach(function () {
    Carbon::setTestNow();
    $this->app['env'] = 'testing';
});

/**
 * @return array<string, mixed>
 */
function usageAt(mixed $test, string $query = ''): array
{
    return $test->getJson('/trail/api/usage'.($query === '' ? '' : '?'.$query))->assertOk()->json();
}

/**
 * @return array<string, mixed>
 */
function overviewSummaryAt(mixed $test, string $query = ''): array
{
    return $test->getJson('/trail/api/overview'.($query === '' ? '' : '?'.$query))->assertOk()->json('data.summary');
}

describe('the totals', function () {
    it('is the summary of the overview, for any range', function (string $query) {
        UsageRows::dataset();

        $usage = usageAt($this, $query);

        expect($usage['data']['summary'])->toBe(overviewSummaryAt($this, $query));
    })->with([
        'the default range' => [''],
        'a week' => ['range=7d'],
        'the last hour' => ['range=1h'],
        'an explicit range' => ['from=2026-01-02T09:00:00Z&to=2026-01-02T11:00:00Z'],
        'a range with no run' => ['from=2025-12-01T00:00:00Z&to=2025-12-02T00:00:00Z'],
        'a range that ends where a run starts' => ['from=2026-01-02T08:00:00Z&to=2026-01-02T10:00:00Z'],
        'a range over 24 hours' => ['from=2025-12-25T00:00:00Z&to=2026-01-02T12:00:00Z'],
    ]);

    it('counts the runs by the status they show, a running run and a stale one included', function () {
        UsageRows::dataset();

        $summary = usageAt($this)['data']['summary'];

        // Twelve runs: one is running now and one was left running past the cutoff, which is incomplete.
        expect($summary['runs'])->toBe(AgentRows::counts(completed: 9, failed: 1, incomplete: 1, running: 1))
            ->and($summary['usage']['state'])->toBe('pending')
            ->and($summary['usage']['input_tokens'])->toBe(1391)
            ->and($summary['cost']['state'])->toBe('pending')
            ->and($summary['cost']['amount'])->toBe(0.0392)
            ->and($summary['cost_coverage'])->toBe(['unpriced_runs' => 4, 'runs_without_amount' => 5]);
    });

    it('is not pending when the running run is past the cutoff, and is final when nothing is running', function () {
        UsageRows::run('Stale', '2026-01-02 07:00:00', [UsageRows::step('openai', 'gpt-5', ['inputTokens' => 3, 'cost' => 0.003, 'status' => Status::Running])], ['status' => Status::Running], storedAt: '2026-01-02 09:00:00');
        UsageRows::run('Partly', '2026-01-02 08:00:00', [
            UsageRows::step('openai', 'gpt-5', ['inputTokens' => 10, 'outputTokens' => 2, 'cost' => 0.01]),
            UsageRows::step('openai', 'mystery', ['inputTokens' => 5]),
        ]);
        UsageRows::run('Unpriced', '2026-01-02 09:00:00', [UsageRows::step('openai', 'mystery', ['inputTokens' => 7])]);

        $summary = usageAt($this)['data']['summary'];

        expect($summary['runs'])->toBe(AgentRows::counts(completed: 2, incomplete: 1))
            ->and($summary['usage']['state'])->toBe('reported')
            ->and($summary['cost'])->toBe(['state' => 'partial', 'amount' => 0.013])
            ->and($summary['cost_coverage'])->toBe(['unpriced_runs' => 2, 'runs_without_amount' => 1]);
    });

    it('is the summary of an empty range', function () {
        $body = usageAt($this);

        expect($body['data']['summary']['runs'])->toBe(AgentRows::counts())
            ->and($body['data']['summary']['usage']['state'])->toBe('not_reported')
            ->and($body['data']['summary']['cost'])->toBe(['state' => 'not_captured', 'amount' => null])
            ->and($body['data']['coverage'])->toBe(['steps' => 0, 'reported_steps' => 0, 'unpriced_steps' => 0, 'unpriced_tokens' => 0])
            ->and($body['range'])->toBe(['preset' => '24h', 'from' => '2026-01-01T12:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z']);
    });

    it('repeats the explicit range it read', function () {
        $body = usageAt($this, 'from=2026-01-02T09:00:00Z&to=2026-01-02T11:00:00Z');

        expect($body['range'])->toBe(['preset' => null, 'from' => '2026-01-02T09:00:00.000Z', 'to' => '2026-01-02T11:00:00.000Z']);
    });
});

describe('the coverage', function () {
    it('counts every row of the summary, a step without its provider or its model included', function () {
        UsageRows::dataset();

        // 16 steps, 14 of which reported usage; 4 could not be priced, three with input or output tokens (55, 40 and 6) and one without.
        expect(usageAt($this)['data']['coverage'])->toBe(['steps' => 16, 'reported_steps' => 14, 'unpriced_steps' => 4, 'unpriced_tokens' => 101]);
    });

    it('reads the runs that started in the range, and only those', function () {
        UsageRows::dataset();

        // Only run 1 starts in the window: five steps, four reported, one of them (55 tokens) not priced.
        expect(usageAt($this, 'from=2026-01-02T10:00:00Z&to=2026-01-02T10:30:00Z')['data']['coverage'])
            ->toBe(['steps' => 5, 'reported_steps' => 4, 'unpriced_steps' => 1, 'unpriced_tokens' => 55]);
    });

    it('has no unpriced steps and no unpriced tokens when every step reported was priced', function () {
        UsageRows::run('Priced', '2026-01-02 10:00:00', [
            UsageRows::step('openai', 'gpt-5', ['inputTokens' => 10, 'outputTokens' => 2, 'cost' => 0.01]),
            UsageRows::step('openai', 'gpt-5', ['inputTokens' => 4, 'cost' => 0]),
            // A step that reported nothing is not unpriced: there was nothing to price.
            UsageRows::step('openai', 'gpt-5'),
        ]);

        expect(usageAt($this)['data']['coverage'])->toBe(['steps' => 3, 'reported_steps' => 2, 'unpriced_steps' => 0, 'unpriced_tokens' => 0]);
    });

    it('sums the tokens of the steps that could not be priced', function () {
        UsageRows::run('Mixed', '2026-01-02 10:00:00', [
            UsageRows::step('openai', 'gpt-5', ['inputTokens' => 10, 'cost' => 0.01]),
            UsageRows::step('openai', 'mystery', ['inputTokens' => 7, 'outputTokens' => 3]),
            UsageRows::step('acme', 'tiny', ['outputTokens' => 5, 'cacheReadTokens' => 100]),
        ]);

        expect(usageAt($this)['data']['coverage'])->toBe(['steps' => 3, 'reported_steps' => 3, 'unpriced_steps' => 2, 'unpriced_tokens' => 15]);
    });

    it('does not know the tokens of unpriced steps that reported only cache or reasoning tokens', function () {
        UsageRows::run('Cached', '2026-01-02 10:00:00', [
            UsageRows::step('openai', 'gpt-5', ['inputTokens' => 10, 'cost' => 0.01]),
            UsageRows::step('openai', 'mystery', ['cacheReadTokens' => 100]),
            UsageRows::step('openai', 'mystery', ['reasoningTokens' => 30]),
        ]);

        $coverage = usageAt($this)['data']['coverage'];

        expect($coverage)->toBe(['steps' => 3, 'reported_steps' => 3, 'unpriced_steps' => 2, 'unpriced_tokens' => null])
            ->and(array_key_exists('unpriced_tokens', $coverage))->toBeTrue();
    });

    it('is zero for a range with no run, and zero steps for runs without any step', function () {
        UsageRows::run('Bare', '2026-01-02 10:00:00');

        expect(usageAt($this)['data']['coverage'])->toBe(['steps' => 0, 'reported_steps' => 0, 'unpriced_steps' => 0, 'unpriced_tokens' => 0])
            ->and(usageAt($this, 'range=1h')['data']['coverage'])->toBe(['steps' => 0, 'reported_steps' => 0, 'unpriced_steps' => 0, 'unpriced_tokens' => 0]);
    });

    it('has no steps for a run recorded without a summary', function () {
        $run = Rows::trace(['name' => 'Old', 'status' => Status::Completed, 'started_at' => '2026-01-02 10:00:00']);
        Rows::span($run, ['type' => 'step', 'provider' => 'openai', 'model' => 'gpt-5', 'input_tokens' => 5]);

        $body = usageAt($this);

        expect($body['data']['coverage'])->toBe(['steps' => 0, 'reported_steps' => 0, 'unpriced_steps' => 0, 'unpriced_tokens' => 0])
            ->and($body['data']['summary']['runs']['all'])->toBe(1);
    });

    it('does not count a model only an agent span asked for as a step', function () {
        UsageRows::run('Asker', '2026-01-02 10:00:00', [UsageRows::agent('openai', 'gpt-5'), UsageRows::step('openai', 'gpt-5', ['inputTokens' => 1, 'cost' => 0.001])]);

        expect(usageAt($this)['data']['coverage'])->toBe(['steps' => 1, 'reported_steps' => 1, 'unpriced_steps' => 0, 'unpriced_tokens' => 0]);
    });

    it('leaves out the runs before the range and those that start where it ends', function () {
        UsageRows::run('Before', '2026-01-01 11:59:59', [UsageRows::step('openai', 'gpt-5', ['inputTokens' => 1])]);
        UsageRows::run('In', '2026-01-01 12:00:00', [UsageRows::step('openai', 'gpt-5', ['inputTokens' => 2])]);
        UsageRows::run('Out', '2026-01-02 12:00:00', [UsageRows::step('openai', 'gpt-5', ['inputTokens' => 4])]);

        expect(usageAt($this)['data']['coverage'])->toBe(['steps' => 1, 'reported_steps' => 1, 'unpriced_steps' => 1, 'unpriced_tokens' => 2])
            ->and(usageAt($this, 'from=2026-01-01T11:00:00Z&to=2026-01-02T12:00:01Z')['data']['coverage']['steps'])->toBe(3);
    });
});

describe('the statements it runs', function () {
    it('is the overview\'s statements and one more', function (string $query) {
        UsageRows::dataset();

        $overview = AgentRows::statements(fn () => overviewSummaryAt($this, $query));
        $usage = AgentRows::statements(fn () => usageAt($this, $query));

        expect($overview)->toHaveCount(1)->and($usage)->toHaveCount(2);
    })->with(['', 'range=7d', 'range=1h', 'from=2025-12-01T00:00:00Z&to=2025-12-02T00:00:00Z']);

    it('adds one statement to the overview\'s when the overview reads a percentile too', function () {
        foreach (range(1, 20) as $n) {
            UsageRows::run('Timed', '2026-01-02 08:00:00', [UsageRows::step('openai', 'gpt-5', ['inputTokens' => 1, 'cost' => 0.001])], ['durationMs' => $n * 100.0]);
        }

        $overview = AgentRows::statements(fn () => overviewSummaryAt($this));
        $usage = AgentRows::statements(fn () => usageAt($this));

        // The grouped read and the percentile; the usage adds its coverage.
        expect($overview)->toHaveCount(2)->and($usage)->toHaveCount(3)
            ->and(usageAt($this)['data']['summary']['duration']['p95_ms'])->toBe(1900);
    });

    it('reads two statements on an empty database', function () {
        expect(AgentRows::statements(fn () => usageAt($this)))->toHaveCount(2);
    });
});

describe('errors', function () {
    it('answers the 422 of the overview for a range over 92 days', function () {
        $usage = $this->getJson('/trail/api/usage?from=2025-01-01T00:00:00Z&to=2026-01-02T00:00:00Z');
        $overview = $this->getJson('/trail/api/overview?from=2025-01-01T00:00:00Z&to=2026-01-02T00:00:00Z');

        $usage->assertUnprocessable()->assertJsonValidationErrors(['from']);

        expect($usage->json())->toBe($overview->json())
            ->and($usage->json('errors.from'))->toBe(['The range is too long: at most 92 days.']);
    });

    it('is exactly 92 days at most', function () {
        usageAt($this, 'from=2025-10-02T12:00:00Z&to=2026-01-02T12:00:00Z');

        $this->getJson('/trail/api/usage?from=2025-10-02T11:00:00Z&to=2026-01-02T12:00:00Z')->assertUnprocessable();
    });

    it('answers a 422 for a bad range', function (string $query, string $field) {
        $this->getJson('/trail/api/usage?'.$query)->assertUnprocessable()->assertJsonValidationErrors([$field]);
    })->with([
        ['range=bad', 'range'],
        ['range=24h&from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z', 'range'],
        ['to=2026-01-02T00:00:00Z', 'from'],
        ['from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z', 'from'],
        ['from=yesterday&to=today', 'from'],
    ]);

    it('ignores every other parameter', function () {
        UsageRows::dataset();

        expect(usageAt($this, 'by=bad&sort=bad&page=0&per_page=ten&search=x'))->toBe(usageAt($this));
    });
});

describe('access', function () {
    it('answers a denied request with a JSON 403', function () {
        $this->app['env'] = 'production';

        $this->get('/trail/api/usage', ['Accept' => 'text/html'])->assertForbidden()->assertJsonStructure(['message']);

        Trail::auth(fn () => true);
        $this->get('/trail/api/usage', ['Accept' => 'text/html'])->assertOk();

        Trail::auth(fn () => false);
        $this->get('/trail/api/usage', ['Accept' => 'text/html'])->assertForbidden();
    });

    it('answers a JSON 404 when the dashboard is switched off', function () {
        config(['trail.dashboard.enabled' => false]);

        $this->get('/trail/api/usage', ['Accept' => 'text/html'])->assertNotFound()->assertJsonStructure(['message']);
    });

    it('answers a JSON 422 for a bad range even when HTML is asked for', function () {
        $this->get('/trail/api/usage?range=bad', ['Accept' => 'text/html'])->assertUnprocessable()->assertJsonValidationErrors(['range']);
    });
});
