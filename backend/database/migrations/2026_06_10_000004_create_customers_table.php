<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('customer_code')->unique()->comment('manually entered Customer ID');
            $table->string('username')->unique()->comment('PPPoE / RADIUS username');
            $table->text('radius_password')->comment('encrypted; pushed to radcheck');
            $table->string('name');
            $table->string('phone')->nullable();
            $table->text('address')->nullable();
            $table->string('dn_zone')->nullable()->comment('distribution network zone');
            $table->string('sn_odb')->nullable()->comment('service node / ODB box');
            $table->string('gps_location')->nullable()->comment('lat,lng');
            $table->string('status')->default('pending')
                ->comment('pending|active|suspended|expired|disabled');
            $table->text('notes')->nullable();
            $table->foreignId('service_plan_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('router_id')->nullable()->constrained()->nullOnDelete();
            $table->string('smartolt_onu_sn')->nullable()->comment('ONU serial for SmartOLT');
            $table->date('activation_date')->nullable();
            $table->date('expiry_date')->nullable();
            $table->timestamp('last_renewed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('status');
            $table->index('expiry_date');
            $table->index('dn_zone');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
