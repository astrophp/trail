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
        Schema::connection($this->getConnection())->create('trail_spans', function (Blueprint $table) {
            $table->string('id', 64)->primary();
            $table->string('trace_id', 64);
            $table->string('parent_id', 64)->nullable();
            $table->string('type', 16);
            $table->string('name');
            $table->string('agent_class')->nullable();
            $table->string('status', 32);
            $table->unsignedSmallInteger('attempt')->default(1);
            $table->unsignedInteger('sequence')->default(0);
            $table->unsignedInteger('step_number')->nullable();
            $table->string('provider')->nullable();
            $table->string('model')->nullable();
            $table->string('responding_model')->nullable();
            $table->unsignedBigInteger('input_tokens')->nullable();
            $table->unsignedBigInteger('output_tokens')->nullable();
            $table->unsignedBigInteger('cache_read_tokens')->nullable();
            $table->unsignedBigInteger('cache_write_tokens')->nullable();
            $table->unsignedBigInteger('reasoning_tokens')->nullable();
            $table->decimal('cost', 18, 10)->nullable();
            $table->longText('input')->nullable();
            $table->longText('output')->nullable();
            $table->longText('metadata')->nullable();
            $table->boolean('redacted')->default(false);
            $table->boolean('truncated')->default(false);
            $table->string('issue_kind', 32)->nullable();
            $table->string('error_class')->nullable();
            $table->longText('error_message')->nullable();
            $table->string('error_source', 16)->nullable();
            $table->unsignedSmallInteger('error_http_status')->nullable();
            $table->double('duration_ms')->nullable();
            $table->dateTime('started_at', 3);
            $table->dateTime('ended_at', 3)->nullable();
            $table->dateTime('created_at', 3);
            $table->dateTime('updated_at', 3);

            $table->index(['trace_id', 'started_at']);
            $table->index(['provider', 'model', 'started_at']);
            $table->index(['status', 'created_at']);
            // Finds the spans of one kind and name: the runs that called a tool, the delegated runs of an agent.
            $table->index(['type', 'name', 'started_at']);
        });
    }

    public function down(): void
    {
        Schema::connection($this->getConnection())->dropIfExists('trail_spans');
    }
};
