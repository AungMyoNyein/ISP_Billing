<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Enforce the billing rules every hour: unpaid invoices past due date
// suspend the customer and disable RADIUS access; expired customers
// are marked expired and disconnected.
Schedule::command('billing:process')->hourly();

// Import ONUs authorised in SmartOLT as pending customers. No-op unless
// SMARTOLT_BASE_URL / SMARTOLT_API_KEY are set; create-only, so a slow or
// failed run never half-writes anything.
Schedule::command('smartolt:sync')->hourly()->withoutOverlapping();

// nothing else trims the RADIUS log tables; run it off-peak
Schedule::command('radius:prune')->dailyAt('03:15')->withoutOverlapping();
