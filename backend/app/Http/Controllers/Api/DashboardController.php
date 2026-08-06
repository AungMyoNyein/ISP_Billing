<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\SupportTicket;
use App\Services\RadiusService;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function stats(RadiusService $radius): JsonResponse
    {
        $onlineUsers = 0;
        $radiusOk = $radius->healthy();
        if ($radiusOk) {
            $onlineUsers = $radius->onlineCount();
        }

        return response()->json([
            'total_customers' => Customer::count(),
            'active_customers' => Customer::status(Customer::STATUS_ACTIVE)->count(),
            'online_users' => $onlineUsers,
            'suspended_customers' => Customer::status(Customer::STATUS_SUSPENDED)->count(),
            'expired_customers' => Customer::status(Customer::STATUS_EXPIRED)->count(),
            'expiring_in_7_days' => Customer::expiringWithin(7)->count(),
            'new_customers_this_month' => Customer::where('created_at', '>=', now()->startOfMonth())->count(),
            'unpaid_invoices' => Invoice::where('status', Invoice::STATUS_UNPAID)->count(),
            'open_tickets' => SupportTicket::stillOpen()->count(),
            'urgent_tickets' => SupportTicket::stillOpen()->where('priority', 'urgent')->count(),
            'revenue_this_month' => (float) Payment::where('paid_at', '>=', now()->startOfMonth())->sum('amount'),
            'radius_healthy' => $radiusOk,
        ]);
    }
}
