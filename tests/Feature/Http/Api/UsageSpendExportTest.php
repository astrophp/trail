<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Http\Resources\Csv;
use Astro\Trail\Tests\Fixtures\Http\UsageRows;
use Illuminate\Auth\GenericUser;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;

/*
 * The clock is fixed at 12:30 on 2 January 2026 unless a test sets another. Prices (USD per million tokens):
 * alpha is input 2 and output 10, so a step of the helper below (1,000,000 input and 100,000 output tokens)
 * costs 3, and its recorded cost is 3 as well. The "big" step is 100,000,000 input tokens: 200.
 */
beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:30:00');
    config(['trail.pricing' => ['acme' => ['alpha' => ['input' => 2.0, 'output' => 10.0]]]]);
});

afterEach(function () {
    Carbon::setTestNow();
    $this->app['env'] = 'testing';
});

const SPEND_EXPORT_HEADER = [
    'kind', 'from', 'to', 'bucket', 'full', 'in_progress', 'runs', 'cost_state', 'estimated_cost_usd',
    'cumulative_state', 'cumulative_estimated_cost_usd', 'projected_usd', 'projected_line_usd',
];

/**
 * The export of a request, parsed: the header and the rows keyed by column, the lines as they were written.
 *
 * @return array{header: list<string>, rows: list<array<string, string>>, lines: list<string>, content: string, response: TestResponse<Response>}
 */
function spendExportAt(mixed $test, string $query = ''): array
{
    $response = $test->get('/trail/api/usage/spend/export'.($query === '' ? '' : '?'.$query));
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

    expect($header)->toBe(SPEND_EXPORT_HEADER);

    return [
        'header' => $header,
        'rows' => array_map(fn (array $line) => array_combine($header, $line), $parsed),
        'lines' => explode("\r\n", substr($body, 0, -2)),
        'content' => $content,
        'response' => $response,
    ];
}

/**
 * @return array<string, mixed>
 */
function spendExportJsonAt(mixed $test, string $query = ''): array
{
    return $test->getJson('/trail/api/usage/spend'.($query === '' ? '' : '?'.$query))->assertOk()->json('data');
}

/** What a cell must hold for a value of the JSON. */
function spendExportCell(mixed $value): string
{
    return match (true) {
        $value === null => '',
        is_bool($value) => $value ? 'true' : 'false',
        is_int($value) => (string) $value,
        is_float($value) => rtrim(rtrim(number_format($value, 10, '.', ''), '0'), '.') ?: '0',
        default => (string) $value,
    };
}

/** @return array<string, mixed> */
function spendExportStep(array $attributes = []): array
{
    return UsageRows::step('acme', 'alpha', ['inputTokens' => 1_000_000, 'outputTokens' => 100_000, 'cost' => 3.0, ...$attributes]);
}

function spendExportBigStep(): array
{
    return UsageRows::step('acme', 'alpha', ['inputTokens' => 100_000_000, 'outputTokens' => 0, 'cost' => 200.0]);
}

/**
 * @param  list<array<string, mixed>>  $steps
 * @param  array<string, mixed>  $trace
 */
function spendExportRun(string $started, array $steps, array $trace = []): string
{
    return UsageRows::run('Agent', $started, $steps, $trace);
}

/** A day of usage for a 24h range read at 12:30: a projection of 2.5 an hour from the last six complete hours. */
function spendExportDay(): void
{
    spendExportRun('2026-01-01 12:40:00', [spendExportBigStep()]);
    spendExportRun('2026-01-02 06:10:00', [spendExportStep()]);
    spendExportRun('2026-01-02 08:20:00', [spendExportStep(), spendExportStep()]);
    spendExportRun('2026-01-02 09:30:00', [spendExportStep()]);
    spendExportRun('2026-01-02 11:45:00', [spendExportStep()]);
    spendExportRun('2026-01-02 12:10:00', [spendExportBigStep()]);
}

