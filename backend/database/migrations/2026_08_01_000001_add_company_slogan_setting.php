<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Adds the slogan printed in the invoice footer. Inserted only when absent so
 * re-running never overwrites what an operator typed in.
 */
return new class extends Migration
{
    private const KEY = 'company.slogan';

    public function up(): void
    {
        if (DB::table('settings')->where('key', self::KEY)->exists()) {
            return;
        }

        DB::table('settings')->insert([
            'key' => self::KEY,
            // json column — encode so '' lands as a JSON string
            'value' => json_encode(''),
            'group' => 'company',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('settings')->where('key', self::KEY)->delete();
    }
};
