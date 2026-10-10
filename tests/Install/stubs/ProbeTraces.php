<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Prints what Trail stored, as JSON, straight from the tables.
 */
class ProbeTraces extends Command
{
    protected $signature = 'probe:traces';

    protected $description = 'Print the stored traces and spans as JSON';

    public function handle(): int
    {
        $traces = DB::table('trail_traces')->orderBy('started_at')->get(['id', 'type', 'name', 'agent_class', 'status', 'span_count', 'error_class', 'error_message']);

        $out = [];
        foreach ($traces as $trace) {
            $spans = DB::table('trail_spans')->where('trace_id', $trace->id)->orderBy('sequence')->get(['type', 'name', 'status', 'step_number']);
            $out[] = ['trace' => $trace, 'spans' => $spans];
        }

        $this->line((string) json_encode($out, JSON_PRETTY_PRINT));

        return self::SUCCESS;
    }
}