describe('the recorded series', function () {
    it('writes the buckets of the series, in order, with the values of the JSON', function (string $query) {
        spendExportDay();

        $json = spendExportJsonAt($this, $query);
        $recorded = array_slice(spendExportAt($this, $query)['rows'], 0, count($json['series']['buckets']));

        expect($json['series']['buckets'])->not->toBeEmpty()->and($recorded)->toHaveCount(count($json['series']['buckets']));

        foreach ($json['series']['buckets'] as $position => $bucket) {
            $row = $recorded[$position];

            expect($row['kind'])->toBe('recorded')
                ->and($row['from'])->toBe($bucket['from'])
                ->and($row['to'])->toBe($bucket['to'])
                ->and($row['bucket'])->toBe($json['series']['bucket'])
                ->and($row['full'])->toBe(spendExportCell($bucket['full']))
                ->and($row['in_progress'])->toBe(spendExportCell($bucket['in_progress']))
                ->and($row['runs'])->toBe((string) $bucket['runs']['all'])
                ->and($row['cost_state'])->toBe($bucket['cost']['state'])
                ->and($row['estimated_cost_usd'])->toBe(spendExportCell($bucket['cost']['amount']))
                ->and($row['cumulative_state'])->toBe($bucket['cumulative']['state'])
                ->and($row['cumulative_estimated_cost_usd'])->toBe(spendExportCell($bucket['cumulative']['amount']));
        }
    })->with([
        'a day' => '',
        'a week' => 'range=7d',
        'an hour' => 'range=1h',
        'an explicit range' => 'from=2026-01-02T05:00:00Z&to=2026-01-02T12:30:00Z',
    ]);

    it('writes the buckets of a day as written by hand', function () {
        spendExportDay();

        $lines = spendExportAt($this)['lines'];

        expect($lines)->toHaveCount(1 + 25 + 24)
            ->and($lines[0])->toBe('kind,from,to,bucket,full,in_progress,runs,cost_state,estimated_cost_usd,cumulative_state,cumulative_estimated_cost_usd,projected_usd,projected_line_usd')
            // Cut by the start of the range: not full. It holds the big step of 200.
            ->and($lines[1])->toBe('recorded,2026-01-01T12:30:00.000Z,2026-01-01T13:00:00.000Z,hour,false,false,1,estimated,200,estimated,200,,')
            // No run: no amount, not 0, and the cumulative stays where it was.
            ->and($lines[2])->toBe('recorded,2026-01-01T13:00:00.000Z,2026-01-01T14:00:00.000Z,hour,true,false,0,not_captured,,estimated,200,,')
            ->and($lines[19])->toBe('recorded,2026-01-02T06:00:00.000Z,2026-01-02T07:00:00.000Z,hour,true,false,1,estimated,3,estimated,203,,')
            ->and($lines[21])->toBe('recorded,2026-01-02T08:00:00.000Z,2026-01-02T09:00:00.000Z,hour,true,false,1,estimated,6,estimated,209,,')
            // The bucket in progress is cut by the end of the range, which is now.
            ->and($lines[25])->toBe('recorded,2026-01-02T12:00:00.000Z,2026-01-02T12:30:00.000Z,hour,false,true,1,estimated,200,estimated,415,,');
    });

    it('flags the bucket in progress and the bucket the range cuts', function () {
        spendExportDay();

        $rows = spendExportAt($this)['rows'];
        $recorded = array_values(array_filter($rows, fn (array $row) => $row['kind'] === 'recorded'));

        expect($recorded)->toHaveCount(25)
            ->and($recorded[0]['full'])->toBe('false')
            ->and($recorded[1]['full'])->toBe('true')
            ->and($recorded[24]['in_progress'])->toBe('true')
            ->and(array_column(array_filter($recorded, fn (array $row) => $row['in_progress'] === 'true'), 'from'))->toBe(['2026-01-02T12:00:00.000Z'])
            ->and(array_column(array_filter($recorded, fn (array $row) => $row['full'] === 'false'), 'from'))->toContain('2026-01-01T12:30:00.000Z');
    });

    it('says why an amount is missing, and has the cumulative empty until the first amount', function () {
        Carbon::setTestNow('2026-01-02 12:32:00');
        $unpriced = fn (int $input) => UsageRows::step('acme', 'mystery', ['inputTokens' => $input]);
        // 11:40 only an unpriced step; 11:50 a priced one; 12:00 both; 12:10 unpriced; 12:20 running; 12:25 priced.
        spendExportRun('2026-01-02 11:40:00', [$unpriced(10)]);
        spendExportRun('2026-01-02 11:50:00', [spendExportStep(['cost' => 0.5])]);
        spendExportRun('2026-01-02 12:00:00', [spendExportStep(['cost' => 0.25]), $unpriced(5)]);
        spendExportRun('2026-01-02 12:10:00', [$unpriced(7)]);
        spendExportRun('2026-01-02 12:20:00', [spendExportStep(['cost' => 0.1, 'status' => Status::Running])], ['status' => Status::Running]);
        spendExportRun('2026-01-02 12:25:00', [spendExportStep(['cost' => 1.0])]);

        $rows = spendExportAt($this, 'range=1h')['rows'];
        $recorded = array_values(array_filter($rows, fn (array $row) => $row['kind'] === 'recorded'));

        expect($recorded)->toHaveCount(13)
            ->and(array_column($recorded, 'cost_state'))->toBe([
                'not_captured', 'not_captured', 'unpriced', 'not_captured', 'estimated', 'not_captured',
                'partial', 'not_captured', 'unpriced', 'not_captured', 'pending', 'estimated', 'not_captured',
            ])
            ->and(array_column($recorded, 'estimated_cost_usd'))->toBe(['', '', '', '', '0.5', '', '0.25', '', '', '', '0.1', '1', ''])
            ->and(array_column($recorded, 'cumulative_state'))->toBe([
                'not_captured', 'not_captured', 'unpriced', 'unpriced', 'partial', 'partial', 'partial', 'partial', 'partial', 'partial', 'pending', 'pending', 'pending',
            ])
            ->and(array_column($recorded, 'cumulative_estimated_cost_usd'))->toBe(['', '', '', '', '0.5', '0.5', '0.75', '0.75', '0.75', '0.75', '0.85', '1.85', '1.85'])
            ->and(array_unique(array_column($recorded, 'bucket')))->toBe(['5m']);
    });

    it('writes a tiny amount and a large one as plain decimals', function () {
        spendExportRun('2026-01-02 11:10:00', [spendExportStep(['cost' => 0.0000000001])]);
        spendExportRun('2026-01-02 10:10:00', [spendExportStep(['cost' => 98765.4321098765])]);

        $export = spendExportAt($this);
        $amounts = array_column($export['rows'], 'estimated_cost_usd', 'from');
        $cumulative = array_column($export['rows'], 'cumulative_estimated_cost_usd', 'from');

        expect($amounts['2026-01-02T11:00:00.000Z'])->toBe('0.0000000001')
            ->and($amounts['2026-01-02T10:00:00.000Z'])->toBe('98765.4321098765')
            ->and($cumulative['2026-01-02T11:00:00.000Z'])->toBe('98765.4321098766')
            ->and($export['content'])->not->toContain('E-')->not->toContain('E+');
    });
});

