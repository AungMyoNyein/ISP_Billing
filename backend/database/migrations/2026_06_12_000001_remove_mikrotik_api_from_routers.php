<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Routers are now plain FreeRADIUS NAS records; all RouterOS API
 * access is gone. Session kicks go out as RADIUS Disconnect-Requests
 * (RFC 5176) to the NAS CoA port instead.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('routers')->whereNull('nas_ip')->update(['nas_ip' => DB::raw('host')]);

        Schema::table('routers', function (Blueprint $table) {
            $table->dropColumn(['host', 'api_port', 'username', 'password', 'use_ssl', 'status', 'last_seen_at', 'last_resource']);
            $table->unsignedInteger('coa_port')->default(3799)->comment('RADIUS CoA/Disconnect port on the NAS');
        });
    }

    public function down(): void
    {
        Schema::table('routers', function (Blueprint $table) {
            $table->dropColumn('coa_port');
            $table->string('host')->nullable();
            $table->unsignedInteger('api_port')->default(8728);
            $table->string('username')->nullable();
            $table->text('password')->nullable();
            $table->boolean('use_ssl')->default(false);
            $table->string('status')->default('unknown');
            $table->timestamp('last_seen_at')->nullable();
            $table->json('last_resource')->nullable();
        });
    }
};
