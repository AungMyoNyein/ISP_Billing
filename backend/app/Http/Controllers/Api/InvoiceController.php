<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Invoice;
use App\Services\BillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class InvoiceController extends Controller
{
    public function __construct(private readonly BillingService $billing)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $invoices = Invoice::with(['customer:id,customer_code,name,username,status', 'servicePlan:id,name'])
            ->filter($request->only(['search', 'status', 'customer_id', 'from', 'to', 'overdue']))
            ->orderByDesc('billing_date')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 15));

        return response()->json($invoices);
    }

    /** Generate an invoice for a customer from their current plan. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'billing_date' => ['nullable', 'date'],
            'due_days' => ['nullable', 'integer', 'min:0', 'max:90'],
        ]);

        $customer = Customer::findOrFail($data['customer_id']);
        $invoice = $this->billing->generateInvoice($customer, $data['billing_date'] ?? null, $data['due_days'] ?? null);

        AuditLog::record('invoice_created', $invoice, ['customer' => $customer->username]);

        return response()->json($invoice->load('customer', 'servicePlan'), 201);
    }

    public function show(Invoice $invoice): JsonResponse
    {
        return response()->json($invoice->load(['customer', 'servicePlan', 'payments.receiver:id,name']));
    }

    public function update(Request $request, Invoice $invoice): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['sometimes', 'numeric', 'min:0'],
            'billing_date' => ['sometimes', 'date'],
            'due_date' => ['sometimes', 'date'],
            'status' => ['sometimes', Rule::in(['paid', 'unpaid', 'suspended', 'cancelled'])],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $invoice->update($data);
        AuditLog::record('updated', $invoice, $invoice->getChanges());

        return response()->json($invoice->fresh()->load('customer', 'servicePlan'));
    }

    public function destroy(Invoice $invoice): JsonResponse
    {
        abort_if($invoice->status === Invoice::STATUS_PAID, 422, 'Paid invoices cannot be deleted.');
        $invoice->delete();
        AuditLog::record('deleted', $invoice, ['invoice_number' => $invoice->invoice_number]);

        return response()->json(['message' => 'Invoice deleted.']);
    }

    /**
     * Mark an invoice paid: records the payment, re-activates the
     * customer and re-enables RADIUS access (Paid -> Active rule).
     */
    public function markPaid(Request $request, Invoice $invoice): JsonResponse
    {
        abort_if($invoice->status === Invoice::STATUS_PAID, 422, 'Invoice is already paid.');

        $data = $request->validate([
            'amount' => ['nullable', 'numeric', 'min:0'],
            'method' => ['nullable', Rule::in(['cash', 'bank_transfer', 'mobile_money', 'other'])],
            'reference' => ['nullable', 'string', 'max:100'],
            'paid_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $payment = $this->billing->recordPayment($invoice, $data);

        return response()->json([
            'invoice' => $invoice->fresh()->load('customer'),
            'payment' => $payment,
        ]);
    }
}
