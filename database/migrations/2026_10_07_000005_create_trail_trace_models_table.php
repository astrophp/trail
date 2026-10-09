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
        // What each run used of each model, kept at the flush so that usage is read without reading spans.
        Schema::connection($this->getConnection())->create('trail_trace_models', function (Blueprint $table) {
            $table->id();
            // No foreign key: whatever deletes traces deletes their rows too.
            $table->string('trace_id', 64);
            $table->string('provider')->nullable();
            $table->string('model')->nullable();
            $table->string('run_name');
            $table->dateTime('started_at', 3);
            // True on one row of each provider of the run, so that a sum of it counts the runs of a provider.
            $table->boolean('provider_first');
            // Billing spans (steps and embeddings); 0 when only an agent span asked for the model.
            $table->unsignedInteger('steps');
            $table->unsignedInteger('reported_steps');
            $table->unsignedInteger('unpriced_steps');
            $table->unsignedBigInteger('unpriced_tokens')->nullable();
            // The newest creation of a billing span still running; whether it is stale is judged when read.
            $table->dateTime('open_at', 3)->nullable();
            $table->unsignedBigInteger('input_tokens')->nullable();
            $table->unsignedBigInteger('uncached_input_tokens')->nullable();
            $table->unsignedBigInteger('output_tokens')->nullable();
            $table->unsignedBigInteger('cache_read_tokens')->nullable();
            $table->unsignedBigInteger('cache_write_tokens')->nullable();
            $table->unsignedBigInteger('reasoning_tokens')->nullable();
            $table->decimal('cost', 18, 10)->nullable();

            $table->index('trace_id');
            $table->index('started_at');
        });
    }

    public function down(): void
    {
        Schema::connection($this->getConnection())->dropIfExists('trail_trace_models');
    }
};
