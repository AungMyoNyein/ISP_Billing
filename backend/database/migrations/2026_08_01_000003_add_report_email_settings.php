<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Settings for the automatic report email and the SMTP account it sends
 * through. Inserted only when absent, so re-running never overwrites what an
 * operator has configured.
 *
 * mail.password is deliberately absent here: it is written encrypted by
 * SettingController and a placeholder row would be indistinguishable from a
 * value that failed to decrypt.
 */
return new class extends Migration
{
    /** @var array<string, array{0: mixed, 1: string}> key => [default, group] */
    private array $defaults = [
        'reports.email.enabled' => [false, 'reports'],
        'reports.email.frequency' => ['daily', 'reports'],
        'reports.email.recipients' => ['', 'reports'],
        'mail.host' => ['', 'mail'],
        'mail.port' => [587, 'mail'],
        'mail.username' => ['', 'mail'],
        'mail.encryption' => ['tls', 'mail'],
        'mail.from_address' => ['', 'mail'],
        'mail.from_name' => ['', 'mail'],
    ];

    public function up(): void
    {
        $existing = DB::table('settings')->whereIn('key', array_keys($this->defaults))->pluck('key')->all();
        $now = now();

        foreach ($this->defaults as $key => [$value, $group]) {
            if (in_array($key, $existing, true)) {
                continue;
            }

            DB::table('settings')->insert([
                'key' => $key,
                'value' => json_encode($value),
                'group' => $group,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('settings')
            ->whereIn('key', [...array_keys($this->defaults), 'mail.password'])
            ->delete();
    }
};
