<?php

namespace Astro\Trail\Http\Resources;

/**
 * Writes runs as CSV (RFC 4180, CRLF line ends) from the arrays TraceResource builds, so a run in
 * a file says what the list says. A value that was not captured is an empty cell, never a zero.
 */
final class TraceCsv
{
    public const COLUMNS = [
        'id', 'name', 'type', 'agent_class', 'status', 'issue_kind', 'streamed', 'recovered', 'child_failed',
        'provider', 'model', 'duration_ms', 'usage_state',
        'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'total_tokens',
        'cost_state', 'cost_usd', 'span_count', 'conversation_id',
        'user_id', 'user_type', 'user_name', 'user_email', 'bookmarked',
        'started_at', 'ended_at', 'prompt_excerpt', 'response_excerpt',
    ];

    /** Tells a spreadsheet the file is UTF-8. */
    public const BYTE_ORDER_MARK = "\xEF\xBB\xBF";

    private const LINE_END = "\r\n";

    /** What starts a cell a spreadsheet would read as a formula. */
    private const FORMULA_STARTS = ['=', '+', '-', '@', "\t", "\r", "\n"];

    /** The header line. */
    public static function header(): string
    {
        return self::line(self::COLUMNS);
    }

    /**
     * The line of one run.
     *
     * @param  array<string, mixed>  $trace  a run as TraceResource::toArray() returns it
     */
    public static function row(array $trace): string
    {
        $usage = self::object($trace['usage'] ?? null);
        $cost = self::object($trace['cost'] ?? null);
        $user = self::object($trace['user'] ?? null);

        $values = [
            'id' => $trace['id'] ?? null,
            'name' => $trace['name'] ?? null,
            'type' => $trace['type'] ?? null,
            'agent_class' => $trace['agent_class'] ?? null,
            'status' => $trace['status'] ?? null,
            'issue_kind' => $trace['issue_kind'] ?? null,
            'streamed' => $trace['streamed'] ?? null,
            'recovered' => $trace['recovered'] ?? null,
            'child_failed' => $trace['child_failed'] ?? null,
            'provider' => $trace['provider'] ?? null,
            'model' => $trace['model'] ?? null,
            'duration_ms' => $trace['duration_ms'] ?? null,
            'usage_state' => $usage['state'] ?? null,
            'input_tokens' => $usage['input_tokens'] ?? null,
            'output_tokens' => $usage['output_tokens'] ?? null,
            'cache_read_tokens' => $usage['cache_read_tokens'] ?? null,
            'cache_write_tokens' => $usage['cache_write_tokens'] ?? null,
            'reasoning_tokens' => $usage['reasoning_tokens'] ?? null,
            'total_tokens' => $usage['total_tokens'] ?? null,
            'cost_state' => $cost['state'] ?? null,
            'cost_usd' => $cost['amount'] ?? null,
            'span_count' => $trace['span_count'] ?? null,
            'conversation_id' => $trace['conversation_id'] ?? null,
            'user_id' => $user['id'] ?? null,
            'user_type' => $user['type'] ?? null,
            'user_name' => $user['name'] ?? null,
            'user_email' => $user['email'] ?? null,
            'bookmarked' => $trace['bookmarked'] ?? null,
            'started_at' => $trace['started_at'] ?? null,
            'ended_at' => $trace['ended_at'] ?? null,
            'prompt_excerpt' => $trace['prompt_excerpt'] ?? null,
            'response_excerpt' => $trace['response_excerpt'] ?? null,
        ];

        return self::line(array_map(fn (string $column) => self::cell($values[$column]), self::COLUMNS));
    }

    /**
     * One cell. Text is guarded against formulas; the numbers and booleans Trail produces are not
     * text and are never negative, so they are written as they are.
     */
    public static function cell(mixed $value): string
    {
        return match (true) {
            $value === null => '',
            is_bool($value) => $value ? 'true' : 'false',
            is_int($value) => (string) $value,
            is_float($value) => self::decimal($value),
            is_string($value) => self::text($value),
            default => '',
        };
    }

    /**
     * A number as a plain decimal: no exponent, no trailing zeros. Ten places are enough for every
     * amount Trail stores.
     */
    public static function decimal(float $value): string
    {
        $text = rtrim(rtrim(number_format($value, 10, '.', ''), '0'), '.');

        return $text === '-0' || $text === '' ? '0' : $text;
    }

    /**
     * Text from user input, prefixed with a single quote when a spreadsheet would run it: when it
     * starts with a formula character, or with whitespace (a no-break space included) and then one.
     */
    public static function text(string $value): string
    {
        $runs = $value !== '' && (in_array($value[0], self::FORMULA_STARTS, true) || preg_match('/\A(?:[ \t\r\n]|\xC2\xA0)+[=+\-@]/', $value) === 1);

        return $runs ? "'".$value : $value;
    }

    /**
     * Cells as a line: a cell with a comma, quote, CR or LF is quoted with its quotes doubled.
     *
     * @param  list<string>  $cells
     */
    public static function line(array $cells): string
    {
        $encoded = [];

        foreach ($cells as $cell) {
            $encoded[] = strpbrk($cell, ",\"\r\n") === false ? $cell : '"'.str_replace('"', '""', $cell).'"';
        }

        return implode(',', $encoded).self::LINE_END;
    }

    /**
     * @return array<string, mixed>
     */
    private static function object(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $object = [];

        foreach ($value as $key => $item) {
            $object[(string) $key] = $item;
        }

        return $object;
    }
}
