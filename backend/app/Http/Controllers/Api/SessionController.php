<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Services\RadiusService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Online session monitoring backed by radacct. */
class SessionController extends Controller
{
    public function index(Request $request, RadiusService $radius): JsonResponse
    {
        $sessions = $radius->onlineSessions($request->string('search')->toString() ?: null);

        // Decorate with billing customer info where usernames match.
        $customers = Customer::with('servicePlan:id,name')
            ->whereIn('username', $sessions->pluck('username')->unique())
            ->get()
            ->keyBy('username');

        $rows = $sessions->map(function ($s) use ($customers) {
            $customer = $customers->get($s->username);

            return [
                'radacctid' => $s->radacctid,
                'username' => $s->username,
                'ip_address' => $s->framedipaddress,
                'mac_address' => $s->callingstationid,
                'nas_ip' => $s->nasipaddress,
                'session_id' => $s->acctsessionid,
                'started_at' => $s->acctstarttime?->toIso8601String(),
                'uptime_seconds' => $s->acctstarttime ? (int) abs(now()->diffInSeconds($s->acctstarttime)) : null,
                'download_bytes' => (int) ($s->acctoutputoctets ?? 0),
                'upload_bytes' => (int) ($s->acctinputoctets ?? 0),
                'customer' => $customer ? [
                    'id' => $customer->id,
                    'name' => $customer->name,
                    'customer_code' => $customer->customer_code,
                    'status' => $customer->status,
                    'plan' => $customer->servicePlan?->name,
                ] : null,
            ];
        });

        return response()->json(['data' => $rows, 'total' => $rows->count()]);
    }
}
