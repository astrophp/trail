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
        Schema::connection($this->getConnection())->create('trail_bookmarks', function (Blueprint $table) {
            $table->id();
            // No foreign key: whatever deletes traces deletes their bookmarks too.
            $table->string('trace_id', 64)->unique();
            $table->string('user_id')->nullable();
            $table->string('user_type')->nullable();
            $table->dateTime('created_at', 3);
        });
    }

    public function down(): void
    {
        Schema::connection($this->getConnection())->dropIfExists('trail_bookmarks');
    }
};
