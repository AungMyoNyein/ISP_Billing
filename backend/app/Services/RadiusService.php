<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Radius\Nas;
use App\Models\Radius\RadAcct;
use App\Models\Radius\RadCheck;
use App\Models\Radius\RadReply;
use App\Models\Radius\RadUserGroup;
use App\Models\Router;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Provisions billing customers into the FreeRADIUS SQL schema.
 *
 * Suspension model: a "suspended" radusergroup entry plus an
 * Auth-Type := Reject radcheck row, so the NAS denies the next
 * authentication while accounting history stays intact.
 */
class RadiusService
{
    public const SUSPENDED_GROUP = 'suspended';

    /** Create or refresh radcheck/radreply rows for a customer. */
    public function provision(Customer $customer): void
    {
        $customer->loadMissing('servicePlan');
        $plan = $customer->servicePlan;
        $username = $customer->username;

        DB::connection('radius')->transaction(function () use ($customer, $plan, $username) {
            // Authentication
            RadCheck::where('username', $username)->where('attribute', 'Cleartext-Password')->delete();
            RadCheck::create([
                'username' => $username,
                'attribute' => 'Cleartext-Password',
                'op' => ':=',
                'value' => $customer->radius_password,
            ]);

            // Reply attributes from the service plan
            RadReply::where('username', $username)
                ->whereIn('attribute', ['Mikrotik-Rate-Limit', 'Session-Timeout', 'Idle-Timeout'])
                ->delete();

            if ($plan) {
                RadReply::create([
                    'username' => $username,
                    'attribute' => 'Mikrotik-Rate-Limit',
                    'op' => '=',
                    'value' => $plan->rateLimit(),
                ]);

                if ($plan->session_timeout) {
                    RadReply::create([
                        'username' => $username,
                        'attribute' => 'Session-Timeout',
                        'op' => '=',
                        'value' => (string) $plan->session_timeout,
                    ]);
                }

                if ($plan->idle_timeout) {
                    RadReply::create([
                        'username' => $username,
                        'attribute' => 'Idle-Timeout',
                        'op' => '=',
                        'value' => (string) $plan->idle_timeout,
                    ]);
                }

                RadUserGroup::where('username', $username)
                    ->where('groupname', '!=', self::SUSPENDED_GROUP)
                    ->delete();
                if ($plan->radius_group) {
                    RadUserGroup::create([
                        'username' => $username,
                        'groupname' => $plan->radius_group,
                        'priority' => 10,
                    ]);
                }
            }
        });
    }

    /** Block authentication for the user (Suspension rule). */
    public function suspend(Customer $customer): void
    {
        $username = $customer->username;

        DB::connection('radius')->transaction(function () use ($username) {
            RadCheck::firstOrCreate(
                ['username' => $username, 'attribute' => 'Auth-Type'],
                ['op' => ':=', 'value' => 'Reject'],
            );
            RadUserGroup::firstOrCreate(
                ['username' => $username, 'groupname' => self::SUSPENDED_GROUP],
                ['priority' => 1],
            );
        });
    }

    /** Re-enable authentication (Reconnection rule). */
    public function reconnect(Customer $customer): void
    {
        $username = $customer->username;

        DB::connection('radius')->transaction(function () use ($username) {
            RadCheck::where('username', $username)->where('attribute', 'Auth-Type')->delete();
            RadUserGroup::where('username', $username)->where('groupname', self::SUSPENDED_GROUP)->delete();
        });
    }

    public function isSuspended(Customer $customer): bool
    {
        return RadCheck::where('username', $customer->username)
            ->where('attribute', 'Auth-Type')
            ->where('value', 'Reject')
            ->exists();
    }

    /** Remove all RADIUS provisioning for the user. */
    public function deprovision(string $username): void
    {
        DB::connection('radius')->transaction(function () use ($username) {
            RadCheck::where('username', $username)->delete();
            RadReply::where('username', $username)->delete();
            RadUserGroup::where('username', $username)->delete();
        });
    }

    /** Rename a RADIUS user when the billing username changes. */
    public function rename(string $oldUsername, string $newUsername): void
    {
        DB::connection('radius')->transaction(function () use ($oldUsername, $newUsername) {
            RadCheck::where('username', $oldUsername)->update(['username' => $newUsername]);
            RadReply::where('username', $oldUsername)->update(['username' => $newUsername]);
            RadUserGroup::where('username', $oldUsername)->update(['username' => $newUsername]);
        });
    }

    /** Currently online sessions (radacct rows without a stop time). */
    public function onlineSessions(?string $search = null): Collection
    {
        return RadAcct::online()
            ->when($search, function ($q, $search) {
                $q->where(function ($q) use ($search) {
                    $like = '%'.$search.'%';
                    $q->where('username', 'ilike', $like)
                        ->orWhere('framedipaddress', 'ilike', $like)
                        ->orWhere('callingstationid', 'ilike', $like);
                });
            })
            ->orderByDesc('acctstarttime')
            ->get();
    }

    public function onlineCount(): int
    {
        return RadAcct::online()->distinct('username')->count('username');
    }

    public function isOnline(string $username): bool
    {
        return RadAcct::online()->where('username', $username)->exists();
    }

    /**
     * Daily bandwidth usage for a customer over the last N days,
     * aggregated from radacct.
     *
     * @return array<int, array{date: string, download_bytes: int, upload_bytes: int, sessions: int}>
     */
    public function dailyUsage(string $username, int $days = 30): array
    {
        $rows = RadAcct::query()
            ->selectRaw('DATE(acctstarttime) as date')
            ->selectRaw('COALESCE(SUM(acctoutputoctets), 0) as download_bytes')
            ->selectRaw('COALESCE(SUM(acctinputoctets), 0) as upload_bytes')
            ->selectRaw('COUNT(*) as sessions')
            ->where('username', $username)
            ->where('acctstarttime', '>=', now()->subDays($days)->startOfDay())
            ->groupBy(DB::raw('DATE(acctstarttime)'))
            ->orderBy('date')
            ->get();

        return $rows->map(fn ($r) => [
            'date' => (string) $r->date,
            'download_bytes' => (int) $r->download_bytes,
            'upload_bytes' => (int) $r->upload_bytes,
            'sessions' => (int) $r->sessions,
        ])->all();
    }

    /** Recent sessions for a customer (for the usage tab). */
    public function recentSessions(string $username, int $limit = 25): Collection
    {
        return RadAcct::where('username', $username)
            ->orderByDesc('acctstarttime')
            ->limit($limit)
            ->get();
    }

    /** Keep the FreeRADIUS nas table in sync with a billing router. */
    public function syncNas(Router $router): void
    {
        if (! $router->nas_ip) {
            return;
        }

        Nas::updateOrCreate(
            ['nasname' => $router->nas_ip],
            [
                'shortname' => $router->name,
                'type' => 'mikrotik',
                'secret' => $router->radius_secret ?: 'secret',
                'description' => 'Managed by ISP Billing',
            ],
        );
    }

    public function healthy(): bool
    {
        try {
            DB::connection('radius')->select('select 1');

            return true;
        } catch (\Throwable) {
            return false;
        }
    }
}
