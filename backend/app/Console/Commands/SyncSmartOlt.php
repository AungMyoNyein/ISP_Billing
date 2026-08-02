<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Services\SmartOltService;
use Illuminate\Console\Command;

/**
 * Import ONUs authorised in SmartOLT as billing customers.
 *
 * Identity comes from the ONU: SmartOLT's ONU *Name* carries the customer
 * code, and the PPPoE username/password are configured in its WAN setup, so
 * an imported customer arrives with a working RADIUS identity. Everything
 * billing-side — service plan, activation and expiry dates — stays manual,
 * which is why customers land as "pending": nothing is provisioned into
 * RADIUS and no invoice is raised until an operator activates them.
 *
 * Create-only by design. An ONU serial already known to billing (including
 * soft-deleted customers) is left alone, so this never overwrites an
 * operator's edits and re-running it is safe.
 */
class SyncSmartOlt extends Command
{
    protected $signature = 'smartolt:sync {--dry-run : Report what would be imported without creating anything}';

    protected $description = 'Import newly authorised SmartOLT ONUs as pending billing customers';

    /**
     * Response keys to try, in order. The first of each is what a live
     * SmartOLT account returns from /onu/get_all_onus_details; the rest are
     * kept as fallbacks in case the payload differs between versions.
     */
    private const SN_KEYS = ['sn', 'serial_number', 'onu_sn', 'onu_serial_number'];

    private const NAME_KEYS = ['name', 'onu_name', 'onu_external_id'];

    private const PPPOE_USER_KEYS = ['username', 'pppoe_username', 'wan_pppoe_username'];

    private const PPPOE_PASS_KEYS = ['password', 'pppoe_password', 'wan_pppoe_password'];

    public function handle(SmartOltService $smartOlt): int
    {
        if (! $smartOlt->enabled()) {
            $this->warn('SmartOLT is not configured (SMARTOLT_BASE_URL / SMARTOLT_API_KEY) — nothing to sync.');

            return self::SUCCESS;
        }

        $onus = $smartOlt->listOnus();
        if ($onus === []) {
            $this->warn('SmartOLT returned no ONUs — check the API key and base URL.');

            return self::SUCCESS;
        }

        $dryRun = (bool) $this->option('dry-run');
        $created = $known = 0;
        $skipped = [];
        $rows = [];

        // Claimed within this pass. Two ONUs can carry the same customer code
        // or PPPoE username; without this the database catches the second one
        // on the real run but --dry-run would happily report it as creatable.
        $claimedCodes = [];
        $claimedUsers = [];

        foreach ($onus as $onu) {
            $sn = $this->pick($onu, self::SN_KEYS);
            if ($sn === null) {
                $skipped[] = ['(no serial)', 'ONU record has no serial number field'];

                continue;
            }

            // Create-only: withTrashed so a deleted customer is not resurrected.
            if (Customer::withTrashed()->where('smartolt_onu_sn', $sn)->exists()) {
                $known++;

                continue;
            }

            $code = $this->pick($onu, self::NAME_KEYS);
            if ($code === null) {
                $skipped[] = [$sn, 'ONU has no name to use as the customer code'];

                continue;
            }

            // Only ONUs that are actually authorised. Anything SmartOLT has
            // disabled is not a customer we should start billing for.
            $adminStatus = $this->pick($onu, ['administrative_status']);
            if ($adminStatus !== null && strcasecmp($adminStatus, 'Enabled') !== 0) {
                $skipped[] = [$sn, "ONU is \"{$adminStatus}\" in SmartOLT, not Enabled"];

                continue;
            }

            $username = $this->pick($onu, self::PPPOE_USER_KEYS);
            $password = $this->pick($onu, self::PPPOE_PASS_KEYS);
            if ($username === null || $password === null) {
                // e.g. wan_mode "Setup via ONU webpage" — no credentials to read.
                $skipped[] = [$sn, 'no PPPoE username/password in the ONU WAN setup'];

                continue;
            }

            // customer_code and username are unique; a clash means this ONU
            // maps onto someone who already exists under a different serial,
            // which is an operator decision, not something to guess at.
            if (isset($claimedCodes[$code])) {
                $skipped[] = [$sn, "customer code \"{$code}\" also used by ONU {$claimedCodes[$code]}"];

                continue;
            }
            if (isset($claimedUsers[$username])) {
                $skipped[] = [$sn, "PPPoE username \"{$username}\" also used by ONU {$claimedUsers[$username]}"];

                continue;
            }
            if (Customer::withTrashed()->where('customer_code', $code)->exists()) {
                $skipped[] = [$sn, "customer code \"{$code}\" already exists in billing"];

                continue;
            }
            if (Customer::withTrashed()->where('username', $username)->exists()) {
                $skipped[] = [$sn, "username \"{$username}\" already exists in billing"];

                continue;
            }

            $attributes = [
                'customer_code' => $code,
                'name' => $code, // the ONU name is the customer code; no separate name in SmartOLT
                'username' => $username,
                'radius_password' => $password,
                'status' => Customer::STATUS_PENDING,
                'smartolt_onu_sn' => $sn,
                'address' => $this->pick($onu, ['address']),
                'dn_zone' => $this->pick($onu, ['zone_name', 'zone']),
                'sn_odb' => $this->pick($onu, ['odb_name', 'odb']),
                'gps_location' => $this->gps($onu),
                'notes' => 'Imported from SmartOLT on '.now()->toDateString(),
            ];

            $rows[] = [$sn, $code, $username, $attributes['dn_zone'] ?? '—'];
            $claimedCodes[$code] = $sn;
            $claimedUsers[$username] = $sn;

            if (! $dryRun) {
                $customer = Customer::create($attributes);
                AuditLog::record('imported', $customer, [
                    'source' => 'smartolt',
                    'smartolt_onu_sn' => $sn,
                ]);
            }
            $created++;
        }

        if ($rows !== []) {
            $this->table(['ONU serial', 'Customer code', 'PPPoE username', 'Zone'], $rows);
        }

        if ($skipped !== []) {
            $this->newLine();
            $this->warn('Skipped '.count($skipped).' ONU(s):');
            $this->table(['ONU serial', 'Reason'], $skipped);
        }

        $this->newLine();
        $this->info($dryRun
            ? "Dry run: {$created} customer(s) would be created, {$known} already known."
            : "Imported {$created} customer(s) as pending, {$known} already known.");

        if ($created > 0 && ! $dryRun) {
            $this->line('Assign a service plan and activate them to provision RADIUS access.');
        }

        return self::SUCCESS;
    }

    /**
     * "lat,lng" for the customer record. SmartOLT keeps the two halves in
     * separate fields and leaves them null unless the ONU was placed on the
     * map, so a partial pair is no location at all.
     *
     * @param  array<string, mixed>  $onu
     */
    private function gps(array $onu): ?string
    {
        $lat = $this->pick($onu, ['latitude']);
        $lng = $this->pick($onu, ['longitude']);

        return $lat !== null && $lng !== null ? "{$lat},{$lng}" : null;
    }

    /**
     * First non-empty scalar value among $keys.
     *
     * @param  array<string, mixed>  $data
     * @param  array<int, string>  $keys
     */
    private function pick(array $data, array $keys): ?string
    {
        foreach ($keys as $key) {
            $value = $data[$key] ?? null;
            if (is_scalar($value) && trim((string) $value) !== '') {
                return trim((string) $value);
            }
        }

        return null;
    }
}
