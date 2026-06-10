<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $payments = Payment::with([
            'customer:id,customer_code,name,username',
            'invoice:id,invoice_number',
            'receiver:id,name',
        ])
            ->filter($request->only(['search', 'method', 'customer_id', 'from', 'to']))
            ->orderByDesc('paid_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($payments);
    }

    public function show(Payment $payment): JsonResponse
    {
        return response()->json($payment->load(['customer', 'invoice', 'receiver:id,name']));
    }

    public function destroy(Payment $payment): JsonResponse
    {
        $payment->delete();
        AuditLog::record('deleted', $payment, ['payment_number' => $payment->payment_number]);

        return response()->json(['message' => 'Payment deleted.']);
    }
}
