<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\ReportDigestMail;
use App\Models\AuditLog;
use App\Models\Setting;
use App\Services\MailSettingsService;
use App\Services\ReportDigestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class SettingController extends Controller
{
    public function __construct(private readonly MailSettingsService $mailSettings)
    {
    }

    public function index(): JsonResponse
    {
        $settings = Setting::orderBy('group')->orderBy('key')->get()
            // the SMTP password never leaves the API; the UI shows whether one
            // is set and can replace it, but cannot read it back
            ->map(function (Setting $setting) {
                if (in_array($setting->key, MailSettingsService::SECRET_KEYS, true)) {
                    $setting->value = filled($setting->value) ? '********' : null;
                }

                return $setting;
            });

        return response()->json($settings->groupBy('group'));
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'settings' => ['required', 'array'],
            'settings.*.key' => ['required', 'string', 'max:100'],
            'settings.*.value' => ['nullable'],
            'settings.*.group' => ['sometimes', 'string', 'max:50'],
        ]);

        foreach ($data['settings'] as $item) {
            $value = $item['value'] ?? null;

            if ($item['key'] === 'company.logo') {
                $this->assertValidLogo($value);
            }

            if (in_array($item['key'], MailSettingsService::SECRET_KEYS, true)) {
                // the mask is what index() handed out — saving the form back
                // unchanged must not overwrite the real password with it
                if ($value === '********') {
                    continue;
                }

                $value = filled($value) ? $this->mailSettings->encryptPassword((string) $value) : null;
            }

            Setting::setValue($item['key'], $value, $item['group'] ?? 'general');
        }

        AuditLog::record('settings_updated', null, [
            'keys' => array_column($data['settings'], 'key'),
        ]);

        return response()->json(['message' => 'Settings saved.']);
    }

    /**
     * Send the report to one address now, so an operator can prove the SMTP
     * settings work without waiting for 07:00 the next morning.
     */
    public function testEmail(Request $request, ReportDigestService $digests): JsonResponse
    {
        $data = $request->validate([
            'to' => ['required', 'email'],
            'frequency' => ['nullable', 'in:daily,weekly,monthly'],
        ]);

        $frequency = $data['frequency'] ?? (string) Setting::getValue('reports.email.frequency', 'daily');

        $this->mailSettings->apply();

        try {
            Mail::to($data['to'])->send(new ReportDigestMail($digests->build($frequency)));
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Sending failed: '.$e->getMessage(),
            ], 422);
        }

        AuditLog::record('report_email_tested', null, ['to' => $data['to'], 'frequency' => $frequency]);

        return response()->json([
            'message' => $this->mailSettings->configured()
                ? "Test report sent to {$data['to']}."
                : "Mail is not configured, so the report was written to the application log instead of being sent to {$data['to']}.",
        ]);
    }

    /**
     * The logo is stored inline as a data URI rather than as an uploaded file:
     * it has to survive into printed invoices, and an embedded image prints
     * even when the browser cannot reach the API for a separate asset request.
     * Cap the size so a settings row cannot be used to park a large blob.
     */
    private function assertValidLogo(mixed $value): void
    {
        if ($value === null || $value === '') {
            return;
        }

        abort_unless(
            is_string($value) && preg_match('#^data:image/(png|jpeg|gif|webp|svg\+xml);base64,#', $value) === 1,
            422,
            'The logo must be a PNG, JPEG, GIF, WebP or SVG image.',
        );

        abort_if(
            strlen($value) > 512 * 1024,
            422,
            'The logo is too large — use an image under about 350 KB.',
        );
    }
}
