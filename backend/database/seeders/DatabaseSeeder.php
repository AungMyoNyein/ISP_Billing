<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\ServicePlan;
use App\Models\Setting;
use App\Models\User;
use App\Services\RadiusService;
use Database\Seeders\Concerns\RevivesTrashed;
use Illuminate\Database\Seeder;

/**
 * Baseline data every install needs: roles, default settings, the service
 * plan catalogue, and one administrator to log in with.
 *
 * Nothing here is demo data — no sample customers, no demo routers, no
 * extra user accounts. Those live in DemoSeeder and are only created when
 * it is asked for by name.
 *
 * Safe to run against a live database. Every write is create-if-absent, so
 * re-running it (which install.sh does on every re-install) cannot reset a
 * changed admin password, overwrite the company letterhead, or roll back
 * permissions an operator edited in the Roles screen.
 */
class DatabaseSeeder extends Seeder
{
    use RevivesTrashed;

    public function run(): void
    {
        // ---- Roles -------------------------------------------------
        // firstOrCreate, not updateOrCreate: these are editable in the UI,
        // and a seeder has no business silently rewriting authorisation
        // rules on a running system.
        Role::firstOrCreate(['name' => 'Administrator'], [
            'description' => 'Full access to every module',
            'permissions' => ['*'],
            'is_system' => true,
        ]);
        Role::firstOrCreate(['name' => 'Manager'], [
            'description' => 'Manage customers, plans and billing',
            'permissions' => [
                'customers.view', 'customers.manage', 'plans.view', 'plans.manage',
                'billing.view', 'billing.manage', 'network.view',
                'support.view', 'support.manage', 'reports.view',
            ],
        ]);
        Role::firstOrCreate(['name' => 'Operator'], [
            'description' => 'Day-to-day billing entry and customer support',
            'permissions' => [
                'customers.view', 'billing.view', 'billing.manage', 'network.view',
                'support.view', 'support.manage',
            ],
        ]);
        Role::firstOrCreate(['name' => 'Viewer'], [
            'description' => 'Read-only access',
            'permissions' => [
                'customers.view', 'plans.view', 'billing.view', 'network.view',
                'support.view', 'reports.view',
            ],
        ]);

        // ---- Administrator ------------------------------------------
        // Only when the system has no users at all. Re-seeding an install
        // whose admin password was changed must not put admin12345 back.
        if (User::count() === 0) {
            User::create([
                'name' => 'System Administrator',
                'email' => 'admin@isp.local',
                'password' => 'admin12345',
                'role_id' => Role::where('name', 'Administrator')->value('id'),
                'is_active' => true,
            ]);
            $this->command?->warn('Created admin@isp.local / admin12345 — change this password before going live.');
        }

        // ---- Settings ----------------------------------------------
        // Seeded only when the key is absent: these are edited under System
        // Settings, and setValue() would overwrite the operator's values.
        $defaults = [
            ['company.name', 'Demo ISP Ltd.', 'company'],
            ['company.currency', 'MMK', 'company'],
            // letterhead shown on printed invoices
            ['company.address', '', 'company'],
            ['company.phone', '', 'company'],
            ['company.email', '', 'company'],
            ['company.logo', null, 'company'],
            ['company.slogan', '', 'company'],
            ['billing.due_days', 5, 'billing'],
            ['billing.auto_suspend', true, 'billing'],
        ];
        foreach ($defaults as [$key, $value, $group]) {
            Setting::where('key', $key)->exists() || Setting::setValue($key, $value, $group);
        }

        // ---- Service plans ------------------------------------------
        $plans = collect([
            ['name' => 'Home 10M', 'price' => 15000, 'down' => 10240, 'up' => 10240],
            ['name' => 'Home 20M', 'price' => 25000, 'down' => 20480, 'up' => 20480],
            ['name' => 'Home 40M', 'price' => 40000, 'down' => 40960, 'up' => 40960],
            ['name' => 'Business 60M', 'price' => 75000, 'down' => 61440, 'up' => 61440],
            ['name' => 'Business 100M', 'price' => 120000, 'down' => 102400, 'up' => 102400],
        ])->map(fn (array $p) => $this->reviveOrCreate(ServicePlan::class, ['name' => $p['name']], [
            'price' => $p['price'],
            'download_speed_kbps' => $p['down'],
            'upload_speed_kbps' => $p['up'],
            'session_timeout' => 0,
            'idle_timeout' => 300,
            'validity_days' => 30,
            'radius_group' => str($p['name'])->slug()->toString(),
            'is_active' => true,
        ]));

        $radius = app(RadiusService::class);
        foreach ($plans as $plan) {
            $radius->syncPlanGroup($plan);
        }
    }
}
