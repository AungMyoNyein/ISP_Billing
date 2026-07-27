<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Backfill the nastype of routers we already provisioned, which were written
 * as "other" before RadiusService::NAS_TYPE existed.
 *
 * Only rows this app owns are touched — a hand-added client in the nas table
 * may point at non-MikroTik hardware, and its type is the operator's call.
 * FreeRADIUS reads its SQL clients at startup, so the new type only takes
 * effect after a restart.
 */
return new class extends Migration
{
    protected $connection = 'radius';

    public function up(): void
    {
        if (! Schema::connection('radius')->hasTable('nas')) {
            return;
        }

        DB::connection('radius')->table('nas')
            ->where('description', 'Managed by ISP Billing')
            ->where('type', 'other')
            ->update(['type' => 'mikrotik']);
    }

    public function down(): void
    {
        if (! Schema::connection('radius')->hasTable('nas')) {
            return;
        }

        DB::connection('radius')->table('nas')
            ->where('description', 'Managed by ISP Billing')
            ->where('type', 'mikrotik')
            ->update(['type' => 'other']);
    }
};
