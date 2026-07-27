<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One ONU serial belongs to one customer. The SmartOLT importer keys off this
 * column to decide what it has already seen, so the database has to enforce it
 * — otherwise two concurrent syncs, or a hand-typed serial, silently create a
 * duplicate customer for the same ONU.
 *
 * Postgres treats NULLs as distinct, so customers without an ONU are
 * unaffected. Empty strings are not, hence the normalisation first.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('customers')->where('smartolt_onu_sn', '')->update(['smartolt_onu_sn' => null]);

        Schema::table('customers', function (Blueprint $table) {
            $table->unique('smartolt_onu_sn');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropUnique(['smartolt_onu_sn']);
        });
    }
};
