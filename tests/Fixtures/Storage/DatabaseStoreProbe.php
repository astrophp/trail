<?php

namespace Astro\Trail\Tests\Fixtures\Storage;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use stdClass;
use UnexpectedValueException;

class DatabaseStoreProbe implements StoreProbe
{
    private const BOOLEANS = ['streamed', 'recovered', 'child_failed', 'redacted', 'truncated'];

    private const INTEGERS = [
        'error_http_status', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens',
        'reasoning_tokens', 'span_count', 'unpriced_span_count', 'attempt', 'sequence', 'step_number',
    ];

    private const FLOATS = ['cost', 'duration_ms'];

    private const JSON = ['metadata', 'input', 'output'];

    private const DATES = ['started_at', 'ended_at', 'created_at', 'updated_at'];

    public function trace(string $id): ?array
    {
        $row = $this->table('trail_traces')->where('id', $id)->first();

        return $row instanceof stdClass ? $this->normalise($row) : null;
    }

    public function spans(string $traceId): array
    {
        return $this->table('trail_spans')
            ->where('trace_id', $traceId)
            ->orderBy('sequence')
            ->orderBy('id')
            ->get()
            ->map(fn (stdClass $row) => $this->normalise($row))
            ->all();
    }

    public function traceCount(): int
    {
        return $this->table('trail_traces')->count();
    }

    public function spanCount(): int
    {
        return $this->table('trail_spans')->count();
    }

    private function table(string $name): Builder
    {
        $connection = config('trail.storage.connection');

        return DB::connection(is_string($connection) ? $connection : null)->table($name);
    }

    /**
     * @return array<string, mixed>
     */
    private function normalise(stdClass $row): array
    {
        $values = [];

        foreach (get_object_vars($row) as $column => $value) {
            $values[$column] = match (true) {
                $value === null => null,
                in_array($column, self::BOOLEANS, true) => (bool) $value,
                in_array($column, self::INTEGERS, true) => (int) $this->numeric($column, $value),
                in_array($column, self::FLOATS, true) => (float) $this->numeric($column, $value),
                in_array($column, self::JSON, true) => json_decode(is_string($value) ? $value : '', true, 512, JSON_THROW_ON_ERROR),
                in_array($column, self::DATES, true) => $this->date($column, $value),
                default => $value,
            };
        }

        return $values;
    }

    private function numeric(string $column, mixed $value): int|float|string
    {
        if (! is_numeric($value)) {
            throw new UnexpectedValueException("Column [{$column}] holds a non-numeric value.");
        }

        return $value;
    }

    private function date(string $column, mixed $value): string
    {
        if (is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.(\d{1,3}))?$/', $value, $matches) === 1) {
            $fraction = $matches[1] ?? '';

            return $fraction === '' ? $value.'.000' : $value.str_pad('', 3 - strlen($fraction), '0');
        }

        throw new UnexpectedValueException("Column [{$column}] holds an unexpected datetime value.");
    }
}
