<?php

namespace App\Mail;

use App\Models\Setting;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ReportDigestMail extends Mailable
{
    use Queueable, SerializesModels;

    /** @param array<string, mixed> $digest */
    public function __construct(public array $digest)
    {
    }

    public function envelope(): Envelope
    {
        $company = (string) (Setting::getValue('company.name') ?: config('app.name'));
        $frequency = ucfirst((string) $this->digest['frequency']);

        return new Envelope(
            subject: "{$company} — {$frequency} report ({$this->digest['period_label']})",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.report-digest',
            with: [
                'company' => (string) (Setting::getValue('company.name') ?: config('app.name')),
                'currency' => (string) (Setting::getValue('company.currency') ?: 'MMK'),
            ],
        );
    }
}
