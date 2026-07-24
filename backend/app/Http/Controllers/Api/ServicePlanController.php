<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ServicePlan;
use App\Services\RadiusService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ServicePlanController extends Controller
{
    public function __construct(
        private readonly RadiusService $radius,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $plans = ServicePlan::withCount('customers')
            ->when($request->filled('search'), fn ($q) => $q->where('name', 'like', '%'.$request->string('search').'%'))
            ->when($request->filled('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->orderBy('price')
            ->paginate($request->integer('per_page', 50));

        return response()->json($plans);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateData($request);
        $data['radius_group'] = $data['radius_group'] ?? Str::slug($data['name']);

        $plan = ServicePlan::create($data);
        $this->radius->syncPlanGroup($plan);
        AuditLog::record('created', $plan, ['name' => $plan->name]);

        return response()->json($plan, 201);
    }

    public function show(ServicePlan $servicePlan): JsonResponse
    {
        return response()->json($servicePlan->loadCount('customers'));
    }

    public function update(Request $request, ServicePlan $servicePlan): JsonResponse
    {
        $data = $this->validateData($request, $servicePlan);
        $data['radius_group'] = $data['radius_group'] ?? Str::slug($data['name']);

        $oldGroup = $servicePlan->radius_group;
        $servicePlan->update($data);
        $this->radius->syncPlanGroup($servicePlan, $oldGroup);
        AuditLog::record('updated', $servicePlan, $servicePlan->getChanges());

        return response()->json($servicePlan);
    }

    public function destroy(ServicePlan $servicePlan): JsonResponse
    {
        abort_if($servicePlan->customers()->exists(), 422, 'Plan has customers assigned; reassign them first.');
        $servicePlan->delete();
        if ($servicePlan->radius_group
            && ! ServicePlan::where('radius_group', $servicePlan->radius_group)->exists()) {
            $this->radius->deletePlanGroup($servicePlan->radius_group);
        }
        AuditLog::record('deleted', $servicePlan, ['name' => $servicePlan->name]);

        return response()->json(['message' => 'Plan deleted.']);
    }

    private function validateData(Request $request, ?ServicePlan $plan = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('service_plans')->ignore($plan)->withoutTrashed()],
            'price' => ['required', 'numeric', 'min:0'],
            'download_speed_kbps' => ['required', 'integer', 'min:1'],
            'upload_speed_kbps' => ['required', 'integer', 'min:1'],
            'session_timeout' => ['nullable', 'integer', 'min:0'],
            'idle_timeout' => ['nullable', 'integer', 'min:0'],
            'mikrotik_rate_limit' => ['nullable', 'string', 'max:100'],
            'framed_pool' => ['nullable', 'string', 'max:64'],
            'simultaneous_use' => ['nullable', 'integer', 'min:1', 'max:100'],
            'acct_interim_interval' => ['nullable', 'integer', 'min:30', 'max:86400'],
            'validity_days' => ['sometimes', 'integer', 'min:1'],
            'radius_group' => ['nullable', 'string', 'max:64'],
            'is_active' => ['sometimes', 'boolean'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);
    }
}
