<?php

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Models\User;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Outcome;
use Workbench\App\Scenarios\Registry;
use Workbench\App\Scenarios\Scenario;
use Workbench\App\Scenarios\ScenarioRunner;
use Workbench\App\Tools\CarrierUnavailable;

/*
|--------------------------------------------------------------------------
| The workbench's scenarios
|--------------------------------------------------------------------------
|
| Each scenario runs a real agent through the real SDK, with only the provider's HTTP
| API scripted, so whatever is in the database was recorded by Trail's listeners. Every
| scenario is asserted on the one fact that tells it apart from the others.
|
*/

/** The types of the spans of a trace, in the order they started. */
function spanTypes(Trace $trace): array
{
    return $trace->spans()->orderBy('sequence')->get()->map(fn (Span $span) => $span->type->value)->all();
}

/** What each scenario must have recorded: [outcome, the checks on the traces and their number]. */
function expectations(): array
{
    return [
        'plain-answer' => [Outcome::Ok, 1, function (Collection $traces) {
            $trace = $traces->sole();

            expect($trace->status)->toBe(Status::Completed)
                ->and(spanTypes($trace))->toBe(['agent', 'step'])
                ->and([$trace->input_tokens, $trace->output_tokens])->toBe([412, 38])
                ->and($trace->cost)->toBeGreaterThan(0.0);
        }],
        'tool-calls' => [Outcome::Ok, 1, function (Collection $traces) {
            $trace = $traces->sole();

            expect($trace->status)->toBe(Status::Completed)
                ->and(spanTypes($trace))->toBe(['agent', 'step', 'tool', 'step'])
                ->and($trace->spans()->where('type', SpanType::Tool)->sole()->name)->toBe('lookup_order');
        }],
        'several-steps' => [Outcome::Ok, 1, function (Collection $traces) {
            $trace = $traces->sole();

            expect($trace->status)->toBe(Status::Completed)
                ->and(spanTypes($trace))->toBe(['agent', 'step', 'tool', 'step', 'tool', 'step']);
        }],
        'delegation' => [Outcome::Ok, 1, function (Collection $traces) {
            $trace = $traces->sole();
            $tool = $trace->spans()->where('type', SpanType::Tool)->sole();
            $agents = $trace->spans()->where('type', SpanType::Agent)->orderBy('sequence')->get();

            expect($trace->status)->toBe(Status::Completed)
                ->and($trace->child_failed)->toBeFalse()
                ->and($agents)->toHaveCount(2)
                ->and($agents[1]->name)->toBe('PolicyResearcher')
                ->and($agents[1]->parent_id)->toBe($tool->id);
        }],
        'failing-sub-agent' => [Outcome::Ok, 1, function (Collection $traces) {
            $trace = $traces->sole();
            $child = $trace->spans()->where('type', SpanType::Agent)->where('name', 'PolicyResearcher')->sole();

            expect($trace->status)->toBe(Status::Completed)
                ->and($trace->child_failed)->toBeTrue()
                ->and($child->status)->toBe(Status::Failed);
        }],
        'throwing-tool' => [Outcome::FailedAsExpected, 1, function (Collection $traces) {
            $trace = $traces->sole();

            expect($trace->status)->toBe(Status::Failed)
                ->and($trace->issue_kind)->toBe(IssueKind::ToolError)
                ->and($trace->error_class)->toBe(CarrierUnavailable::class)
                ->and($trace->spans()->where('type', SpanType::Tool)->sole()->status)->toBe(Status::Failed);
        }],
        'provider-failure' => [Outcome::FailedAsExpected, 1, function (Collection $traces) {
            $trace = $traces->sole();

            expect($trace->status)->toBe(Status::Failed)
                ->and($trace->issue_kind)->toBe(IssueKind::RateLimited)
                ->and($trace->error_http_status)->toBe(429)
                ->and($trace->input_tokens)->toBeNull()
                ->and($trace->cost)->toBeNull();
        }],
        'failover' => [Outcome::Ok, 1, function (Collection $traces) {
            $trace = $traces->sole();
            $steps = $trace->spans()->where('type', SpanType::Step)->orderBy('sequence')->get();

            expect($trace->status)->toBe(Status::Completed)
                ->and($trace->recovered)->toBeTrue()
                ->and($steps->map(fn (Span $step) => [$step->attempt, $step->status])->all())->toBe([[1, Status::Failed], [2, Status::Completed]]);
        }],
        'streamed-run' => [Outcome::Ok, 1, function (Collection $traces) {
            $trace = $traces->sole();

            expect($trace->status)->toBe(Status::Completed)
                ->and($trace->streamed)->toBeTrue();
        }],
        'structured-output' => [Outcome::Ok, 1, function (Collection $traces) {
            $trace = $traces->sole();

            expect($trace->status)->toBe(Status::Completed)
                ->and($trace->agent_class)->toBe('Workbench\App\Agents\TicketTriage')
                ->and($trace->response_excerpt)->toContain('"category":"returns"');
        }],
        'approval-gated-tool' => [Outcome::Ok, 1, function (Collection $traces) {
            $trace = $traces->sole();

            expect($trace->status)->toBe(Status::AwaitingApproval)
                ->and($trace->metadata['pending_approvals'][0]['tool'])->toBe('issue_refund');
        }],
        'conversation' => [Outcome::Ok, 2, function (Collection $traces) {
            $customer = User::query()->where('email', 'priya@northwind.test')->sole();

            expect($traces->pluck('conversation_id')->unique()->all())->toHaveCount(1)->not->toContain(null)
                ->and($traces->pluck('user_id')->unique()->all())->toBe([(string) $customer->getKey()])
                ->and($traces->pluck('user_type')->unique()->all())->toBe([User::class]);
        }],
        'embeddings-in-tool' => [Outcome::Ok, 1, function (Collection $traces) {
            $trace = $traces->sole();
            $tool = $trace->spans()->where('type', SpanType::Tool)->sole();
            $embedding = $trace->spans()->where('type', SpanType::Embedding)->sole();

            expect($trace->status)->toBe(Status::Completed)
                ->and($embedding->parent_id)->toBe($tool->id)
                ->and([$embedding->provider, $embedding->model])->toBe(['openai', 'text-embedding-3-small'])
                ->and($embedding->input_tokens)->toBeGreaterThan(0)
                ->and($embedding->cost)->not->toBeNull();
        }],
    ];
}

