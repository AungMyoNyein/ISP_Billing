<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Router;
use App\Services\RadiusService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RouterController extends Controller
{
    public function __construct(
        private readonly RadiusService $radius,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $routers = Router::withCount('customers')
            ->when($request->filled('search'), fn ($q) => $q->where('name', 'like', '%'.$request->string('search').'%'))
            ->orderBy('name')
            ->paginate($request->integer('per_page', 50));

        return response()->json($routers);
    }

    public function store(Request $request): JsonResponse
    {
        $router = Router::create($this->validateData($request));
        $reloaded = $this->radius->syncNas($router);
        AuditLog::record('created', $router, ['name' => $router->name]);

        return response()->json($router->toArray() + ['radius_reloaded' => $reloaded], 201);
    }

    public function show(Router $router): JsonResponse
    {
        return response()->json($router->loadCount('customers'));
    }

    public function update(Request $request, Router $router): JsonResponse
    {
        $data = $this->validateData($request, $router);
        if (($data['radius_secret'] ?? null) === '') {
            unset($data['radius_secret']); // blank means keep the stored secret
        }
        $router->update($data);
        $reloaded = $this->radius->syncNas($router);
        AuditLog::record('updated', $router, array_diff_key($router->getChanges(), array_flip(['radius_secret'])));

        return response()->json($router->toArray() + ['radius_reloaded' => $reloaded]);
    }

    public function destroy(Router $router): JsonResponse
    {
        abort_if($router->customers()->exists(), 422, 'Router has customers assigned; reassign them first.');
        $reloaded = $this->radius->removeNas($router);
        $router->delete();
        AuditLog::record('deleted', $router, ['name' => $router->name]);

        return response()->json([
            'message' => 'Router deleted.',
            'radius_reloaded' => $reloaded,
        ]);
    }

    /** Connectivity check: ICMP ping + RADIUS CoA probe + radacct session count. */
    public function check(Router $router): JsonResponse
    {
        try {
            return response()->json($this->radius->probeNas($router));
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
    }

    /** Kick a PPPoE session on this NAS via RADIUS Disconnect-Request. */
    public function disconnectUser(Request $request, Router $router): JsonResponse
    {
        $data = $request->validate(['username' => ['required', 'string', 'max:64']]);

        try {
            $kicked = $this->radius->disconnectUser($data['username'], $router);
            AuditLog::record('session_disconnected', $router, ['username' => $data['username']]);

            return response()->json(['disconnected' => $kicked]);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
    }

    private function validateData(Request $request, ?Router $router = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('routers')->ignore($router)->withoutTrashed()],
            'nas_ip' => ['required', 'string', 'max:45'],
            'coa_port' => ['sometimes', 'integer', 'min:1', 'max:65535'],
            'radius_secret' => [$router ? 'sometimes' : 'required', 'nullable', 'string', 'max:64'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
    }
}
