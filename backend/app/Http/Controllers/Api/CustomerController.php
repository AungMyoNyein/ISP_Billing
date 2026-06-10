<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Services\BillingService;
use App\Services\RadiusService;
use App\Services\SmartOltService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CustomerController extends Controller
{
    public function __construct(
        private readonly RadiusService $radius,
        private readonly BillingService $billing,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $customers = Customer::with(['servicePlan:id,name,price', 'router:id,name'])
            ->filter($request->only(['search', 'status', 'dn_zone', 'sn_odb', 'service_plan_id', 'router_id']))
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($customers);
    }

    /** Distinct values used to populate the CRM filter dropdowns. */
    public function filterOptions(): JsonResponse
    {
        return response()->json([
            'dn_zones' => Customer::whereNotNull('dn_zone')->distinct()->orderBy('dn_zone')->pluck('dn_zone'),
            'sn_odbs' => Customer::whereNotNull('sn_odb')->distinct()->orderBy('sn_odb')->pluck('sn_odb'),
            'statuses' => ['pending', 'active', 'suspended', 'expired', 'disabled'],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateData($request);

        $customer = Customer::create($data);
        $this->radius->provision($customer);
        if ($customer->status === Customer::STATUS_SUSPENDED) {
            $this->radius->suspend($customer);
        }

        AuditLog::record('created', $customer, ['customer_code' => $customer->customer_code]);

        return response()->json($customer->load('servicePlan', 'router'), 201);
    }

    public function show(Customer $customer): JsonResponse
    {
        $customer->load(['servicePlan', 'router:id,name,host']);

        return response()->json([
            ...$customer->toArray(),
            'radius_password' => $customer->radius_password,
            'online' => $this->radius->healthy() && $this->radius->isOnline($customer->username),
        ]);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $data = $this->validateData($request, $customer);
        $oldUsername = $customer->username;
        $oldStatus = $customer->status;

        $customer->update($data);

        if ($oldUsername !== $customer->username) {
            $this->radius->rename($oldUsername, $customer->username);
        }
        $this->radius->provision($customer);

        // Keep RADIUS access in sync with manual status changes.
        if ($oldStatus !== $customer->status) {
            if (in_array($customer->status, [Customer::STATUS_SUSPENDED, Customer::STATUS_EXPIRED, Customer::STATUS_DISABLED], true)) {
                $this->radius->suspend($customer);
                $this->billing->kickSession($customer);
            } elseif ($customer->status === Customer::STATUS_ACTIVE) {
                $this->radius->reconnect($customer);
            }
        }

        AuditLog::record('updated', $customer, $customer->getChanges());

        return response()->json($customer->load('servicePlan', 'router'));
    }

    public function destroy(Customer $customer): JsonResponse
    {
        $this->radius->deprovision($customer->username);
        $customer->delete();

        AuditLog::record('deleted', $customer, ['customer_code' => $customer->customer_code]);

        return response()->json(['message' => 'Customer deleted.']);
    }

    /** Bandwidth usage tab: daily totals + recent sessions from radacct. */
    public function usage(Request $request, Customer $customer): JsonResponse
    {
        $days = min($request->integer('days', 30), 90);

        return response()->json([
            'daily' => $this->radius->dailyUsage($customer->username, $days),
            'sessions' => $this->radius->recentSessions($customer->username),
            'online' => $this->radius->isOnline($customer->username),
        ]);
    }

    public function suspend(Customer $customer): JsonResponse
    {
        $this->billing->suspendCustomer($customer, 'manual');

        return response()->json($customer->fresh());
    }

    public function reconnect(Customer $customer): JsonResponse
    {
        $this->billing->reconnectCustomer($customer);

        return response()->json($customer->fresh());
    }

    /** SmartOLT ONU status/signal for the customer's ONU serial. */
    public function onuStatus(Customer $customer, SmartOltService $smartOlt): JsonResponse
    {
        if (! $customer->smartolt_onu_sn) {
            return response()->json(['enabled' => false, 'message' => 'No ONU serial set for this customer.']);
        }
        if (! $smartOlt->enabled()) {
            return response()->json(['enabled' => false, 'message' => 'SmartOLT integration is not configured.']);
        }

        return response()->json([
            'enabled' => true,
            'status' => $smartOlt->getOnuStatus($customer->smartolt_onu_sn),
            'signal' => $smartOlt->getOnuSignal($customer->smartolt_onu_sn),
        ]);
    }

    private function validateData(Request $request, ?Customer $customer = null): array
    {
        return $request->validate([
            'customer_code' => ['required', 'string', 'max:50', Rule::unique('customers')->ignore($customer)->withoutTrashed()],
            'username' => ['required', 'string', 'max:64', Rule::unique('customers')->ignore($customer)->withoutTrashed()],
            'radius_password' => [$customer ? 'sometimes' : 'required', 'string', 'min:4', 'max:64'],
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'address' => ['nullable', 'string', 'max:1000'],
            'dn_zone' => ['nullable', 'string', 'max:100'],
            'sn_odb' => ['nullable', 'string', 'max:100'],
            'gps_location' => ['nullable', 'string', 'max:100'],
            'status' => ['sometimes', Rule::in(['pending', 'active', 'suspended', 'expired', 'disabled'])],
            'notes' => ['nullable', 'string', 'max:5000'],
            'service_plan_id' => ['nullable', 'exists:service_plans,id'],
            'router_id' => ['nullable', 'exists:routers,id'],
            'smartolt_onu_sn' => ['nullable', 'string', 'max:50'],
            'activation_date' => ['nullable', 'date'],
            'expiry_date' => ['nullable', 'date'],
        ]);
    }
}
