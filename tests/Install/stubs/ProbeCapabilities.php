<?php

namespace App\Console\Commands;

use Astro\Trail\Facades\Trail;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Laravel\Ai\Classification;
use Laravel\Ai\Classification\Boolean;
use Laravel\Ai\Reranking;
use Laravel\Ai\Responses\Data\BooleanAnswer;
use Laravel\Ai\Responses\Data\RankedDocument;

/** Exercises the shipped listeners and schema without keys or external requests. */
class ProbeCapabilities extends Command
{
    protected $signature = 'probe:capabilities';

    protected $description = 'Verify classification and reranking capture in a fresh application';

    public function handle(): int
    {
        Classification::fake([['valid' => new BooleanAnswer(0.8)]]);
        Reranking::fake([[new RankedDocument(0, 'Document', 0.9)]]);
        Classification::of('Install probe')->question('valid', new Boolean('Valid?'))->classify('typesafe', 'install-decisions');
        Reranking::of(['Document'])->rerank('Install query', 'cohere', 'install-rerank');
        Trail::flush();
        foreach (['classification', 'reranking'] as $type) {
            $span = DB::table('trail_spans')->where('type', $type)->sole();
            $trace = DB::table('trail_traces')->where('id', $span->trace_id)->sole();
            if ($trace->type !== $type || $span->status !== 'completed' || $trace->status !== 'completed' || $span->cost !== null || $span->input_tokens !== null || (int) $trace->cost_gap_calls !== 1) {
                $this->error("Capability capture failed for {$type}.");

                return self::FAILURE;
            }
        }
        $this->line('probe capabilities recorded with unknown usage preserved');

        return self::SUCCESS;
    }
}
