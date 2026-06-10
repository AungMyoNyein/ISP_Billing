<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Router;
use App\Services\MikroTikService;
use App\Services\RadiusService;
use App\Services\SmartOltService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** System status page: routers, FreeRADIUS, databases, SmartOLT. */
class StatusController extends Controller
{
    public function index(
        Request $request,
        MikroTikService $mikrotik,
        RadiusService $radius,
        SmartOltService $smartOlt,
    ): JsonResponse {
        $live = $request->boolean('live'); // probe routers now instead of cached status

        $routers = Router::withCount('customers')->orderBy('name')->get()->map(function (Router $router) use ($live, $mikrotik) {
            if ($live) {
                $mikrotik->checkStatus($router);
                $router->refresh();
            }

            return [
                'id' => $router->id,
                'name' => $router->name,
                'host' => $router->host,
                'status' => $router->status,
                'last_seen_at' => $router->last_seen_at?->toIso8601String(),
                'customers_count' => $router->customers_count,
                'resource' => $router->last_resource,
            ];
        });

        $mainDb = true;
        try {
            DB::select('select 1');
        } catch (\Throwable) {
            $mainDb = false;
        }

        $radiusDb = $radius->healthy();

        return response()->json([
            'routers' => $routers,
            'routers_online' => $routers->where('status', 'online')->count(),
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
