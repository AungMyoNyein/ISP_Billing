<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Setting;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Billing lifecycle rules:
 *
 *   Unpaid > Due Date  -> invoice "suspended", customer suspended, RADIUS access disabled
 *   Paid               -> customer active, RADIUS access enabled, expiry extended
 */
class BillingService
{
    public function __construct(
        private readonly RadiusService $radius,
    ) {}

    /** Generate the next invoice for a customer based on its plan. */
    public function generateInvoice(Customer $customer, ?string $billingDate = null, ?int $dueDays = null): Invoice
    {
        $customer->loadMissing('servicePlan');
        $plan = $customer->servicePlan;
        abort_if($plan === null, 422, 'Customer has no service plan assigned.');

        $billing = $billingDate ? now()->parse($billingDate) : now();
        $dueDays ??= (int) Setting::getValue('billing.due_days', 5);
        $periodStart = $customer->expiry_date?->isFuture()
            ? $customer->expiry_date->copy()->addDay()
            : $billing->copy();

        return Invoice::create([
            'invoice_number' => Invoice::nextNumber(),
            'customer_id' => $customer->id,
            'service_plan_id' => $plan->id,
            'amount' => $plan->price,
            'billing_date' => $billing->toDateString(),
            'due_date' => $billing->copy()->addDays($dueDays)->toDateString(),
            'status' => Invoice::STATUS_UNPAID,
            'period_start' => $periodStart->toDateString(),
            'period_end' => $periodStart->copy()->addDays($plan->validity_days)->toDateString(),
        ]);
    }

    /**
     * Record a payment against an invoice: mark paid, activate the
     * customer, extend expiry, re-enable RADIUS.
     */
    public function recordPayment(Invoice $invoice, array $data): Payment
    {
        return DB::transaction(function () use ($invoice, $data) {
            $payment = Payment::create([
                'payment_number' => Payment::nextNumber(),
                'invoice_id' => $invoice->id,
                'customer_id' => $invoice->customer_id,
                'amount' => $data['amount'] ?? $invoice->amount,
                'method' => $data['method'] ?? 'cash',
                'reference' => $data['reference'] ?? null,
                'paid_at' => $data['paid_at'] ?? now(),
                'received_by' => auth()->id(),
                'notes' => $data['notes'] ?? null,
            ]);

            $invoice->update([
                'status' => Invoice::STATUS_PAID,
                'paid_at' => $payment->paid_at,
            ]);

            $customer = $invoice->customer;
            $customer->update([
                'status' => Customer::STATUS_ACTIVE,
                'expiry_date' => $invoice->period_end ?? now()->addDays($invoice->servicePlan->validity_days ?? 30),
                'last_renewed_at' => now(),
                'activation_date' => $customer->activation_date ?? now()->toDateString(),
            ]);

            $this->radius->provision($customer);
            $this->radius->reconnect($customer);

            AuditLog::record('payment_recorded', $payment, [
                'invoice' => $invoice->invoice_number,
                'amount' => (string) $payment->amount,
            ]);

            return $payment;
        });
    }

    /** Renew = generate the next invoice for the customer's plan. */
    public function renew(Customer $customer): Invoice
    {
        $invoice = $this->generateInvoice($customer);
        AuditLog::record('renewal_invoice_generated', $invoice, [
            'customer' => $customer->username,
        ]);

        return $invoice;
    }

    /** Suspend a customer: status, RADIUS reject, kick live session. */
    public function suspendCustomer(Customer $customer, string $reason = 'overdue'): void
    {
        $customer->update(['status' => Customer::STATUS_SUSPENDED]);
        $this->radius->suspend($customer);
        $this->kickSession($customer);

        AuditLog::record('customer_suspended', $customer, ['reason' => $reason]);
    }

    /** Manually reconnect a customer without payment (e.g. grace). */
    public function reconnectCustomer(Customer $customer): void
    {
        $customer->update(['status' => Customer::STATUS_ACTIVE]);
        $this->radius->provision($customer);
        $this->radius->reconnect($customer);

        AuditLog::record('customer_reconnected', $customer);
    }

    /** Disconnect the customer's live PPPoE session so RADIUS rules apply now. */
    public function kickSession(Customer $customer): void
    {
        try {
            $this->radius->disconnectUser($customer->username);
        } catch (\Throwable $e) {
            Log::warning("Could not send RADIUS disconnect for {$customer->username}: {$e->getMessage()}");
        }
    }

    /**
     * Scheduler entry point: enforce the overdue rule and expiry.
     *
     * @return array{suspended: int, expired: int}
     */
    public function processOverdueAndExpiry(): array
    {
        $suspended = 0;

        $overdue = Invoice::with('customer')
            ->where('status', Invoice::STATUS_UNPAID)
            ->whereDate('due_date', '<', now()->toDateString())
            ->get();

        foreach ($overdue as $invoice) {
            $invoice->update(['status' => Invoice::STATUS_SUSPENDED]);
            $customer = $invoice->customer;
            if ($customer && $customer->status !== Customer::STATUS_SUSPENDED) {
                $this->suspendCustomer($customer, "invoice {$invoice->invoice_number} overdue");
                $suspended++;
            }
        }

        $expired = 0;
        $expiring = Customer::where('status', Customer::STATUS_ACTIVE)
            ->whereNotNull('expiry_date')
            ->whereDate('expiry_date', '<', now()->toDateString())
            ->get();

        foreach ($expiring as $customer) {
            $customer->update(['status' => Customer::STATUS_EXPIRED]);
            $this->radius->suspend($customer);
            $this->kickSession($customer);
            AuditLog::record('customer_expired', $customer);
            $expired++;
        }

        return ['suspended' => $suspended, 'expired' => $expired];
    }
}