it('has a scenario for each of the thirteen runs', function () {
    expect(array_keys(app(Registry::class)->all()))->toBe(array_keys(expectations()));
});

it('records the run of the scenario', function (string $key) {
    [$outcome, $traceCount, $check] = expectations()[$key];

    $result = app(ScenarioRunner::class)->run(app(Registry::class)->get($key));

    expect($result->outcome)->toBe($outcome, $result->message)
        ->and($result->mode)->toBe('offline');

    $traces = Trace::query()->orderBy('started_at')->get();

    expect($traces)->toHaveCount($traceCount);
    $check($traces);
})->with(fn () => array_keys(expectations()));

it('runs every scenario one after the other in one process', function () {
    $results = app(ScenarioRunner::class)->runAll();

    expect($results)->toHaveCount(13)
        ->and(array_filter($results, fn ($result) => $result->outcome === Outcome::Error))->toBe([])
        ->and(Trace::query()->count())->toBe(14);
});

it('leaves the HTTP client and its script as it found them', function () {
    $before = Http::getFacadeRoot();

    app(ScenarioRunner::class)->run(app(Registry::class)->get('plain-answer'));

    expect(Http::getFacadeRoot())->toBe($before)->toBeInstanceOf(Factory::class)
        ->and(app()->bound(FakeAnthropic::class))->toBeFalse();
});

it('fails a scenario that does not use everything it scripted', function () {
    $scenario = new class extends Scenario
    {
        protected string $title = 'Leftover';

        protected string $description = 'Scripts two responses and asks for one.';

        public function key(): string
        {
            return 'leftover';
        }

        public function run(Backend $backend): void
        {
            $backend->script([FakeAnthropic::text('One'), FakeAnthropic::text('Two')]);

            (new SupportAssistant)->prompt('Hi');
        }
    };

    $result = app(ScenarioRunner::class)->run($scenario);

    expect($result->outcome)->toBe(Outcome::Error)
        ->and($result->message)->toContain('never requested');
});

describe('the landing page', function () {
    it('lists the scenarios, the mode and the number of recorded traces', function () {
        $response = $this->get('/')->assertOk()->assertSee('offline');

        foreach (app(Registry::class)->all() as $scenario) {
            $response->assertSee($scenario->title())->assertSee($scenario->key());
        }

        $response->assertSee('Recorded traces')->assertSee('Run all')->assertSee('href="'.route('trail.dashboard').'"', false);
    });

    it('runs one scenario when its button is pressed, and shows the result and the trace', function () {
        $this->post('/run/plain-answer')->assertRedirect('/');

        expect(Trace::query()->count())->toBe(1);

        $this->get('/')->assertOk()->assertSee('plain-answer')->assertSee('Recorded.');
    });

    it('runs every scenario with Run all', function () {
        $this->post('/run')->assertRedirect('/');

        expect(Trace::query()->count())->toBe(14);
    });

    it('answers 404 for a scenario that does not exist', function () {
        $this->post('/run/nothing-of-the-sort')->assertNotFound();

        expect(Trace::query()->count())->toBe(0);
    });
});

it('only answers requests from the machine it runs on', function () {
    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])->get('/')->assertForbidden();
    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])->post('/run')->assertForbidden();

    expect(Trace::query()->count())->toBe(0);
});
