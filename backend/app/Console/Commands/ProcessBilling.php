<?php

namespace App\Console\Commands;

use App\Services\BillingService;
use Illuminate\Console\Command;

class ProcessBilling extends Command
{
    protected $signature = 'billing:process';

    protected $description = 'Suspend customers with overdue unpaid invoices and expire past-due customers (disables RADIUS access)';

    public function handle(BillingService $billing): int
    {
        $result = $billing->processOverdueAndExpiry();

        $this->info("Suspended {$result['suspended']} customer(s), expired {$result['expired']} customer(s).");

        return self::SUCCESS;
    }
}
