<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Role;
use App\Models\Router;
use App\Models\ServicePlan;
use App\Models\User;
use App\Services\RadiusService;
use Database\Seeders\Concerns\RevivesTrashed;
use Illuminate\Database\Seeder;

/**
 * Demo fixture: two extra user accounts, two routers, 25 customers with
 * billing history, and the radacct rows that give the dashboard and the
 * bandwidth usage tab something to draw.
 *
 * Never runs as part of `db:seed` — it has to be asked for:
 *
 *     php artisan db:seed --class=DemoSeeder
 *     ./install.sh --demo
 *
 * It writes real RADIUS provisioning rows for every customer it invents, so
 * it must not touch a production database. Run DatabaseSeeder first; this
 * one expects the roles and service plans to exist.
 */
class DemoSeeder extends Seeder
{
    use RevivesTrashed;

    public function run(): void
    {
        $radius = app(RadiusService::class);

        // ---- Demo users ----------------------------------------------
        $accounts = [
            ['manager@isp.local', 'Billing Manager', 'manager12345', 'Manager'],
            ['operator@isp.local', 'Front Desk Operator', 'operator12345', 'Operator'],
        ];
        foreach ($accounts as [$email, $name, $password, $role]) {
            User::firstOrCreate(['email' => $email], [
                'name' => $name,
                'password' => $password,
                'role_id' => Role::where('name', $role)->value('id'),
                'is_active' => true,
            ]);
        }

        // ---- Demo routers --------------------------------------------
        $routers = collect([
            ['name' => 'Core-Yangon', 'nas_ip' => '10.0.0.1'],
            ['name' => 'Edge-Mandalay', 'nas_ip' => '10.0.1.1'],
        ])->map(fn (array $r) => $this->reviveOrCreate(Router::class, ['name' => $r['name']], [
            'nas_ip' => $r['nas_ip'],
            'coa_port' => 3799,
            'radius_secret' => 'radius-secret',
        ]));

        foreach ($routers as $router) {
            $radius->syncNas($router, reload: false);
        }
        $radius->reloadServer();

        // ---- Customers + billing history ----------------------------
        if (Customer::count() > 0) {
            return; // sample data only on a fresh database
        }

        $plans = ServicePlan::orderBy('id')->get();
        if ($plans->isEmpty()) {
            $this->command?->warn('No service plans — run DatabaseSeeder first. Skipping demo customers.');

            return;
        }

        $zones = ['YGN-North', 'YGN-South', 'MDY-Central'];
        $statuses = [
            Customer::STATUS_ACTIVE, Customer::STATUS_ACTIVE, Customer::STATUS_ACTIVE,
            Customer::STATUS_ACTIVE, Customer::STATUS_ACTIVE, Customer::STATUS_ACTIVE,
            Customer::STATUS_SUSPENDED, Customer::STATUS_EXPIRED, Customer::STATUS_PENDING,
        ];

        $names = [
            'Aung Myo Nyein', 'Khin Su Hlaing', 'Zaw Lin Htet', 'May Thazin Oo', 'Kyaw Zin Thant',
            'Hnin Ei Phyu', 'Thura Soe', 'Nandar Win', 'Sai Kyaw Han', 'Ei Mon Kyaw',
            'Min Khant Kyaw', 'Su Myat Noe', 'Htet Aung Lin', 'Yoon Shwe Yi', 'Pyae Sone Aung',
            'Thiri Hlaing', 'Aung Kaung Myat', 'Shwe Sin Win', 'Naing Lin Aung', 'Chaw Su Khin',
            'Hein Min Thu', 'Moe Pwint Phyu', 'Kaung Sett Paing', 'Nay Chi Lin', 'Zin Mar Aye',
        ];

        foreach ($names as $i => $name) {
            $n = $i + 1;
            $plan = $plans[$i % $plans->count()];
            $status = $statuses[$i % count($statuses)];
            $createdAt = now()->subDays(rand(0, 180));
            $expiry = match ($status) {
                Customer::STATUS_ACTIVE => now()->addDays(rand(1, 30)),
                Customer::STATUS_SUSPENDED => now()->subDays(rand(1, 10)),
                Customer::STATUS_EXPIRED => now()->subDays(rand(1, 20)),
                default => null,
            };

            $customer = Customer::create([
                'customer_code' => 'CUST-'.str_pad((string) $n, 4, '0', STR_PAD_LEFT),
                'username' => 'pppoe'.str_pad((string) $n, 4, '0', STR_PAD_LEFT),
                'radius_password' => 'pass'.str_pad((string) $n, 4, '0', STR_PAD_LEFT),
                'name' => $name,
                'phone' => '09'.rand(400000000, 999999999),
                'address' => 'No. '.rand(1, 200).', Street '.rand(1, 80).', Township '.rand(1, 12),
                'dn_zone' => $zones[$i % count($zones)],
                'sn_odb' => 'ODB-'.chr(65 + ($i % 6)).'-'.str_pad((string) rand(1, 24), 2, '0', STR_PAD_LEFT),
                'gps_location' => round(16.7 + mt_rand(-500, 500) / 10000, 6).','.round(96.1 + mt_rand(-500, 500) / 10000, 6),
                'status' => $status,
                'service_plan_id' => $plan->id,
                'router_id' => $routers[$i % $routers->count()]->id,
                'activation_date' => $createdAt->toDateString(),
                'expiry_date' => $expiry?->toDateString(),
                'created_at' => $createdAt,
                'notes' => $i % 7 === 0 ? 'VIP customer — call before any maintenance.' : null,
            ]);

            // RADIUS provisioning mirrors customer state
            $radius->provision($customer);
            if (in_array($status, [Customer::STATUS_SUSPENDED, Customer::STATUS_EXPIRED], true)) {
                $radius->suspend($customer);
            }

            // Billing history: one paid invoice in the past + current one
            if ($status !== Customer::STATUS_PENDING) {
                $billingDate = now()->subDays(rand(25, 40));
                $paidInvoice = Invoice::create([
                    'invoice_number' => Invoice::nextNumber(),
                    'customer_id' => $customer->id,
                    'service_plan_id' => $plan->id,
                    'amount' => $plan->price,
                    'billing_date' => $billingDate->toDateString(),
                    'due_date' => $billingDate->copy()->addDays(5)->toDateString(),
                    'status' => Invoice::STATUS_PAID,
                    'paid_at' => $billingDate->copy()->addDays(rand(0, 4)),
                    'period_start' => $billingDate->toDateString(),
                    'period_end' => $billingDate->copy()->addDays(30)->toDateString(),
                ]);
                Payment::create([
                    'payment_number' => Payment::nextNumber(),
                    'invoice_id' => $paidInvoice->id,
                    'customer_id' => $customer->id,
                    'amount' => $plan->price,
                    'method' => ['cash', 'bank_transfer', 'mobile_money'][rand(0, 2)],
                    'paid_at' => $paidInvoice->paid_at,
                ]);

                $currentStatus = match ($status) {
                    Customer::STATUS_SUSPENDED, Customer::STATUS_EXPIRED => Invoice::STATUS_SUSPENDED,
                    default => rand(0, 2) === 0 ? Invoice::STATUS_UNPAID : Invoice::STATUS_PAID,
                };
                $currentBilling = now()->subDays(rand(0, 10));
                $current = Invoice::create([
                    'invoice_number' => Invoice::nextNumber(),
                    'customer_id' => $customer->id,
                    'service_plan_id' => $plan->id,
                    'amount' => $plan->price,
                    'billing_date' => $currentBilling->toDateString(),
                    'due_date' => $currentBilling->copy()->addDays(5)->toDateString(),
                    'status' => $currentStatus,
                    'paid_at' => $currentStatus === Invoice::STATUS_PAID ? $currentBilling->copy()->addDays(1) : null,
                    'period_start' => $currentBilling->toDateString(),
                    'period_end' => $currentBilling->copy()->addDays(30)->toDateString(),
                ]);
                if ($currentStatus === Invoice::STATUS_PAID) {
                    Payment::create([
                        'payment_number' => Payment::nextNumber(),
                        'invoice_id' => $current->id,
                        'customer_id' => $customer->id,
                        'amount' => $plan->price,
                        'method' => ['cash', 'bank_transfer', 'mobile_money'][rand(0, 2)],
                        'paid_at' => $current->paid_at,
                    ]);
                }
            }
        }

        $this->call(RadAcctSeeder::class);
    }
}
