<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Http\Resources\Csv;
use Astro\Trail\Queries\UsageQuery;
use Astro\Trail\Tests\Fixtures\Http\UsageRows;
use Illuminate\Auth\GenericUser;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:00:00');
});

afterEach(function () {
    Carbon::setTestNow();
    $this->app['env'] = 'testing';
});

const USAGE_EXPORT_FIGURES = [
    'runs', 'steps', 'usage_state', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'total_tokens',
    'cost_state', 'estimated_cost_usd', 'reported_steps', 'unpriced_steps', 'unpriced_tokens',
];

/**
 * The export of a request, parsed: the header, the rows keyed by column, and the lines as they were written.
 *
 * @return array{header: list<string>, rows: list<array<string, string>>, lines: list<string>, content: string, response: TestResponse<Response>}
 */
function usageExportAt(mixed $test, string $query = ''): array
{
    $response = $test->get('/trail/api/usage/export'.($query === '' ? '' : '?'.$query));
    $response->assertOk();

    $content = $response->streamedContent();
    expect($content)->toStartWith(Csv::BYTE_ORDER_MARK);

    $body = substr($content, strlen(Csv::BYTE_ORDER_MARK));
    $stream = fopen('php://memory', 'w+');
    fwrite($stream, $body);
    rewind($stream);

    $parsed = [];

    while (($line = fgetcsv($stream, null, ',', '"', '')) !== false) {
        $parsed[] = $line;
    }

    fclose($stream);

    $header = array_shift($parsed);

    return [
        'header' => $header,
        'rows' => array_map(fn (array $line) => array_combine($header, $line), $parsed),
        'lines' => $body === '' ? [] : explode("\r\n", substr($body, 0, -2)),
        'content' => $content,
        'response' => $response,
    ];
}

/**
 * @return array<string, mixed>
 */
function usageExportJsonAt(mixed $test, string $query = ''): array
{
    return $test->getJson('/trail/api/usage/breakdown?'.$query.($query === '' ? '' : '&').'per_page=100')->assertOk()->json();
}

/**
 * A row of the breakdown, flattened to the columns of the file.
 *
 * @param  array<string, mixed>  $row
 * @return array<string, mixed>
 */
function usageExportFlatten(array $row): array
{
    return [
        ...array_intersect_key($row, ['provider' => 0, 'model' => 0, 'agent' => 0]),
        'runs' => $row['runs'], 'steps' => $row['steps'], 'usage_state' => $row['usage']['state'],
        'input_tokens' => $row['usage']['input_tokens'], 'output_tokens' => $row['usage']['output_tokens'],
        'cache_read_tokens' => $row['usage']['cache_read_tokens'], 'cache_write_tokens' => $row['usage']['cache_write_tokens'],
        'reasoning_tokens' => $row['usage']['reasoning_tokens'], 'total_tokens' => $row['usage']['total_tokens'],
        'cost_state' => $row['cost']['state'], 'estimated_cost_usd' => $row['cost']['amount'],
        'reported_steps' => $row['coverage']['reported_steps'], 'unpriced_steps' => $row['coverage']['unpriced_steps'],
        'unpriced_tokens' => $row['coverage']['unpriced_tokens'],
    ];
}

/** What a cell must hold for a value of the breakdown (names here never start like a formula). */
function usageExportCell(mixed $value): string
{
    return match (true) {
        $value === null => '',
        is_int($value) => (string) $value,
        is_float($value) => rtrim(rtrim(number_format($value, 10, '.', ''), '0'), '.') ?: '0',
        default => (string) $value,
    };
}

/** A step of a model, priced as recorded. */
function usageExportStep(string $provider, string $model, array $attributes = []): array
{
    return UsageRows::step($provider, $model, ['inputTokens' => 10, 'outputTokens' => 5, 'cost' => 0.5, ...$attributes]);
}

