<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Invoice extends Model
{
    use SoftDeletes;

    public const STATUS_PAID = 'paid';
    public const STATUS_UNPAID = 'unpaid';
    public const STATUS_SUSPENDED = 'suspended';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'invoice_number', 'customer_id', 'service_plan_id', 'amount',
        'billing_date', 'due_date', 'status', 'paid_at',
        'period_start', 'period_end', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'billing_date' => 'date',
            'due_date' => 'date',
            'paid_at' => 'datetime',
            'period_start' => 'date',
            'period_end' => 'date',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function servicePlan(): BelongsTo
    {
        return $this->belongsTo(ServicePlan::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function isOverdue(): bool
    {
        return $this->status !== self::STATUS_PAID
            && $this->status !== self::STATUS_CANCELLED
            && $this->due_date->isPast();
    }

    public function scopeFilter(Builder $query, array $filters): Builder
    {
        return $query
            ->when($filters['search'] ?? null, function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(function (Builder $q) use ($like) {
                    $q->where('invoice_number', 'like', $like)
                        ->orWhereHas('customer', function (Builder $q) use ($like) {
                            $q->where('name', 'like', $like)
                                ->orWhere('username', 'like', $like)
                                ->orWhere('customer_code', 'like', $like);
                        });
                });
            })
            ->when($filters['status'] ?? null, fn (Builder $q, string $s) => $q->where('status', $s))
            ->when($filters['customer_id'] ?? null, fn (Builder $q, $id) => $q->where('customer_id', $id))
            ->when($filters['from'] ?? null, fn (Builder $q, string $d) => $q->whereDate('billing_date', '>=', $d))
            ->when($filters['to'] ?? null, fn (Builder $q, string $d) => $q->whereDate('billing_date', '<=', $d))
            ->when($filters['overdue'] ?? null, fn (Builder $q) => $q
                ->where('status', self::STATUS_UNPAID)
                ->whereDate('due_date', '<', now()->toDateString()));
    }

    public static function nextNumber(): string
    {
        $prefix = 'INV-'.now()->format('Ym').'-';
        $last = static::withTrashed()
            ->where('invoice_number', 'like', $prefix.'%')
            ->orderByDesc('invoice_number')
            ->value('invoice_number');
        $seq = $last ? ((int) substr($last, strlen($prefix))) + 1 : 1;

        return $prefix.str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }
}
