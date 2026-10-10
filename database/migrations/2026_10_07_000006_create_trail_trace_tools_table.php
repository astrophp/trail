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
        // The tools each run called, kept at the flush so that tool use is read without reading spans.
        Schema::connection($this->getConnection())->create('trail_trace_tools', function (Blueprint $table) {
            $table->id();
            // No foreign key: whatever deletes traces deletes their rows too.
            $table->string('trace_id', 64);
            $table->string('name');
            $table->string('run_name');
            $table->dateTime('started_at', 3);
            $table->unsignedInteger('calls');
            $table->unsignedInteger('failed');

            $table->index('trace_id');
            $table->index('started_at');
        });
    }

    public function down(): void
    {
        Schema::connection($this->getConnection())->dropIfExists('trail_trace_tools');
    }
};
