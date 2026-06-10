<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\Radius\RadAcct;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Sample radacct rows: 30 days of session history per customer and a
 * live (open) session for most active customers, so Online Session
 * Monitoring and the bandwidth usage tab have data to show.
 */
class RadAcctSeeder extends Seeder
{
    public function run(): void
    {
        if (RadAcct::count() > 0) {
            return;
        }

        $customers = Customer::with('router')->get();

        foreach ($customers as $i => $customer) {
            if ($customer->status === Customer::STATUS_PENDING) {
                continue;
            }

            $nasIp = $customer->router?->nas_ip ?? '10.0.0.1';
            $mac = strtoupper(implode(':', array_map(fn () => sprintf('%02x', rand(0, 255)), range(1, 6))));
            $ip = '100.64.'.rand(0, 50).'.'.rand(2, 254);

            // History: one session per day for the last 30 days.
            for ($d = 30; $d >= 1; $d--) {
                $start = now()->subDays($d)->setTime(rand(6, 12), rand(0, 59));
                $duration = rand(3600, 64800);

                RadAcct::create([
                    'acctsessionid' => Str::random(16),
                    'acctuniqueid' => Str::random(32),
                    'username' => $customer->username,
                    'nasipaddress' => $nasIp,
                    'nasporttype' => 'Ethernet',
                    'acctstarttime' => $start,
                    'acctupdatetime' => $start->copy()->addSeconds($duration),
                    'acctstoptime' => $start->copy()->addSeconds($duration),
                    'acctsessiontime' => $duration,
                    'acctinputoctets' => rand(50, 800) * 1024 * 1024,           // upload
                    'acctoutputoctets' => rand(500, 8000) * 1024 * 1024,        // download
                    'calledstationid' => 'pppoe-server',
                    'callingstationid' => $mac,
                    'acctterminatecause' => 'User-Request',
                    'servicetype' => 'Framed-User',
                    'framedprotocol' => 'PPP',
                    'framedipaddress' => $ip,
                ]);
            }

            // Live session for ~80% of active customers.
            if ($customer->status === Customer::STATUS_ACTIVE && $i % 5 !== 0) {
                $start = now()->subMinutes(rand(10, 600));
                RadAcct::create([
                    'acctsessionid' => Str::random(16),
                    'acctuniqueid' => Str::random(32),
                    'username' => $customer->username,
                    'nasipaddress' => $nasIp,
                    'nasporttype' => 'Ethernet',
                    'acctstarttime' => $start,
                    'acctupdatetime' => now(),
                    'acctstoptime' => null,
                    'acctsessiontime' => (int) abs(now()->diffInSeconds($start)),
                    'acctinputoctets' => rand(10, 300) * 1024 * 1024,
                    'acctoutputoctets' => rand(100, 3000) * 1024 * 1024,
                    'calledstationid' => 'pppoe-server',
                    'callingstationid' => $mac,
                    'servicetype' => 'Framed-User',
                    'framedprotocol' => 'PPP',
                    'framedipaddress' => $ip,
                ]);
            }
        }
    }
}