describe('against the breakdown', function () {
    beforeEach(fn () => UsageRows::dataset());

    it('has the header of its view', function (string $by, array $keys) {
        expect(usageExportAt($this, "by={$by}")['header'])->toBe([...$keys, ...USAGE_EXPORT_FIGURES]);
    })->with([
        'model' => ['model', ['provider', 'model']],
        'provider' => ['provider', ['provider']],
        'agent' => ['agent', ['agent']],
    ]);

    it('defaults to the models', function () {
        expect(usageExportAt($this)['header'])->toBe(['provider', 'model', ...USAGE_EXPORT_FIGURES]);
    });

    it('writes the rows of the breakdown, in its order, with its values', function (string $query) {
        $json = usageExportJsonAt($this, $query)['data'];
        $export = usageExportAt($this, $query)['rows'];

        expect($json)->not->toBeEmpty()->and($export)->toHaveCount(count($json));

        foreach ($json as $position => $row) {
            foreach (usageExportFlatten($row) as $column => $value) {
                expect($export[$position][$column])->toBe(usageExportCell($value), "{$query}: row {$position} {$column}");
            }

            expect(array_keys($export[$position]))->toBe(array_keys(usageExportFlatten($row)));
        }
    })->with([
        'models' => 'by=model',
        'models by amount' => 'by=model&sort=cost',
        'models by tokens' => 'by=model&sort=-tokens',
        'models by name' => 'by=model&sort=name',
        'models by runs' => 'by=model&sort=runs',
        'providers' => 'by=provider',
        'providers by name' => 'by=provider&sort=-name',
        'agents' => 'by=agent',
        'agents by tokens' => 'by=agent&sort=tokens',
        'a range' => 'by=model&from=2026-01-02T09:00:00Z&to=2026-01-02T11:00:00Z',
        'a preset' => 'by=agent&range=1h',
    ]);

    it('writes the models, row by row, as written by hand', function () {
        $lines = usageExportAt($this)['lines'];

        expect($lines)->toBe([
            'provider,model,runs,steps,usage_state,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,reasoning_tokens,total_tokens,cost_state,estimated_cost_usd,reported_steps,unpriced_steps,unpriced_tokens',
            // Still running: pending, and the amount is what has been recorded so far.
            'openai,gpt-5,3,5,pending,311,61,20,7,5,372,pending,0.0311,4,0,0',
            'anthropic,claude-sonnet,3,3,reported,57,5,,,,62,partial,0.007,3,1,55',
            'openai,edge-in,1,1,reported,2,,,,,2,estimated,0.0002,1,0,0',
            'openai,text-embedding-3-small,1,1,reported,7,,,,,7,estimated,0.0001,1,0,0',
            // A rate of 0 is a price: a real zero, not an empty cell.
            'openai,free-model,1,1,reported,1000,100,,,,1100,estimated,0,1,0,0',
            // Cache and reasoning tokens only: no total, no amount, and the unpriced tokens are unknown.
            'openai,o3,1,1,reported,,,5,,30,,unpriced,,1,1,',
            'openai,gpt-5-mini,2,2,reported,,40,,,,40,unpriced,,1,1,40',
            'anthropic,claude-opus,1,0,not_reported,,,,,,,not_captured,,0,0,0',
        ]);
    });

    it('writes the providers and the agents as written by hand', function () {
        $providers = usageExportAt($this, 'by=provider')['lines'];
        $agents = usageExportAt($this, 'by=agent')['lines'];

        expect($providers)->toHaveCount(4)
            ->and($providers[1])->toBe('openai,7,11,pending,1320,201,25,7,35,1521,pending,0.0314,9,2,40')
            ->and($providers[2])->toBe('anthropic,4,3,reported,57,5,,,,62,partial,0.007,3,1,55')
            ->and($providers[3])->toBe('acme,1,1,reported,6,,,,,6,unpriced,,1,1,6')
            ->and($agents)->toHaveCount(12)
            ->and($agents[0])->toBe('agent,runs,steps,usage_state,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,reasoning_tokens,total_tokens,cost_state,estimated_cost_usd,reported_steps,unpriced_steps,unpriced_tokens')
            ->and($agents[1])->toBe('Alpha,2,6,pending,360,66,20,3,2,426,pending,0.031,4,1,55')
            ->and($agents[8])->toBe('Streamer,1,1,reported,,40,,,,40,unpriced,,1,1,40')
            ->and($agents[9])->toBe('Reasoner,1,1,reported,,,5,,30,,unpriced,,1,1,')
            ->and($agents[10])->toBe('Bare,1,0,not_reported,,,,,,,not_captured,,0,0,0');
    });

    it('honours the sort: two sorts, two orders', function () {
        $byName = array_column(usageExportAt($this, 'sort=name')['rows'], 'model');
        $byRuns = array_column(usageExportAt($this, 'sort=-runs')['rows'], 'model');

        expect($byName)->toBe(['claude-opus', 'claude-sonnet', 'edge-in', 'free-model', 'gpt-5', 'gpt-5-mini', 'o3', 'text-embedding-3-small'])
            ->and($byRuns)->toBe(['gpt-5', 'claude-sonnet', 'gpt-5-mini', 'text-embedding-3-small', 'o3', 'free-model', 'edge-in', 'claude-opus']);
    });

    it('ignores page and per_page', function () {
        $all = usageExportAt($this, 'by=agent')['rows'];

        expect($all)->toHaveCount(11)
            ->and(usageExportAt($this, 'by=agent&page=3&per_page=2')['rows'])->toBe($all)
            ->and(usageExportAt($this, 'by=agent&per_page=1')['rows'])->toBe($all);
    });

    it('says in headers how many rows it wrote out of how many groups', function () {
        $response = usageExportAt($this, 'by=agent&per_page=2')['response'];

        $response->assertHeader('X-Trail-Export-Rows', '11')
            ->assertHeader('X-Trail-Export-Total', '11')
            ->assertHeader('X-Trail-Export-Truncated', 'false');
    });
});

