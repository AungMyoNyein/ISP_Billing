<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * SMTP credentials live in settings so an operator can change them from the
 * UI without editing .env and restarting the service. They are applied to the
 * mail config at send time.
 *
 * The password is encrypted at rest with the app key and never leaves the API
 * — SettingController strips it from reads. Settings hold the truth only when
 * a host is configured; otherwise .env wins, which keeps the default
 * MAIL_MAILER=log behaviour for an install nobody has configured yet.
 */
class MailSettingsService
{
    public const PASSWORD_KEY = 'mail.password';

    /** Keys the API may never hand back, whatever it was asked for. */
    public const SECRET_KEYS = [self::PASSWORD_KEY];

    public function configured(): bool
    {
        return filled(Setting::getValue('mail.host'));
    }

    /** Push the stored SMTP settings into the mail config for this process. */
    public function apply(): void
    {
        if (! $this->configured()) {
            return;
        }

        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp.host', Setting::getValue('mail.host'));
        Config::set('mail.mailers.smtp.port', (int) Setting::getValue('mail.port', 587));
        Config::set('mail.mailers.smtp.username', Setting::getValue('mail.username') ?: null);
        Config::set('mail.mailers.smtp.password', $this->password());

        // 'tls'/'ssl', or null to let the transport negotiate STARTTLS
        $scheme = Setting::getValue('mail.encryption');
        Config::set('mail.mailers.smtp.scheme', $scheme ?: null);

        $from = Setting::getValue('mail.from_address');
        if (filled($from)) {
            Config::set('mail.from.address', $from);
            Config::set('mail.from.name', Setting::getValue('mail.from_name') ?: config('app.name'));
        }

        // the mailer is resolved once per process and would otherwise keep the
        // transport it was built with before this ran
        Mail::purge('smtp');
    }

    public function password(): ?string
    {
        $stored = Setting::getValue(self::PASSWORD_KEY);

        if (blank($stored)) {
            return null;
        }

        try {
            return Crypt::decryptString($stored);
        } catch (\Throwable $e) {
            // a value written before encryption, or after an APP_KEY change
            Log::warning('Stored SMTP password could not be decrypted.', ['error' => $e->getMessage()]);

            return null;
        }
    }

    public function encryptPassword(string $plain): string
    {
        return Crypt::encryptString($plain);
    }

    /** @return array<int, string> the configured report recipients */
    public function recipients(): array
    {
        $raw = (string) Setting::getValue('reports.email.recipients', '');

        return collect(preg_split('/[,;\s]+/', $raw) ?: [])
            ->filter(fn ($a) => filter_var($a, FILTER_VALIDATE_EMAIL))
            ->values()
            ->all();
    }
}
