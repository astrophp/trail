<?php

use Astro\Trail\Http\Resources\TraceCsv;

/**
 * Reads CSV text back the way a spreadsheet does, quoted line breaks included.
 *
 * @return list<list<string|null>>
 */
function parsedCsv(string $csv): array
{
    $stream = fopen('php://memory', 'w+');
    fwrite($stream, $csv);
    rewind($stream);

    $rows = [];

    while (($row = fgetcsv($stream, null, ',', '"', '')) !== false) {
        $rows[] = $row;
    }

    fclose($stream);

    return $rows;
}

/**
 * @return array<string, mixed>
 */
function traceArray(array $overrides = []): array
{
    return [...[
        'id' => 'run-1', 'type' => 'agent', 'name' => 'Agent', 'agent_class' => null, 'status' => 'completed', 'issue_kind' => null,
        'streamed' => false, 'recovered' => true, 'child_failed' => false, 'provider' => null, 'model' => null, 'duration_ms' => null,
        'usage' => ['state' => 'not_reported', 'input_tokens' => null, 'output_tokens' => null, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => null],
        'cost' => ['state' => 'not_captured', 'amount' => null],
        'span_count' => 0, 'prompt_excerpt' => null, 'response_excerpt' => null, 'conversation_id' => null, 'user' => null,
        'bookmarked' => false, 'started_at' => '2026-01-02T10:00:00.000Z', 'ended_at' => null,
    ], ...$overrides];
}

it('writes the documented columns in order', function () {
    expect(parsedCsv(TraceCsv::header()))->toBe([[
        'id', 'name', 'type', 'agent_class', 'status', 'issue_kind', 'streamed', 'recovered', 'child_failed', 'provider', 'model',
        'duration_ms', 'usage_state', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens',
        'total_tokens', 'cost_state', 'cost_usd', 'span_count', 'conversation_id', 'user_id', 'user_type', 'user_name', 'user_email',
        'bookmarked', 'started_at', 'ended_at', 'prompt_excerpt', 'response_excerpt',
    ]]);
});

it('writes a value that was not captured as an empty cell, beside a zero that was', function () {
    $row = parsedCsv(TraceCsv::row(traceArray()))[0];
    $cells = array_combine(TraceCsv::COLUMNS, $row);

    foreach (['duration_ms', 'input_tokens', 'output_tokens', 'total_tokens', 'cost_usd', 'provider', 'user_id', 'ended_at'] as $column) {
        expect($cells[$column])->toBe('', $column);
    }

    $captured = array_combine(TraceCsv::COLUMNS, parsedCsv(TraceCsv::row(traceArray([
        'duration_ms' => 0.0, 'span_count' => 0, 'cost' => ['state' => 'estimated', 'amount' => 0.0],
        'usage' => ['state' => 'reported', 'input_tokens' => 0, 'output_tokens' => 0, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => 0],
    ])))[0]);

    expect($captured['duration_ms'])->toBe('0')
        ->and($captured['input_tokens'])->toBe('0')
        ->and($captured['cost_usd'])->toBe('0')
        ->and($captured['cache_read_tokens'])->toBe('')
        ->and($cells['span_count'])->toBe('0')
        ->and($cells['recovered'])->toBe('true')
        ->and($cells['streamed'])->toBe('false');
});

it('writes a decimal without an exponent or trailing zeros', function (float $value, string $text) {
    expect(TraceCsv::decimal($value))->toBe($text);
})->with([
    [1.0E-10, '0.0000000001'],
    [0.1234567891, '0.1234567891'],
    [0.00825, '0.00825'],
    [1840.412, '1840.412'],
    [12.0, '12'],
    [0.0, '0'],
    [1.5E+20, '150000000000000000000'],
]);

it('prefixes text a spreadsheet would run as a formula', function (string $text) {
    expect(TraceCsv::cell($text))->toBe("'".$text);
})->with(['=1+1', '+1', '-1', '@SUM(A1)', "\tx", "\rx", "\nx", ' =1', "\t+1", "\r\n-1", "\xC2\xA0@SUM(A1)", '  =cmd']);

it('leaves other text alone', function (string $text) {
    expect(TraceCsv::cell($text))->toBe($text);
})->with(['', 'plain', 'a=b', "'=quoted", ' a = b', 'Zoë 日本語 ✓']);

it('writes the numbers and timestamps Trail produces without a quote, and none is negative', function () {
    $line = TraceCsv::row(traceArray([
        'duration_ms' => 1840.412, 'span_count' => 4, 'cost' => ['state' => 'estimated', 'amount' => 0.00825],
        'usage' => ['state' => 'reported', 'input_tokens' => 10, 'output_tokens' => 5, 'cache_read_tokens' => 0, 'cache_write_tokens' => null, 'reasoning_tokens' => 2, 'total_tokens' => 15],
        'ended_at' => '2026-01-02T10:00:01.840Z',
    ]));
    $cells = array_combine(TraceCsv::COLUMNS, parsedCsv($line)[0]);

    foreach (['duration_ms', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'reasoning_tokens', 'total_tokens', 'cost_usd', 'span_count', 'started_at', 'ended_at', 'streamed', 'bookmarked'] as $column) {
        expect($cells[$column])->not->toStartWith("'")->and($cells[$column])->not->toStartWith('-');
    }

    expect($cells['duration_ms'])->toBe('1840.412')->and($cells['total_tokens'])->toBe('15');
});

it('quotes a cell with a comma, quote, CR or LF and doubles its quotes', function () {
    $cells = ['plain', 'a,b', 'say "hi"', "a\r\nb", "a\nb", "a\rb", 'a\\"b', '', 'Zoë'];

    $line = TraceCsv::line($cells);

    expect($line)->toBe("plain,\"a,b\",\"say \"\"hi\"\"\",\"a\r\nb\",\"a\nb\",\"a\rb\",\"a\\\"\"b\",,Zoë\r\n")
        ->and(parsedCsv($line))->toBe([['plain', 'a,b', 'say "hi"', "a\r\nb", "a\nb", "a\rb", 'a\\"b', '', 'Zoë']]);
});

it('ends every line with CRLF', function () {
    expect(TraceCsv::header())->toEndWith("\r\n")->and(TraceCsv::row(traceArray()))->toEndWith("\r\n");
});

it('flattens the user into four cells', function () {
    $cells = array_combine(TraceCsv::COLUMNS, parsedCsv(TraceCsv::row(traceArray([
        'user' => ['id' => '7', 'type' => 'App\\Models\\User', 'name' => 'Ada', 'email' => null],
    ])))[0]);

    expect($cells['user_id'])->toBe('7')
        ->and($cells['user_type'])->toBe('App\\Models\\User')
        ->and($cells['user_name'])->toBe('Ada')
        ->and($cells['user_email'])->toBe('');
});
