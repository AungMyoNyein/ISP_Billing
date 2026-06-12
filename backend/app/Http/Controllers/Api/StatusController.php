<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Router;
use App\Services\RadiusService;
use App\Services\SmartOltService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/** System status page: NAS routers (via radacct), FreeRADIUS, databases, SmartOLT. */
class StatusController extends Controller
{
    public function index(
        RadiusService $radius,
        SmartOltService $smartOlt,
    ): JsonResponse {
        $radiusDb = $radius->healthy();

        $activity = $radiusDb
            ? $radius->nasActivity()
            : ['online' => collect(), 'last_seen' => collect()];

        $routers = Router::withCount('customers')->orderBy('name')->get()->map(function (Router $router) use ($activity) {
            $sessions = (int) ($activity['online'][$router->nas_ip] ?? 0);
            $lastSeen = $activity['last_seen'][$router->nas_ip] ?? null;

            return [
                'id' => $router->id,
                'name' => $router->name,
                'nas_ip' => $router->nas_ip,
                'status' => $sessions > 0 ? 'active' : 'idle',
                'online_sessions' => $sessions,
                'last_seen_at' => $lastSeen ? now()->parse($lastSeen)->toIso8601String() : null,
                'customers_count' => $router->customers_count,
            ];
        });

        $mainDb = true;
        try {
            DB::select('select 1');
        } catch (\Throwable) {
            $mainDb = false;
        }

        return response()->json([
            'routers' => $routers,
            'routers_active' => $routers->where('status', 'active')->count(),
            'routers_total' => $routers->count(),
            'freeradius' => [
                'database_reachable' => $radiusDb,
                'online_sessions' => $radiusDb ? $radius->onlineCount() : null,
            ],
            'database' => [
                'main' => $mainDb,
                'radius' => $radiusDb,
            ],
            'smartolt' => [
                'configured' => $smartOlt->enabled(),
            ],
            'checked_at' => now()->toIso8601String(),
        ]);
    }
}
