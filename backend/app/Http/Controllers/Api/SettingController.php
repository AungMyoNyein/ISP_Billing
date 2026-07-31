<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Setting::orderBy('group')->orderBy('key')->get()->groupBy('group'),
        );
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
            if ($item['key'] === 'company.logo') {
                $this->assertValidLogo($item['value'] ?? null);
            }

            Setting::setValue($item['key'], $item['value'] ?? null, $item['group'] ?? 'general');
        }

        AuditLog::record('settings_updated', null, [
            'keys' => array_column($data['settings'], 'key'),
        ]);

        return response()->json(['message' => 'Settings saved.']);
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
