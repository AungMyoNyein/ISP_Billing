<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * SmartOLT cloud API client (https://api.smartolt.com docs).
 * Configure SMARTOLT_BASE_URL (e.g. https://yourisp.smartolt.com/api)
 * and SMARTOLT_API_KEY in .env.
 */
class SmartOltService
{
    public function enabled(): bool
    {
        return (bool) (config('services.smartolt.base_url') && config('services.smartolt.api_key'));
    }

    private function http(): PendingRequest
    {
        return Http::baseUrl(rtrim(config('services.smartolt.base_url'), '/'))
            ->withHeaders(['X-Token' => config('services.smartolt.api_key')])
            ->acceptJson()
            ->timeout(15);
    }

    /** @return array<string, mixed>|null */
    public function getOnuStatus(string $onuSn): ?array
    {
        if (! $this->enabled()) {
            return null;
        }

        $response = $this->http()->get("/onu/get_onu_status/{$onuSn}");

        return $response->successful() ? $response->json() : null;
    }

    /** @return array<string, mixed>|null Optical signal levels for an ONU. */
    public function getOnuSignal(string $onuSn): ?array
    {
        if (! $this->enabled()) {
            return null;
        }

        $response = $this->http()->get("/onu/get_onu_signal/{$onuSn}");

        return $response->successful() ? $response->json() : null;
    }

    /** @return array<string, mixed>|null Full details for an ONU. */
    public function getOnuDetails(string $onuSn): ?array
    {
        if (! $this->enabled()) {
            return null;
        }

        $response = $this->http()->get("/onu/get_onu_details/{$onuSn}");

        return $response->successful() ? $response->json() : null;
    }

    public function enableOnu(string $onuSn): bool
    {
        return $this->enabled()
            && $this->http()->post("/onu/enable/{$onuSn}")->successful();
    }

    public function disableOnu(string $onuSn): bool
    {
        return $this->enabled()
            && $this->http()->post("/onu/disable/{$onuSn}")->successful();
    }
}
