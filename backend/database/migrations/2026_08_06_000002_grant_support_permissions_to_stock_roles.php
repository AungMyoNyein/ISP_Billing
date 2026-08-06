<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Give the stock roles access to the new Support module on an existing install.
 *
 * DatabaseSeeder creates roles with firstOrCreate and deliberately never
 * rewrites them, so a re-seed after an upgrade would leave every role except
 * Administrator (which holds '*') unable to see tickets at all. This backfills
 * the permission once, matching what a fresh install now seeds.
 *
 * A role whose permissions an operator has already edited still gets the new
 * keys appended — nothing is removed, so the worst case is a permission they
 * can untick in the Roles screen.
 */
return new class extends Migration
{
    /** role name => permissions to add */
    private const GRANTS = [
        'Manager' => ['support.view', 'support.manage'],
        'Operator' => ['support.view', 'support.manage'],
        'Viewer' => ['support.view'],
    ];

    public function up(): void
    {
        $this->apply(fn (array $current, array $grant) => array_values(array_unique([...$current, ...$grant])));
    }

    public function down(): void
    {
        $this->apply(fn (array $current, array $grant) => array_values(array_diff($current, $grant)));
    }

    private function apply(callable $merge): void
    {
        foreach (self::GRANTS as $name => $grant) {
            $role = DB::table('roles')->where('name', $name)->first();
            if (! $role) {
                continue;
            }

            $current = json_decode($role->permissions ?? '[]', true) ?: [];

            // '*' already covers everything; adding keys next to it is noise
            if (in_array('*', $current, true)) {
                continue;
            }

            DB::table('roles')->where('id', $role->id)
                ->update(['permissions' => json_encode($merge($current, $grant))]);
        }
    }
};
