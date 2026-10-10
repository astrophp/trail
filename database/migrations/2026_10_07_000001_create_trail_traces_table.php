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
        Schema::connection($this->getConnection())->create('trail_traces', function (Blueprint $table) {
            $table->string('id', 64)->primary();
            $table->string('type', 16);
            $table->string('name');
            $table->string('agent_class')->nullable();
            $table->string('status', 32);
            $table->boolean('streamed')->default(false);
            $table->boolean('recovered')->default(false);
            $table->boolean('child_failed')->default(false);
            $table->string('issue_kind', 32)->nullable();
            $table->string('error_class')->nullable();
            $table->longText('error_message')->nullable();
            $table->string('error_source', 16)->nullable();
            $table->unsignedSmallInteger('error_http_status')->nullable();
            $table->string('provider')->nullable();
            $table->string('model')->nullable();
            $table->string('conversation_id')->nullable();
            $table->string('user_id')->nullable();
            $table->string('user_type')->nullable();
            $table->unsignedBigInteger('input_tokens')->nullable();
            $table->unsignedBigInteger('output_tokens')->nullable();
            $table->unsignedBigInteger('cache_read_tokens')->nullable();
            $table->unsignedBigInteger('cache_write_tokens')->nullable();
            $table->unsignedBigInteger('reasoning_tokens')->nullable();
            $table->decimal('cost', 18, 10)->nullable();
            $table->unsignedInteger('span_count')->default(0);
            $table->unsignedInteger('unpriced_span_count')->default(0);
            $table->double('duration_ms')->nullable();
            $table->text('prompt_excerpt')->nullable();
            $table->text('response_excerpt')->nullable();
            $table->longText('metadata')->nullable();
            $table->dateTime('started_at', 3);
            $table->dateTime('ended_at', 3)->nullable();
            $table->dateTime('created_at', 3);
            $table->dateTime('updated_at', 3);

            $table->index('started_at');
            $table->index(['status', 'started_at']);
            $table->index(['agent_class', 'started_at']);
            $table->index(['conversation_id', 'started_at']);
            $table->index(['user_id', 'user_type', 'started_at']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::connection($this->getConnection())->dropIfExists('trail_traces');
    }
};
