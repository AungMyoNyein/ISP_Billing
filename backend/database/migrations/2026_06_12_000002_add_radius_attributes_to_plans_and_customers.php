<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_plans', function (Blueprint $table) {
            $table->string('framed_pool', 64)->nullable()->comment('Framed-Pool reply attribute');
            $table->string('mikrotik_group', 64)->nullable()->comment('Mikrotik-Group reply attribute');
            $table->unsignedSmallInteger('simultaneous_use')->nullable()->comment('Simultaneous-Use check attribute');
            $table->unsignedInteger('acct_interim_interval')->nullable()->comment('Acct-Interim-Interval reply attribute, seconds');
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->string('framed_ip_address', 45)->nullable()->comment('static Framed-IP-Address reply attribute');
        });
    }

    public function down(): void
    {
        Schema::table('service_plans', function (Blueprint $table) {
            $table->dropColumn(['framed_pool', 'mikrotik_group', 'simultaneous_use', 'acct_interim_interval']);
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('framed_ip_address');
        });
    }
};
