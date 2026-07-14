<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Radius\Nas;
use App\Models\Radius\RadAcct;
use App\Models\Radius\RadCheck;
use App\Models\Radius\RadGroupCheck;
use App\Models\Radius\RadGroupReply;
use App\Models\Radius\RadReply;
use App\Models\Radius\RadUserGroup;
use App\Models\Router;
use App\Models\ServicePlan;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;

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

    /** Reply attributes owned by the plan group / provision(); anything else is left alone. */
    private const MANAGED_REPLY_ATTRIBUTES = [
        'Service-Type', 'Framed-Protocol', 'Framed-IP-Address', 'Framed-Pool',
        'Mikrotik-Rate-Limit',
        'Session-Timeout', 'Idle-Timeout', 'Acct-Interim-Interval',
    ];

    /**
     * Mirror a service plan into the FreeRADIUS group tables, so every
     * member of the plan's radius_group gets its attributes and edits
     * apply to all customers without re-provisioning each one.
     */
    public function syncPlanGroup(ServicePlan $plan, ?string $oldGroup = null): void
    {
        $group = $plan->radius_group;
        if (! $group) {
            return;
        }

        DB::connection('radius')->transaction(function () use ($plan, $group, $oldGroup) {
            if ($oldGroup && $oldGroup !== $group) {
                $this->deletePlanGroup($oldGroup);
                RadUserGroup::where('groupname', $oldGroup)->update(['groupname' => $group]);
            }

            RadGroupCheck::where('groupname', $group)->where('attribute', 'Simultaneous-Use')->delete();
            if ($plan->simultaneous_use) {
                RadGroupCheck::create([
                    'groupname' => $group,
                    'attribute' => 'Simultaneous-Use',
                    'op' => ':=',
                    'value' => (string) $plan->simultaneous_use,
                ]);
            }

            RadGroupReply::where('groupname', $group)
                ->whereIn('attribute', self::MANAGED_REPLY_ATTRIBUTES)
                ->delete();

            $replies = [
                ['Service-Type', '=', 'Framed-User'],
                ['Framed-Protocol', '=', 'PPP'],
                ['Mikrotik-Rate-Limit', ':=', $plan->rateLimit()],
            ];
            foreach ([
                'Framed-Pool' => $plan->framed_pool,
                'Session-Timeout' => $plan->session_timeout,
                'Idle-Timeout' => $plan->idle_timeout,
                'Acct-Interim-Interval' => $plan->acct_interim_interval,
            ] as $attribute => $value) {
                if ($value) {
                    $replies[] = [$attribute, ':=', (string) $value];
                }
            }

            foreach ($replies as [$attribute, $op, $value]) {
                RadGroupReply::create([
                    'groupname' => $group,
                    'attribute' => $attribute,
                    'op' => $op,
                    'value' => $value,
                ]);
            }
        });
    }

    /** Remove a plan's group attribute rows (e.g. on plan delete). */
    public function deletePlanGroup(string $group): void
    {
        RadGroupReply::where('groupname', $group)->whereIn('attribute', self::MANAGED_REPLY_ATTRIBUTES)->delete();
        RadGroupCheck::where('groupname', $group)->where('attribute', 'Simultaneous-Use')->delete();
    }

    /**
     * Create or refresh radcheck/radreply rows for a customer.
     *
     * Plan attributes live on the plan's RADIUS group (syncPlanGroup);
     * the user rows carry only the password, group membership, and the
     * optional static Framed-IP-Address override.
     */
    public function provision(Customer $customer): void
    {
        $customer->loadMissing('servicePlan');
        $plan = $customer->servicePlan;
        $username = $customer->username;

        DB::connection('radius')->transaction(function () use ($customer, $plan, $username) {
            // Authentication
            RadCheck::where('username', $username)
                ->whereIn('attribute', ['Cleartext-Password', 'Simultaneous-Use'])
                ->delete();
            RadCheck::create([
                'username' => $username,
                'attribute' => 'Cleartext-Password',
                'op' => ':=',
                'value' => $customer->radius_password,
            ]);

            // Per-user replies: only the static IP; the rest comes from the group
            RadReply::where('username', $username)
                ->whereIn('attribute', self::MANAGED_REPLY_ATTRIBUTES)
                ->delete();
            if ($customer->framed_ip_address) {
                RadReply::create([
                    'username' => $username,
                    'attribute' => 'Framed-IP-Address',
                    'op' => ':=',
                    'value' => $customer->framed_ip_address,
                ]);
            }

            if ($plan) {
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
                    $q->where('username', 'like', $like)
                        ->orWhere('framedipaddress', 'like', $like)
                        ->orWhere('callingstationid', 'like', $like);
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

    /**
     * Keep the FreeRADIUS nas table in sync with a billing router.
     *
     * Pass $reload = false to skip the FreeRADIUS restart when syncing many
     * routers at once (e.g. seeding); call reloadServer() once afterwards.
     *
     * Returns the reload outcome so callers can warn the operator: true when
     * FreeRADIUS restarted, false when the reload command failed, null when no
     * reload was attempted (no nas_ip, reload skipped, or reload disabled).
     */
    public function syncNas(Router $router, bool $reload = true, ?string $previousNasIp = null): ?bool
    {
        $changed = false;

        // The nas table is keyed by IP, so re-pointing a router at a new
        // address would otherwise leave the old one behind as a still-valid
        // client — it would keep authenticating with the same secret.
        // Callers pass the pre-update value; store/seed have none.
        if ($previousNasIp && $previousNasIp !== $router->nas_ip) {
            Nas::where('nasname', $previousNasIp)->delete();
            $changed = true;
        }

        if ($router->nas_ip) {
            Nas::updateOrCreate(
                ['nasname' => $router->nas_ip],
                [
                    'shortname' => $router->name,
                    'type' => 'other',
                    'secret' => $router->radius_secret ?: 'secret',
                    'description' => 'Managed by ISP Billing',
                ],
            );
            $changed = true;
        }

        if (! $changed) {
            return null;
        }

        return $reload ? $this->reloadServer() : null;
    }

    /**
     * Drop a router's NAS client from FreeRADIUS.
     *
     * Deleting the router alone is not enough: the nas row would survive, and
     * a decommissioned router would keep authenticating customers until the
     * next restart. Reloads for the same reason syncNas() does — FreeRADIUS
     * only reads its SQL clients at startup.
     *
     * Returns the reload outcome (see syncNas()).
     */
    public function removeNas(Router $router, bool $reload = true): ?bool
    {
        if (! $router->nas_ip) {
            return null;
        }

        Nas::where('nasname', $router->nas_ip)->delete();

        return $reload ? $this->reloadServer() : null;
    }

    /**
     * Restart FreeRADIUS so it re-reads its SQL clients from the nas table.
     *
     * FreeRADIUS only loads clients at startup, so a new or edited NAS is
     * invisible to the running server until it restarts (a reload/HUP does
     * not re-read the nas table). Best-effort: failures are logged but never
     * thrown, so saving a router still succeeds if the reload can't run.
     *
     * Returns true on success, false on failure, or null when no reload
     * command is configured (the integration is disabled).
     */
    public function reloadServer(): ?bool
    {
        $command = trim((string) config('services.radius.reload_command'));
        if ($command === '') {
            return null;
        }

        // Best-effort: a non-zero exit returns a result, but an unlaunchable
        // command (sudo/systemctl missing) or a hung restart throws — catch
        // both so saving a router never fails on the reload.
        try {
            $result = Process::timeout(15)->run($command);
        } catch (\Throwable $e) {
            Log::warning('FreeRADIUS reload command could not run; new NAS clients will not be active until it restarts.', [
                'command' => $command,
                'error' => $e->getMessage(),
            ]);

            return false;
        }

        if (! $result->successful()) {
            Log::warning('FreeRADIUS reload failed; new NAS clients will not be active until it restarts.', [
                'command' => $command,
                'exit_code' => $result->exitCode(),
                'error' => trim($result->errorOutput() ?: $result->output()),
            ]);
        }

        return $result->successful();
    }

    /**
     * Kick the user's live sessions with RADIUS Disconnect-Requests
     * (RFC 5176) so suspension/plan changes apply immediately.
     *
     * When $router is given only sessions on that NAS are targeted;
     * otherwise the NAS is resolved per session from radacct.
     */
    public function disconnectUser(string $username, ?Router $router = null): bool
    {
        $sessions = RadAcct::online()
            ->where('username', $username)
            ->when($router?->nas_ip, fn ($q, $nasIp) => $q->where('nasipaddress', $nasIp))
            ->get();

        $sent = false;
        foreach ($sessions as $session) {
            $nas = $router ?? Router::where('nas_ip', $session->nasipaddress)->first();
            if (! $nas?->nas_ip || ! $nas->radius_secret) {
                continue;
            }

            $clean = fn (?string $v) => str_replace(['"', "\n", "\r"], '', (string) $v);
            $attrs = "User-Name = \"{$clean($username)}\"\n"
                ."Acct-Session-Id = \"{$clean($session->acctsessionid)}\"";
            if ($session->framedipaddress) {
                $attrs .= "\nFramed-IP-Address = {$clean($session->framedipaddress)}";
            }

            $result = Process::input($attrs)->run([
                'radclient', '-r', '2', '-t', '3',
                "{$nas->nas_ip}:{$nas->coa_port}", 'disconnect', $nas->radius_secret,
            ]);

            $sent = $sent || $result->successful();
        }

        return $sent;
    }

    /**
     * Connectivity check for a NAS: ICMP ping plus a RADIUS
     * Disconnect-Request probe with a bogus session. Any reply
     * (ACK or NAK) proves the CoA port is open and the shared
     * secret matches — RADIUS silently drops bad-secret packets.
     *
     * @return array{ping: bool, coa: bool, online_sessions: int}
     */
    public function probeNas(Router $router): array
    {
        $ping = Process::run(['ping', '-c', '1', '-W', '2', $router->nas_ip])->successful();

        $probe = Process::input("User-Name = \"billing-probe\"\nAcct-Session-Id = \"00000000\"")
            ->run([
                'radclient', '-r', '1', '-t', '3',
                "{$router->nas_ip}:{$router->coa_port}", 'disconnect', $router->radius_secret ?: 'secret',
            ]);
        $coa = str_contains($probe->output().$probe->errorOutput(), 'Received Disconnect');

        return [
            'ping' => $ping,
            'coa' => $coa,
            'online_sessions' => RadAcct::online()->where('nasipaddress', $router->nas_ip)->count(),
        ];
    }

    /**
     * Per-NAS view from radacct: online session count and last
     * accounting activity, keyed by NAS IP.
     *
     * @return array{online: Collection<string, int>, last_seen: Collection<string, string>}
     */
    public function nasActivity(): array
    {
        $online = RadAcct::online()
            ->selectRaw('nasipaddress, COUNT(*) AS sessions')
            ->groupBy('nasipaddress')
            ->pluck('sessions', 'nasipaddress');

        $lastSeen = RadAcct::query()
            ->selectRaw('nasipaddress, MAX(COALESCE(acctupdatetime, acctstarttime)) AS seen')
            ->groupBy('nasipaddress')
            ->pluck('seen', 'nasipaddress');

        return ['online' => $online, 'last_seen' => $lastSeen];
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