describe('what was not captured', function () {
    it('writes an empty cell, never 0, for what no step reported', function () {
        UsageRows::run('Agent', '2026-01-02 10:00:00', [
            usageExportStep('acme', 'full', ['cacheReadTokens' => 3, 'cacheWriteTokens' => 4, 'reasoningTokens' => 6]),
            UsageRows::step('acme', 'bare'),
            UsageRows::step('acme', 'unpriced', ['inputTokens' => 10]),
        ]);

        $rows = array_column(usageExportAt($this)['rows'], null, 'model');

        expect($rows['full'])->toBe([
            'provider' => 'acme', 'model' => 'full', 'runs' => '1', 'steps' => '1', 'usage_state' => 'reported',
            'input_tokens' => '10', 'output_tokens' => '5', 'cache_read_tokens' => '3', 'cache_write_tokens' => '4', 'reasoning_tokens' => '6', 'total_tokens' => '15',
            'cost_state' => 'estimated', 'estimated_cost_usd' => '0.5', 'reported_steps' => '1', 'unpriced_steps' => '0', 'unpriced_tokens' => '0',
        ])
            ->and($rows['bare'])->toBe([
                'provider' => 'acme', 'model' => 'bare', 'runs' => '1', 'steps' => '1', 'usage_state' => 'not_reported',
                'input_tokens' => '', 'output_tokens' => '', 'cache_read_tokens' => '', 'cache_write_tokens' => '', 'reasoning_tokens' => '', 'total_tokens' => '',
                'cost_state' => 'not_captured', 'estimated_cost_usd' => '', 'reported_steps' => '0', 'unpriced_steps' => '0', 'unpriced_tokens' => '0',
            ])
            ->and($rows['unpriced']['cost_state'])->toBe('unpriced')
            ->and($rows['unpriced']['estimated_cost_usd'])->toBe('')
            ->and($rows['unpriced']['unpriced_tokens'])->toBe('10')
            ->and($rows['unpriced']['output_tokens'])->toBe('');
    });

    it('writes the amount of the priced part of a partly priced row, and a zero rate as 0', function () {
        UsageRows::run('Agent', '2026-01-02 10:00:00', [
            usageExportStep('acme', 'mixed', ['cost' => 0.25]),
            UsageRows::step('acme', 'mixed', ['inputTokens' => 7]),
            usageExportStep('acme', 'free', ['cost' => 0.0]),
        ]);

        $rows = array_column(usageExportAt($this)['rows'], null, 'model');

        expect($rows['mixed']['cost_state'])->toBe('partial')
            ->and($rows['mixed']['estimated_cost_usd'])->toBe('0.25')
            ->and($rows['mixed']['unpriced_steps'])->toBe('1')
            ->and($rows['mixed']['unpriced_tokens'])->toBe('7')
            ->and($rows['free']['cost_state'])->toBe('estimated')
            ->and($rows['free']['estimated_cost_usd'])->toBe('0');
    });

    it('writes what has been recorded so far for a pending row', function () {
        UsageRows::run('Agent', '2026-01-02 11:30:00', [usageExportStep('acme', 'live', ['cost' => 0.125, 'status' => Status::Running])], ['status' => Status::Running]);

        $row = usageExportAt($this)['rows'][0];

        expect($row['usage_state'])->toBe('pending')
            ->and($row['cost_state'])->toBe('pending')
            ->and($row['estimated_cost_usd'])->toBe('0.125');
    });

    it('writes an unpriced amount of a model without a cost as empty even when tokens were reported', function () {
        UsageRows::run('Agent', '2026-01-02 10:00:00', [UsageRows::step('acme', 'mystery', ['inputTokens' => 9, 'outputTokens' => 1])]);

        $row = usageExportAt($this)['rows'][0];

        expect($row['cost_state'])->toBe('unpriced')
            ->and($row['estimated_cost_usd'])->toBe('')
            ->and($row['total_tokens'])->toBe('10');
    });
});

