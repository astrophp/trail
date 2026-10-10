<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The tables of a pretend application whose tool returns its own models.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hardening_owners', function (Blueprint $table) {
            $table->id();
            $table->string('name');
        });

        Schema::create('hardening_widgets', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('owner_id');
            $table->string('label');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hardening_widgets');
        Schema::dropIfExists('hardening_owners');
    }
};
