<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Retention for the RADIUS log tables, which nothing else ever trims.
 *
 * radpostauth is the bigger risk of the two: reject_delay is 0, so a
 * misconfigured CPE gets its Access-Reject immediately and can retry in a
 * tight loop, writing a row each time.
 *
 * Open sessions in radacct (acctstoptime IS NULL) are never deleted however
 * old they look — an online customer's session row is live state that the
 * dashboard and the sessions page read.
 */
class PruneRadiusLogs extends Command
{
    protected $signature = 'radius:prune
        {--auth-days=90 : Delete radpostauth rows older than this many days}
        {--acct-days=365 : Delete closed radacct sessions older than this many days}
        {--dry-run : Report what would be deleted without deleting it}';

    protected $description = 'Delete aged RADIUS authentication and accounting log rows';

    public function handle(): int
    {
        $authDays = max(1, (int) $this->option('auth-days'));
        $acctDays = max(1, (int) $this->option('acct-days'));
        $dryRun = (bool) $this->option('dry-run');

        $db = DB::connection('radius');
        $authCutoff = now()->subDays($authDays);
        $acctCutoff = now()->subDays($acctDays);

        $authQuery = $db->table('radpostauth')->where('authdate', '<', $authCutoff);
        // acctstoptime, not acctstarttime: a long-running session that started
        // before the cutoff but is still open must survive
        $acctQuery = $db->table('radacct')
            ->whereNotNull('acctstoptime')
            ->where('acctstoptime', '<', $acctCutoff);

        if ($dryRun) {
            $this->info(sprintf(
                'Would delete %d radpostauth row(s) before %s and %d closed radacct row(s) before %s.',
                $authQuery->count(), $authCutoff->toDateString(),
                $acctQuery->count(), $acctCutoff->toDateString(),
            ));

            return self::SUCCESS;
        }

        // delete in chunks so a large first run cannot hold one long lock
        $authDeleted = $this->deleteInChunks($authQuery);
        $acctDeleted = $this->deleteInChunks($acctQuery);

        $this->info(sprintf(
            'Pruned %d authentication row(s) older than %d day(s) and %d accounting row(s) older than %d day(s).',
            $authDeleted, $authDays, $acctDeleted, $acctDays,
        ));

        return self::SUCCESS;
    }

    private function deleteInChunks(\Illuminate\Database\Query\Builder $query, int $chunk = 5000): int
    {
        $total = 0;

        do {
            $deleted = (clone $query)->limit($chunk)->delete();
            $total += $deleted;
        } while ($deleted === $chunk);

        return $total;
    }
}
