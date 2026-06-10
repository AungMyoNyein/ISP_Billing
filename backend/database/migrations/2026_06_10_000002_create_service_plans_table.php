<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_plans', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->decimal('price', 12, 2)->default(0);
            $table->unsignedBigInteger('download_speed_kbps');
            $table->unsignedBigInteger('upload_speed_kbps');
            $table->unsignedInteger('session_timeout')->nullable()->comment('seconds');
            $table->unsignedInteger('idle_timeout')->nullable()->comment('seconds');
            $table->string('mikrotik_rate_limit')->nullable()->comment('e.g. 10M/5M');
            $table->unsignedInteger('validity_days')->default(30);
            $table->string('radius_group')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('description')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_plans');
    }
};
