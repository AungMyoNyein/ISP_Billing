<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;

/**
 * Figures for the emailed report. Period totals (what happened in the window)
 * are kept separate from standing totals (where the business stands right
 * now), because mixing the two is how a "daily report" ends up quoting a
 * lifetime customer count as if it were today's signups.
 */
class ReportDigestService
{
    public function __construct(private readonly RadiusService $radius)
    {
    }

    /**
     * @return array{
     *     frequency: string, period_label: string, from: string, to: string,
     *     period: array<string, mixed>, standing: array<string, mixed>,
     *     top_plans: array<int, array{name: string, customers: int}>
     * }
     */
    public function build(string $frequency, ?CarbonImmutable $now = null): array
    {
        $now = $now ?? CarbonImmutable::now();
        [$from, $to, $label] = $this->window($frequency, $now);

        return [
            'frequency' => $frequency,
            'period_label' => $label,
            'from' => $from->toDateTimeString(),
            'to' => $to->toDateTimeString(),
            'period' => [
                'new_customers' => Customer::whereBetween('created_at', [$from, $to])->count(),
                'invoices_raised' => Invoice::whereBetween('created_at', [$from, $to])->count(),
                'invoiced_amount' => (float) Invoice::whereBetween('created_at', [$from, $to])->sum('amount'),
                'payments_received' => Payment::whereBetween('paid_at', [$from, $to])->count(),
                'revenue_collected' => (float) Payment::whereBetween('paid_at', [$from, $to])->sum('amount'),
            ],
            'standing' => [
                'total_customers' => Customer::count(),
                'active_customers' => Customer::status(Customer::STATUS_ACTIVE)->count(),
                'suspended_customers' => Customer::status(Customer::STATUS_SUSPENDED)->count(),
                'expired_customers' => Customer::status(Customer::STATUS_EXPIRED)->count(),
                'expiring_in_7_days' => Customer::expiringWithin(7)->count(),
                'unpaid_invoices' => Invoice::where('status', Invoice::STATUS_UNPAID)->count(),
                'outstanding_amount' => (float) Invoice::where('status', Invoice::STATUS_UNPAID)->sum('amount'),
                // a RADIUS outage must not take the whole report down with it
                'online_users' => $this->radius->healthy() ? $this->radius->onlineCount() : null,
            ],
            'top_plans' => $this->topPlans(),
        ];
    }

    /** @return array{0: Carbon, 1: Carbon, 2: string} */
    private function window(string $frequency, CarbonImmutable $now): array
    {
        return match ($frequency) {
            'weekly' => [
                Carbon::instance($now->subWeek()->startOfWeek()->toDateTime()),
                Carbon::instance($now->subWeek()->endOfWeek()->toDateTime()),
                'Week of '.$now->subWeek()->startOfWeek()->format('j M Y'),
            ],
            'monthly' => [
                Carbon::instance($now->subMonthNoOverflow()->startOfMonth()->toDateTime()),
                Carbon::instance($now->subMonthNoOverflow()->endOfMonth()->toDateTime()),
                $now->subMonthNoOverflow()->format('F Y'),
            ],
            // daily reports cover yesterday: a report sent at 07:00 about the
            // day it is sent on would be reporting seven hours of business
            default => [
                Carbon::instance($now->subDay()->startOfDay()->toDateTime()),
                Carbon::instance($now->subDay()->endOfDay()->toDateTime()),
                $now->subDay()->format('j M Y'),
            ],
        };
    }

    /** @return array<int, array{name: string, customers: int}> */
    private function topPlans(): array
    {
        return Customer::query()
            ->selectRaw('service_plans.name, COUNT(customers.id) as customers')
            ->join('service_plans', 'service_plans.id', '=', 'customers.service_plan_id')
            ->groupBy('service_plans.name')
            ->orderByDesc('customers')
            ->limit(5)
            ->get()
            ->map(fn ($r) => ['name' => (string) $r->name, 'customers' => (int) $r->customers])
            ->all();
    }
}