describe('amounts', function () {
    it('writes a tiny amount and a large one as plain decimals', function () {
        UsageRows::run('Agent', '2026-01-02 10:00:00', [
            usageExportStep('acme', 'tiny', ['cost' => 0.0000000001]),
            usageExportStep('acme', 'ten', ['cost' => 0.1234567891]),
            usageExportStep('acme', 'large', ['cost' => 98765.4321098765]),
        ]);

        $export = usageExportAt($this);
        $rows = array_column($export['rows'], null, 'model');

        expect($rows['tiny']['estimated_cost_usd'])->toBe('0.0000000001')
            ->and($rows['ten']['estimated_cost_usd'])->toBe('0.1234567891')
            ->and($rows['large']['estimated_cost_usd'])->toBe('98765.4321098765')
            ->and($export['content'])->not->toContain('E-')->not->toContain('E+');
    });
});

describe('escaping', function () {
    it('quotes names with a comma, a quote or a line break, and gets them back through the parser', function () {
        $names = ['comma' => 'a, b', 'quote' => 'say "hi"', 'newline' => "line one\nline two", 'crlf' => "one\r\ntwo", 'unicode' => 'Zoë 日本語'];

        foreach ($names as $name) {
            UsageRows::run('Agent '.$name, '2026-01-02 10:00:00', [usageExportStep($name, $name)]);
        }

        foreach (['model', 'provider', 'agent'] as $by) {
            $export = usageExportAt($this, "by={$by}");
            $column = $by === 'agent' ? 'agent' : $by;
            $written = array_column($export['rows'], $column);

            expect($written)->toHaveCount(count($names));

            foreach ($names as $name) {
                expect($written)->toContain($by === 'agent' ? 'Agent '.$name : $name);
            }
        }

        $content = usageExportAt($this)['content'];

        expect($content)->toContain('"a, b"')->toContain('"say ""hi"""')->toContain("\"line one\nline two\"");
    });

    it('prefixes a name a spreadsheet would run as a formula', function (string $name) {
        UsageRows::run($name, '2026-01-02 10:00:00', [usageExportStep($name, $name)]);
        UsageRows::run('Plain', '2026-01-02 10:00:00', [usageExportStep('safe', 'safe')]);

        foreach (['model', 'provider', 'agent'] as $by) {
            $column = $by;
            $names = array_column(usageExportAt($this, "by={$by}")['rows'], $column);

            expect($names)->toContain("'".$name)->and($names)->not->toContain($name);
        }

        $rows = array_column(usageExportAt($this)['rows'], null, 'model');

        expect($rows["'".$name]['provider'])->toBe("'".$name)
            ->and($rows['safe']['provider'])->toBe('safe');
    })->with([
        'equals' => '=1+1', 'plus' => '+1', 'minus' => '-1', 'at' => '@SUM(A1)', 'tab' => "\tcell", 'line feed' => "\ncell",
        'space then equals' => ' =1+1', 'no-break space then at' => "\xC2\xA0@SUM(A1)", 'newline then minus' => "\r\n-1",
    ]);

    it('never prefixes a number', function () {
        UsageRows::dataset();

        $numbers = ['runs', 'steps', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'total_tokens', 'estimated_cost_usd', 'reported_steps', 'unpriced_steps', 'unpriced_tokens'];
        $checked = 0;

        foreach (usageExportAt($this)['rows'] as $row) {
            foreach ($numbers as $column) {
                expect($row[$column])->not->toStartWith("'")->not->toStartWith('-');
                $checked++;
            }
        }

        expect($checked)->toBe(8 * count($numbers));
    });
});

