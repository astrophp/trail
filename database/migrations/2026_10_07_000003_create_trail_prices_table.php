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
        Schema::connection($this->getConnection())->create('trail_prices', function (Blueprint $table) {
            $table->id();
            $table->string('provider');
            $table->string('model');
            // USD per 1M tokens. Null means no rate is set; 0 is a deliberate free rate.
            $table->decimal('input', 12, 6)->nullable();
            $table->decimal('output', 12, 6)->nullable();
            $table->decimal('cache_read', 12, 6)->nullable();
            $table->decimal('cache_write', 12, 6)->nullable();
            $table->dateTime('created_at', 3);
            $table->dateTime('updated_at', 3);

            $table->unique(['provider', 'model']);
        });
    }

    public function down(): void
    {
        Schema::connection($this->getConnection())->dropIfExists('trail_prices');
    }
};
