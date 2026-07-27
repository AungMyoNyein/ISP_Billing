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

    /**
     * Every ONU SmartOLT knows about, for the customer importer.
     *
     * Verified against a live account: returns {onus: [...], status,
     * response_code}, and each ONU carries its WAN PPPoE credentials inline
     * as "username"/"password" — there is no separate WAN-config endpoint
     * (/onu/get_onu_wan_config answers 405).
     *
     * @return array<int, array<string, mixed>>
     */
    public function listOnus(): array
    {
        if (! $this->enabled()) {
            return [];
        }

        $response = $this->http()->timeout(60)->get('/onu/get_all_onus_details');
        if (! $response->successful()) {
            return [];
        }

        $body = $response->json();

        // SmartOLT wraps collections under a key that varies by endpoint;
        // accept the bare list too.
        foreach (['onus', 'data', 'response'] as $key) {
            if (isset($body[$key]) && is_array($body[$key])) {
                return array_values($body[$key]);
            }
        }

        return is_array($body) && array_is_list($body) ? $body : [];
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