describe('the file', function () {
    it('starts with one byte-order mark and ends every line with CRLF', function () {
        UsageRows::run('Agent', '2026-01-02 10:00:00', [usageExportStep('acme', "multi\nline")]);

        $content = usageExportAt($this)['content'];

        expect(substr_count($content, Csv::BYTE_ORDER_MARK))->toBe(1)
            ->and($content)->toEndWith("\r\n")
            ->and(preg_match_all('/(?<!\r)\n/', str_replace("\"multi\nline\"", '', $content)))->toBe(0);
    });

    it('sends a CSV attachment with the headers of a file', function (string $by) {
        UsageRows::dataset();

        $response = usageExportAt($this, "by={$by}")['response'];

        expect($response->headers->get('Content-Type'))->toBe('text/csv; charset=UTF-8')
            ->and($response->headers->get('Content-Disposition'))->toBe("attachment; filename=\"trail-usage-{$by}-20260102-120000.csv\"")
            ->and($response->headers->get('Cache-Control'))->toContain('no-store')
            ->and($response->headers->get('X-Content-Type-Options'))->toBe('nosniff')
            ->and($response->headers->get('X-Accel-Buffering'))->toBe('no');
    })->with(['model', 'provider', 'agent']);

    it('answers an empty view with the header row alone', function (string $by, string $header) {
        $export = usageExportAt($this, "by={$by}");

        expect($export['rows'])->toBe([])
            ->and($export['content'])->toBe(Csv::BYTE_ORDER_MARK.$header."\r\n");

        $export['response']->assertHeader('X-Trail-Export-Rows', '0')->assertHeader('X-Trail-Export-Total', '0')->assertHeader('X-Trail-Export-Truncated', 'false');
    })->with([
        'model' => ['model', 'provider,model,'.implode(',', USAGE_EXPORT_FIGURES)],
        'provider' => ['provider', 'provider,'.implode(',', USAGE_EXPORT_FIGURES)],
        'agent' => ['agent', 'agent,'.implode(',', USAGE_EXPORT_FIGURES)],
    ]);

    it('is not read as anything else by the routes beside it', function () {
        UsageRows::dataset();

        expect(usageExportAt($this)['response']->headers->get('Content-Type'))->toBe('text/csv; charset=UTF-8');
        $this->getJson('/trail/api/usage')->assertOk()->assertJsonStructure(['data' => ['summary']]);
        $this->getJson('/trail/api/usage/breakdown')->assertOk()->assertJsonStructure(['data', 'pagination']);
    });
});

