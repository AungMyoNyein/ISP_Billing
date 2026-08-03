<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * radacct.framedipaddress and radacct.nasipaddress were VARCHAR(15) — exactly
 * the width of "255.255.255.255". Anything wider than an IPv4 address is
 * rejected outright, and on 2026-08-03 production's radius.log was filling
 * with one such rejection every few seconds:
 *
 *     ERROR: rlm_sql_postgresql: value too long for type character varying(15)
 *     Error: rlm_sql_postgresql: 22001: STRING DATA RIGHT TRUNCATION
 *
 * A failed accounting INSERT is silent to everyone except this log. The
 * session still comes up — the customer is online and passing traffic — but
 * no radacct row is ever written, so every figure derived from radacct reads
 * as if nobody is connected: the dashboard's Online Users card sits at 0,
 * Online Sessions is empty, and each customer shows Offline. This is the
 * third instance of the same shape (see 2026_08_01_000002 and
 * 2026_08_03_000001): the accounting table refuses a write, and the UI
 * faithfully reports the resulting emptiness.
 *
 * 45 is the length upstream FreeRADIUS uses for its IPv6 address columns
 * (framedipv6address and friends here are already 45), and is enough for a
 * full IPv6 address plus a /nn prefix. Widening a varchar rewrites no rows
 * and cannot truncate: the longest value stored in either column at the time
 * of writing was 15 characters.
 *
 * nasreload.nasipaddress moves with radacct.nasipaddress. 2026_08_03_000001
 * explains why: FreeRADIUS 3.2's Simultaneous-Use queries join the two with
 * USING(), so the columns have to stay type-compatible.
 */
return new class extends Migration
{
    protected $connection = 'radius';

    public function up(): void
    {
        $this->resize('radacct', 'framedipaddress', 45, 15);
        $this->resize('radacct', 'nasipaddress', 45, 15);
        $this->resize('nasreload', 'nasipaddress', 45, 15);
    }

    public function down(): void
    {
        // Only narrow back if nothing has since been stored that would not
        // fit — a rollback must not destroy the addresses this fix admitted.
        $this->resize('radacct', 'framedipaddress', 15, 45, guardData: true);
        $this->resize('radacct', 'nasipaddress', 15, 45, guardData: true);
        $this->resize('nasreload', 'nasipaddress', 15, 45, guardData: true);
    }

    private function resize(string $table, string $column, int $to, int $from, bool $guardData = false): void
    {
        $db = DB::connection('radius');

        if ($this->currentLength($table, $column) !== $from) {
            return; // already at the target width, or the table is absent
        }

        if ($guardData && (int) $db->scalar("SELECT COALESCE(MAX(LENGTH({$column})), 0) FROM {$table}") > $to) {
            return;
        }

        $db->statement("ALTER TABLE {$table} ALTER COLUMN {$column} TYPE VARCHAR({$to})");
    }

    private function currentLength(string $table, string $column): ?int
    {
        $len = DB::connection('radius')->scalar(
            'SELECT character_maximum_length FROM information_schema.columns
             WHERE table_name = ? AND column_name = ?',
            [$table, $column]
        );

        return $len === null ? null : (int) $len;
    }
};
