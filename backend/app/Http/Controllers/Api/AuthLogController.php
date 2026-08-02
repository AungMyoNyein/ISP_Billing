<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Services\RadiusService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** RADIUS authentication log backed by radpostauth. */
class AuthLogController extends Controller
{
    public function index(Request $request, RadiusService $radius): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:64'],
            'reply' => ['nullable', Rule::in(['Access-Accept', 'Access-Reject'])],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $attempts = $radius->authLog($filters, $request->integer('per_page', 50));

        // Decorate with billing customer info where usernames match, so an
        // operator can jump from a rejected login to the account.
        $customers = Customer::with('servicePlan:id,name')
            ->whereIn('username', collect($attempts->items())->pluck('username')->unique())
            ->get()
            ->keyBy('username');

        $attempts->through(function ($attempt) use ($customers) {
            $customer = $customers->get($attempt->username);

            return [
                'id' => $attempt->id,
                'username' => $attempt->username,
                'reply' => $attempt->reply,
                'accepted' => $attempt->reply === 'Access-Accept',
                'authenticated_at' => $attempt->authdate?->toIso8601String(),
                'customer' => $customer ? [
                    'id' => $customer->id,
                    'name' => $customer->name,
                    'customer_code' => $customer->customer_code,
                    'status' => $customer->status,
                    'plan' => $customer->servicePlan?->name,
                ] : null,
            ];
        });

        return response()->json($attempts);
    }
}
