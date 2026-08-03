<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Services\BillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Billing menu lists beyond plain invoice/payment CRUD:
 * renewals, expiring customers, suspended customers.
 */
class BillingController extends Controller
{
    public function __construct(private readonly BillingService $billing) {}

    /** Customers due for renewal (expiring soon or already expired). */
    public function renewals(Request $request): JsonResponse
    {
        $days = min($request->integer('days', 7), 60);

        $customers = Customer::with('servicePlan:id,name,price,validity_days')
            ->where(function ($q) use ($days) {
                $q->expiringWithin($days)
                    ->orWhere('status', Customer::STATUS_EXPIRED);
            })
            ->filter($request->only(['search', 'dn_zone', 'service_plan_id']))
            ->orderBy('expiry_date')
            ->paginate($request->integer('per_page', 15));

        return response()->json($customers);
    }

    /**
     * Generate the renewal invoice for one customer.
     *
     * `expiry_date` is optional: given, it sets the new expiry by hand;
     * omitted, the service plan's validity_days applies.
     */
    public function renew(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'expiry_date' => ['nullable', 'date'],
        ]);

        $invoice = $this->billing->renew($customer, $data['expiry_date'] ?? null);

        return response()->json($invoice->load('customer', 'servicePlan'), 201);
    }

    public function expiring(Request $request): JsonResponse
    {
        $days = min($request->integer('days', 7), 60);

        $customers = Customer::with('servicePlan:id,name,price,validity_days')
            ->expiringWithin($days)
            ->filter($request->only(['search', 'dn_zone', 'service_plan_id']))
            ->orderBy('expiry_date')
            ->paginate($request->integer('per_page', 15));

        return response()->json($customers);
    }

    public function suspended(Request $request): JsonResponse
    {
        $customers = Customer::with('servicePlan:id,name,price')
            ->status(Customer::STATUS_SUSPENDED)
            ->filter($request->only(['search', 'dn_zone', 'service_plan_id']))
            ->orderByDesc('updated_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($customers);
    }

    /** Manually run the overdue/expiry enforcement (same as the scheduler). */
    public function runEnforcement(): JsonResponse
    {
        return response()->json($this->billing->processOverdueAndExpiry());
    }
}
