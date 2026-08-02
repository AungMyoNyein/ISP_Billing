<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Three fixes to the FreeRADIUS schema, all observed failing in
 * /var/log/freeradius/radius.log on 2026-07-31:
 *
 * 1. radacct.acctterminatecause was NOT NULL DEFAULT ''. FreeRADIUS sends an
 *    explicit NULL for it on Start/Interim-Update, and an explicit NULL beats
 *    a column default — so every one of those writes was rejected and the
 *    session never reached radacct. 855 failures in one day. Dropping the
 *    NOT NULL is what upstream's own PostgreSQL schema does; the '' default
 *    stays for inserts that omit the column.
 *
 * 2. nasreload is queried by FreeRADIUS 3.2 (to spot sessions orphaned by a
 *    NAS restart) but was never created, so that query errored on every run.
 *
 * 3. radpostauth had no index on authdate, though the auth log page sorts and
 *    filters on it — a sequential scan that grows with the table.
 */
return new class extends Migration
{
    protected $connection = 'radius';

    public function up(): void
    {
        $schema = Schema::connection('radius');
        $db = DB::connection('radius');

        // 1. accounting writes that send an explicit NULL terminate cause
        $db->statement('ALTER TABLE radacct ALTER COLUMN acctterminatecause DROP NOT NULL');

        // 2. the table FreeRADIUS 3.2 expects for NAS-reload detection
        if (! $schema->hasTable('nasreload')) {
            $db->statement('
                CREATE TABLE nasreload (
                    nasipaddress INET PRIMARY KEY,
                    reloadtime TIMESTAMP WITH TIME ZONE NOT NULL
                )
            ');
        }

        // 3. auth log ordering/filtering — DESC matches "newest first"
        $db->statement('CREATE INDEX IF NOT EXISTS radpostauth_authdate_index ON radpostauth (authdate DESC)');
    }

    public function down(): void
    {
        $db = DB::connection('radius');

        $db->statement('DROP INDEX IF EXISTS radpostauth_authdate_index');
        Schema::connection('radius')->dropIfExists('nasreload');

        // restoring NOT NULL requires backfilling the NULLs the fix allowed
        $db->statement("UPDATE radacct SET acctterminatecause = '' WHERE acctterminatecause IS NULL");
        $db->statement('ALTER TABLE radacct ALTER COLUMN acctterminatecause SET NOT NULL');
    }
};
