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
