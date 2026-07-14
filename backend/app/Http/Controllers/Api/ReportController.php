<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\ServicePlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    /** Monthly revenue (payments received) for the last N months. */
    public function revenue(Request $request): JsonResponse
    {
        $months = min($request->integer('months', 12), 36);

        $rows = Payment::query()
            ->selectRaw("DATE_FORMAT(paid_at, '%Y-%m') as month")
            ->selectRaw('SUM(amount) as total')
            ->selectRaw('COUNT(*) as payments')
            ->where('paid_at', '>=', now()->subMonths($months)->startOfMonth())
            ->groupBy('month')
            ->orderBy('month')
            ->get();

        return response()->json($rows);
    }

    /** New customers per month for the last N months. */
    public function customerGrowth(Request $request): JsonResponse
    {
        $months = min($request->integer('months', 12), 36);

        $rows = Customer::query()
            ->selectRaw("DATE_FORMAT(created_at, '%Y-%m') as month")
            ->selectRaw('COUNT(*) as customers')
            ->where('created_at', '>=', now()->subMonths($months)->startOfMonth())
            ->groupBy('month')
            ->orderBy('month')
            ->get();

        return response()->json($rows);
    }

    /** Customer count per service plan. */
    public function planDistribution(): JsonResponse
    {
        $rows = ServicePlan::query()
            ->leftJoin('customers', function ($join) {
                $join->on('customers.service_plan_id', '=', 'service_plans.id')
                    ->whereNull('customers.deleted_at');
            })
            ->whereNull('service_plans.deleted_at')
            ->groupBy('service_plans.id', 'service_plans.name', 'service_plans.price')
            ->orderByDesc(DB::raw('COUNT(customers.id)'))
            ->get([
                'service_plans.id',
                'service_plans.name',
                'service_plans.price',
                DB::raw('COUNT(customers.id) as customers'),
            ]);

        return response()->json($rows);
    }

    /** Unpaid / overdue receivables summary. */
    public function receivables(): JsonResponse
    {
        return response()->json([
            'unpaid_total' => (float) Invoice::where('status', Invoice::STATUS_UNPAID)->sum('amount'),
            'unpaid_count' => Invoice::where('status', Invoice::STATUS_UNPAID)->count(),
            'overdue_total' => (float) Invoice::where('status', Invoice::STATUS_SUSPENDED)->sum('amount'),
            'overdue_count' => Invoice::where('status', Invoice::STATUS_SUSPENDED)->count(),
        ]);
    }
}
