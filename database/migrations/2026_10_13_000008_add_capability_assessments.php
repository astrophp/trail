<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function getConnection(): ?string
    {
        $connection = config('trail.storage.connection');

        return is_string($connection) ? $connection : null;
    }

    public function up(): void
    {
        $schema = Schema::connection($this->getConnection());
        $schema->table('trail_spans', function (Blueprint $table) {
            $table->string('billing_basis')->nullable();
        });
        foreach (['trail_traces', 'trail_trace_models'] as $name) {
            $schema->table($name, function (Blueprint $table) {
                // Null denotes history that predates assessment; never backfill it as zero.
                $table->unsignedInteger('unknown_cost_calls')->nullable();
                $table->unsignedInteger('cost_gap_calls')->nullable();
            });
        }
        $schema->table('trail_trace_models', function (Blueprint $table) {
            $table->unsignedInteger('unpriced_search_unit_calls')->nullable();
            $table->unsignedInteger('ambiguous_reranking_calls')->nullable();
        });
        $schema->table('trail_prices', function (Blueprint $table) {
            // Legacy saved rows override token prices; a reranking-only save inherits them.
            $table->boolean('token_rates_set')->nullable();
            $table->boolean('reranking_rates_set')->nullable();
            $table->timestamp('token_saved_at', 3)->nullable();
            $table->timestamp('reranking_saved_at', 3)->nullable();
        });
    }

    public function down(): void
    {
        $schema = Schema::connection($this->getConnection());
        $schema->table('trail_prices', fn (Blueprint $table) => $table->dropColumn(['token_rates_set', 'reranking_rates_set', 'token_saved_at', 'reranking_saved_at']));
        foreach (['trail_traces', 'trail_trace_models'] as $name) {
            $schema->table($name, fn (Blueprint $table) => $table->dropColumn(['unknown_cost_calls', 'cost_gap_calls']));
        }
        $schema->table('trail_trace_models', fn (Blueprint $table) => $table->dropColumn(['unpriced_search_unit_calls', 'ambiguous_reranking_calls']));
        $schema->table('trail_spans', fn (Blueprint $table) => $table->dropColumn('billing_basis'));
    }
};