describe('the projection', function () {
    it('writes the projected buckets after the recorded ones, in their own columns', function () {
        spendExportDay();

        $export = spendExportAt($this);
        $json = spendExportJsonAt($this)['projection'];
        $projected = array_slice($export['rows'], 25);

        expect($json['state'])->toBe('projected')
            ->and($export['rows'])->toHaveCount(49)
            ->and($projected)->toHaveCount(24)
            ->and(array_unique(array_column(array_slice($export['rows'], 0, 25), 'kind')))->toBe(['recorded'])
            ->and(array_unique(array_column($projected, 'kind')))->toBe(['projected']);

        foreach ($json['buckets'] as $position => $bucket) {
            expect($projected[$position]['from'])->toBe($bucket['from'])
                ->and($projected[$position]['to'])->toBe($bucket['to'])
                ->and($projected[$position]['bucket'])->toBe('hour')
                ->and($projected[$position]['projected_usd'])->toBe(spendExportCell($bucket['amount']))
                ->and($projected[$position]['projected_line_usd'])->toBe(spendExportCell($bucket['cumulative']));
        }
    });

    it('writes the projected buckets as written by hand', function () {
        spendExportDay();

        $lines = spendExportAt($this)['lines'];

        expect($lines[26])->toBe('projected,2026-01-02T13:00:00.000Z,2026-01-02T14:00:00.000Z,hour,,,,,,,,2.5,417.5')
            ->and($lines[27])->toBe('projected,2026-01-02T14:00:00.000Z,2026-01-02T15:00:00.000Z,hour,,,,,,,,2.5,420')
            ->and($lines[49])->toBe('projected,2026-01-03T12:00:00.000Z,2026-01-03T13:00:00.000Z,hour,,,,,,,,2.5,475');
    });

    it('never writes a projected value in a cost column, nor a recorded one in a projected column', function () {
        spendExportDay();

        $rows = spendExportAt($this)['rows'];
        $recorded = array_values(array_filter($rows, fn (array $row) => $row['kind'] === 'recorded'));
        $projected = array_values(array_filter($rows, fn (array $row) => $row['kind'] === 'projected'));

        expect($recorded)->toHaveCount(25)->and($projected)->toHaveCount(24);

        foreach ($projected as $row) {
            foreach (['full', 'in_progress', 'runs', 'cost_state', 'estimated_cost_usd', 'cumulative_state', 'cumulative_estimated_cost_usd'] as $column) {
                expect($row[$column])->toBe('', "projected {$row['from']} {$column}");
            }

            expect($row['projected_usd'])->toBe('2.5')->and($row['projected_line_usd'])->not->toBe('');
        }

        foreach ($recorded as $row) {
            expect($row['projected_usd'])->toBe('', "recorded {$row['from']}")->and($row['projected_line_usd'])->toBe('', "recorded {$row['from']}");
        }

        // The recorded line ends at 415 and the projection continues it; no cost cell ever holds 2.5.
        expect(array_column($rows, 'estimated_cost_usd'))->not->toContain('2.5')
            ->and(array_column($rows, 'cumulative_estimated_cost_usd'))->not->toContain('417.5')
            ->and(array_slice(array_column($recorded, 'cumulative_estimated_cost_usd'), -1))->toBe(['415']);
    });

    it('carries five-minute buckets and days too', function () {
        Carbon::setTestNow('2026-01-02 12:32:00');
        spendExportRun('2026-01-02 12:01:00', [spendExportStep()]);
        spendExportRun('2026-01-02 12:12:00', [spendExportStep()]);
        spendExportRun('2026-01-02 12:21:00', [spendExportStep()]);

        $short = spendExportAt($this, 'range=1h');
        $shortProjected = array_values(array_filter($short['rows'], fn (array $row) => $row['kind'] === 'projected'));

        expect($shortProjected)->toHaveCount(12)
            ->and($shortProjected[0]['from'])->toBe('2026-01-02T12:35:00.000Z')
            ->and(array_unique(array_column($shortProjected, 'bucket')))->toBe(['5m']);

        Carbon::setTestNow('2026-01-08 12:00:00');
        spendExportRun('2026-01-02 10:00:00', [spendExportStep()]);
        spendExportRun('2026-01-03 10:00:00', [spendExportStep()]);
        spendExportRun('2026-01-05 10:00:00', [spendExportStep()]);

        $week = spendExportAt($this, 'range=7d');
        $weekProjected = array_values(array_filter($week['rows'], fn (array $row) => $row['kind'] === 'projected'));

        expect($weekProjected)->toHaveCount(7)
            ->and($weekProjected[0]['from'])->toBe('2026-01-09T00:00:00.000Z')
            ->and(array_unique(array_column($weekProjected, 'bucket')))->toBe(['day']);
    });

    it('writes no projected row without enough history, and says why in a header', function () {
        spendExportRun('2026-01-02 06:10:00', [spendExportStep()]);
        spendExportRun('2026-01-02 08:20:00', [spendExportStep()]);

        $export = spendExportAt($this);

        expect($export['rows'])->toHaveCount(25)
            ->and(array_unique(array_column($export['rows'], 'kind')))->toBe(['recorded'])
            ->and(spendExportJsonAt($this)['projection']['state'])->toBe('not_enough_history');
        $export['response']->assertHeader('X-Trail-Projection-State', 'not_enough_history')
            ->assertHeader('X-Trail-Export-Rows', '25')
            ->assertHeader('X-Trail-Export-Total', '25')
            ->assertHeader('X-Trail-Export-Truncated', 'false');
    });

    it('writes no projected row for an explicit range, and says why in a header', function () {
        spendExportDay();

        $query = 'from=2026-01-01T12:30:00Z&to=2026-01-02T12:30:00Z';
        $export = spendExportAt($this, $query);

        expect($export['rows'])->toHaveCount(25)
            ->and(array_unique(array_column($export['rows'], 'kind')))->toBe(['recorded'])
            ->and(spendExportJsonAt($this, $query)['projection']['state'])->toBe('range_not_current');
        $export['response']->assertHeader('X-Trail-Projection-State', 'range_not_current')->assertHeader('X-Trail-Export-Rows', '25');
    });

    it('says projected in a header when it wrote projected rows, and counts them in both numbers', function () {
        spendExportDay();

        spendExportAt($this)['response']->assertHeader('X-Trail-Projection-State', 'projected')
            ->assertHeader('X-Trail-Export-Rows', '49')
            ->assertHeader('X-Trail-Export-Total', '49')
            ->assertHeader('X-Trail-Export-Truncated', 'false');
    });
});

