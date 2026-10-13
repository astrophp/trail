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

        foreach (['trail_spans', 'trail_traces', 'trail_trace_models'] as $name) {
            $schema->table($name, function (Blueprint $table) {
                // Six decimal places, without SQLite's decimal-to-float loss.
                $table->bigInteger('search_units')->nullable();
            });
        }

        $schema->table('trail_trace_models', function (Blueprint $table) {
            $table->unsignedInteger('search_unit_calls')->nullable();
            $table->unsignedInteger('reported_search_unit_calls')->nullable();
            $table->bigInteger('unpriced_search_units')->nullable();
            $table->unsignedInteger('incomplete_calls')->nullable();
        });

        $schema->table('trail_prices', function (Blueprint $table) {
            $table->string('reranking_basis')->nullable();
            $table->decimal('reranking_input', 12, 6)->nullable();
            $table->decimal('reranking_search_unit', 12, 6)->nullable();
        });
    }

    public function down(): void
    {
        $schema = Schema::connection($this->getConnection());

        $schema->table('trail_prices', fn (Blueprint $table) => $table->dropColumn([
            'reranking_basis', 'reranking_input', 'reranking_search_unit',
        ]));
        $schema->table('trail_trace_models', fn (Blueprint $table) => $table->dropColumn([
            'search_unit_calls', 'reported_search_unit_calls', 'unpriced_search_units', 'incomplete_calls',
        ]));

        foreach (['trail_spans', 'trail_traces', 'trail_trace_models'] as $name) {
            $schema->table($name, fn (Blueprint $table) => $table->dropColumn('search_units'));
        }
    }
};
