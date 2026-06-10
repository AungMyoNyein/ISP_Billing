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
            Setting::setValue($item['key'], $item['value'] ?? null, $item['group'] ?? 'general');
        }

        AuditLog::record('settings_updated', null, [
            'keys' => array_column($data['settings'], 'key'),
        ]);

        return response()->json(['message' => 'Settings saved.']);
    }
}
