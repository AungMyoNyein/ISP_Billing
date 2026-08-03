<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * nasreload.nasipaddress must have the same type as radacct.nasipaddress.
 *
 * FreeRADIUS 3.2's PostgreSQL Simultaneous-Use queries join the two tables:
 *
 *     SELECT COUNT(RadAcctId) FROM radacct a
 *     LEFT OUTER JOIN nasreload n USING (NASIPAddress)
 *     WHERE UserName='...' AND AcctStopTime IS NULL
 *     AND (a.AcctStartTime > n.ReloadTime OR n.ReloadTime IS NULL)
 *
 * Upstream declares both columns inet; this schema declares radacct.nasipaddress
 * as VARCHAR(15), so creating nasreload with upstream's inet made USING() compare
 * varchar to inet — "operator does not exist: character varying = inet". Postgres
 * has no implicit cast between them, so the query errored out.
 *
 * That is not a cosmetic error. simul_count_query runs on every Access-Request
 * from a user whose group carries Simultaneous-Use (every plan with
 * simultaneous_use set), and a failed check is an Access-Reject: affected
 * customers could not authenticate at all, so no radacct session was ever
 * opened and the dashboard's online-user count sat at zero.
 *
 * Match radacct rather than converting radacct to inet — the join only has to
 * be self-consistent, and rewriting the accounting table is not worth the risk.
 */
return new class extends Migration
{
    protected $connection = 'radius';

    public function up(): void
    {
        if ($this->columnType() === 'inet') {
            // host() renders the address without any /mask, which is what the
            // varchar side of the join holds. The table is normally empty:
            // the query that populates it ships disabled ("-query") in
            // queries.conf, and nothing else writes to it.
            DB::connection('radius')->statement(
                'ALTER TABLE nasreload ALTER COLUMN nasipaddress TYPE VARCHAR(15) USING host(nasipaddress)'
            );
        }
    }

    public function down(): void
    {
        if ($this->columnType() === 'character varying') {
            DB::connection('radius')->statement(
                'ALTER TABLE nasreload ALTER COLUMN nasipaddress TYPE INET USING nasipaddress::inet'
            );
        }
    }

    private function columnType(): ?string
    {
        return DB::connection('radius')->scalar(
            "SELECT data_type FROM information_schema.columns
             WHERE table_name = 'nasreload' AND column_name = 'nasipaddress'"
        );
    }
};
