<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Seeds the ISP letterhead settings used by printed invoices. Existing
 * installs only had company.name, so without this the Settings page would show
 * empty boxes for address/phone/email until someone saved the form once.
 *
 * Values are inserted only when absent — re-running never overwrites what an
 * operator has already typed in.
 */
return new class extends Migration
{
    /** @var array<string, mixed> */
    private array $defaults = [
        'company.address' => '',
        'company.phone' => '',
        'company.email' => '',
        'company.logo' => null,
    ];

    public function up(): void
    {
        $existing = DB::table('settings')
            ->whereIn('key', array_keys($this->defaults))
            ->pluck('key')
            ->all();

        $now = now();

        foreach ($this->defaults as $key => $value) {
            if (in_array($key, $existing, true)) {
                continue;
            }

            DB::table('settings')->insert([
                'key' => $key,
                // the value column is json — encode so '' lands as a JSON
                // string and null as JSON null, matching Setting::$casts
                'value' => json_encode($value),
                'group' => 'company',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('settings')->whereIn('key', array_keys($this->defaults))->delete();
    }
};