describe('the row limit', function () {
    it('writes the groups the breakdown reads and says it cut the rest', function (string $by, string $column, int $limit, array $names) {
        $this->app->bind(UsageQuery::class, fn () => new UsageQuery($limit));
        UsageRows::dataset();

        $export = usageExportAt($this, "by={$by}&sort=name");

        expect(array_column($export['rows'], $column))->toBe($names);
        $export['response']->assertHeader('X-Trail-Export-Rows', (string) $limit)
            ->assertHeader('X-Trail-Export-Total', (string) $limit)
            ->assertHeader('X-Trail-Export-Truncated', 'true');
    })->with([
        'models' => ['model', 'model', 4, ['claude-opus', 'claude-sonnet', 'gpt-5', 'gpt-5-mini']],
        'providers' => ['provider', 'provider', 2, ['anthropic', 'openai']],
        'agents' => ['agent', 'agent', 3, ['Alpha', 'Askonly', 'Bare']],
    ]);

    it('is not truncated when the groups fill the limit exactly, and truncated one over', function () {
        UsageRows::dataset();

        $this->app->bind(UsageQuery::class, fn () => new UsageQuery(8));
        usageExportAt($this)['response']->assertHeader('X-Trail-Export-Rows', '8')->assertHeader('X-Trail-Export-Truncated', 'false');

        $this->app->bind(UsageQuery::class, fn () => new UsageQuery(7));
        usageExportAt($this)['response']->assertHeader('X-Trail-Export-Rows', '7')->assertHeader('X-Trail-Export-Truncated', 'true');
    });

    it('writes more rows than a page holds', function () {
        foreach (range(1, 130) as $number) {
            UsageRows::run('Agent', '2026-01-02 10:00:00', [usageExportStep('acme', sprintf('model-%03d', $number), ['cost' => $number / 100])]);
        }

        $export = usageExportAt($this, 'sort=name');

        expect($export['rows'])->toHaveCount(130)
            ->and($export['rows'][129]['model'])->toBe('model-130');
        $export['response']->assertHeader('X-Trail-Export-Rows', '130')->assertHeader('X-Trail-Export-Truncated', 'false');
    });
});

describe('access', function () {
    it('answers 403 as JSON outside the local environment without a gate', function () {
        $this->app['env'] = 'production';

        $this->get('/trail/api/usage/export')->assertForbidden()->assertJsonStructure(['message']);
    });

    it('answers 404 as JSON when the dashboard is switched off', function () {
        config(['trail.dashboard.enabled' => false]);

        $this->get('/trail/api/usage/export')->assertNotFound()->assertJsonStructure(['message']);
    });

    it('answers a bad parameter with the 422 JSON and no CSV', function (string $query, string $field) {
        UsageRows::dataset();

        $response = $this->get('/trail/api/usage/export?'.$query);

        $response->assertUnprocessable()->assertJsonValidationErrors($field);
        expect($response->headers->get('Content-Type'))->toContain('application/json')
            ->and($response->headers->has('X-Trail-Export-Rows'))->toBeFalse()
            ->and($response->getContent())->not->toContain(Csv::BYTE_ORDER_MARK);
    })->with([
        'a view' => ['by=nonsense', 'by'],
        'a sort' => ['sort=nonsense', 'sort'],
        'a range' => ['range=2y', 'range'],
        'a range given twice' => ['range=1h&from=2026-01-02T00:00:00Z', 'range'],
    ]);

    it('sends the file outside the local environment to a user the gate allows', function () {
        $this->app['env'] = 'production';
        Gate::define('viewTrail', fn ($user) => $user->email === 'ada@example.com');
        UsageRows::dataset();

        $this->get('/trail/api/usage/export')->assertForbidden();

        $response = $this->actingAs(new GenericUser(['id' => 1, 'email' => 'ada@example.com']))->get('/trail/api/usage/export');
        $content = $response->streamedContent();

        $response->assertOk();
        expect($response->headers->get('Content-Type'))->toBe('text/csv; charset=UTF-8')
            ->and($content)->toContain('gpt-5');

        // Rolling back this test's migrations asks for confirmation in production.
        $this->app['env'] = 'testing';
    });
});
