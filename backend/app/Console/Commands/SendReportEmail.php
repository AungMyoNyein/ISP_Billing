<?php

namespace App\Console\Commands;

use App\Mail\ReportDigestMail;
use App\Models\Setting;
use App\Services\MailSettingsService;
use App\Services\ReportDigestService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Emails the summary report. The scheduler runs this once a day and the
 * command decides whether today is a send day, rather than registering three
 * schedule entries — the frequency lives in settings, which the scheduler
 * cannot read at boot without a database round trip on every tick.
 */
class SendReportEmail extends Command
{
    protected $signature = 'reports:email
        {--frequency= : daily|weekly|monthly, overriding the configured setting}
        {--to=* : Send to these addresses instead of the configured recipients}
        {--force : Send even when today is not a scheduled send day}';

    protected $description = 'Email the daily, weekly or monthly summary report';

    public function handle(ReportDigestService $digests, MailSettingsService $mailSettings): int
    {
        $frequency = (string) ($this->option('frequency') ?: Setting::getValue('reports.email.frequency', 'daily'));

        if (! in_array($frequency, ['daily', 'weekly', 'monthly'], true)) {
            $this->error("Unknown frequency [{$frequency}].");

            return self::FAILURE;
        }

        $recipients = $this->option('to') ?: $mailSettings->recipients();
        $forced = (bool) $this->option('force') || $this->option('to');

        if (! $forced && ! Setting::getValue('reports.email.enabled', false)) {
            $this->line('Report email is disabled in settings — nothing sent.');

            return self::SUCCESS;
        }

        if (! $forced && ! $this->isSendDay($frequency)) {
            $this->line("Not a {$frequency} send day — nothing sent.");

            return self::SUCCESS;
        }

        if ($recipients === []) {
            $this->warn('No valid recipients configured — nothing sent.');

            return self::SUCCESS;
        }

        $mailSettings->apply();
        $digest = $digests->build($frequency);

        try {
            Mail::to($recipients)->send(new ReportDigestMail($digest));
        } catch (\Throwable $e) {
            // surfaced loudly: a silent failure here means nobody notices the
            // reports stopped arriving until someone asks for one
            Log::error('Report email failed to send.', ['error' => $e->getMessage(), 'frequency' => $frequency]);
            $this->error('Sending failed: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info(sprintf(
            'Sent the %s report (%s) to %s.',
            $frequency, $digest['period_label'], implode(', ', $recipients),
        ));

        return self::SUCCESS;
    }

    /** Daily every day, weekly on Mondays, monthly on the 1st. */
    private function isSendDay(string $frequency): bool
    {
        return match ($frequency) {
            'weekly' => now()->isMonday(),
            'monthly' => now()->day === 1,
            default => true,
        };
    }
}