describe('a range with nothing recorded', function () {
    it('still has its buckets, none of them with an amount', function () {
        $export = spendExportAt($this);

        expect($export['rows'])->toHaveCount(25)
            ->and(array_unique(array_column($export['rows'], 'cost_state')))->toBe(['not_captured'])
            ->and(array_unique(array_column($export['rows'], 'estimated_cost_usd')))->toBe([''])
            ->and(array_unique(array_column($export['rows'], 'cumulative_state')))->toBe(['not_captured'])
            ->and(array_unique(array_column($export['rows'], 'cumulative_estimated_cost_usd')))->toBe([''])
            ->and(array_unique(array_column($export['rows'], 'runs')))->toBe(['0']);
        $export['response']->assertHeader('X-Trail-Projection-State', 'not_enough_history')->assertHeader('X-Trail-Export-Rows', '25');
    });
});

describe('the file', function () {
    it('sends a CSV attachment with the headers of a file', function () {
        $response = spendExportAt($this)['response'];

        expect($response->headers->get('Content-Type'))->toBe('text/csv; charset=UTF-8')
            ->and($response->headers->get('Content-Disposition'))->toBe('attachment; filename="trail-usage-estimated-cost-20260102-123000.csv"')
            ->and($response->headers->get('Cache-Control'))->toContain('no-store')
            ->and($response->headers->get('X-Content-Type-Options'))->toBe('nosniff')
            ->and($response->headers->get('X-Accel-Buffering'))->toBe('no');
    });

    it('starts with one byte-order mark and ends every line with CRLF', function () {
        spendExportDay();

        $content = spendExportAt($this)['content'];

        expect(substr_count($content, Csv::BYTE_ORDER_MARK))->toBe(1)
            ->and($content)->toEndWith("\r\n")
            ->and(preg_match_all('/(?<!\r)\n/', $content))->toBe(0)
            ->and(substr_count($content, "\r\n"))->toBe(50);
    });

    it('is not read as anything else by the routes beside it', function () {
        expect(spendExportAt($this)['response']->headers->get('Content-Type'))->toBe('text/csv; charset=UTF-8');
        $this->getJson('/trail/api/usage/spend')->assertOk()->assertJsonStructure(['data' => ['series', 'projection']]);
    });
});

describe('access', function () {
    it('answers 403 as JSON outside the local environment without a gate', function () {
        $this->app['env'] = 'production';

        $this->get('/trail/api/usage/spend/export')->assertForbidden()->assertJsonStructure(['message']);
    });

    it('answers 404 as JSON when the dashboard is switched off', function () {
        config(['trail.dashboard.enabled' => false]);

        $this->get('/trail/api/usage/spend/export')->assertNotFound()->assertJsonStructure(['message']);
    });

    it('answers a bad range with the 422 JSON and no CSV', function (string $query, string $field) {
        spendExportDay();

        $response = $this->get('/trail/api/usage/spend/export?'.$query);

        $response->assertUnprocessable()->assertJsonValidationErrors($field);
        expect($response->headers->get('Content-Type'))->toContain('application/json')
            ->and($response->headers->has('X-Trail-Export-Rows'))->toBeFalse()
            ->and($response->headers->has('X-Trail-Projection-State'))->toBeFalse()
            ->and($response->getContent())->not->toContain(Csv::BYTE_ORDER_MARK);
    })->with([
        'a range' => ['range=2y', 'range'],
        'both kinds of range' => ['range=1h&from=2026-01-02T00:00:00Z', 'range'],
        'a bound alone' => ['from=2026-01-02T00:00:00Z', 'to'],
        'a range too long to cut into buckets' => ['from=2025-01-01T00:00:00Z&to=2026-01-02T00:00:00Z', 'from'],
    ]);

    it('ignores any other parameter', function () {
        spendExportDay();

        expect(spendExportAt($this, 'by=agent&sort=name&page=3&per_page=1')['rows'])->toHaveCount(49);
    });

    it('sends the file outside the local environment to a user the gate allows', function () {
        $this->app['env'] = 'production';
        Gate::define('viewTrail', fn ($user) => $user->email === 'ada@example.com');
        spendExportDay();

        $this->get('/trail/api/usage/spend/export')->assertForbidden();

        $response = $this->actingAs(new GenericUser(['id' => 1, 'email' => 'ada@example.com']))->get('/trail/api/usage/spend/export');
        $content = $response->streamedContent();

        $response->assertOk();
        expect($response->headers->get('Content-Type'))->toBe('text/csv; charset=UTF-8')
            ->and($content)->toContain('projected,');

        // Rolling back this test's migrations asks for confirmation in production.
        $this->app['env'] = 'testing';
    });
});
