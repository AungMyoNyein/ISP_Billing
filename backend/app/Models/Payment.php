<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Payment extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'payment_number', 'invoice_id', 'customer_id', 'amount', 'method',
        'reference', 'paid_at', 'received_by', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'paid_at' => 'datetime',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function scopeFilter(Builder $query, array $filters): Builder
    {
        return $query
            ->when($filters['search'] ?? null, function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(function (Builder $q) use ($like) {
                    $q->where('payment_number', 'ilike', $like)
                        ->orWhere('reference', 'ilike', $like)
                        ->orWhereHas('customer', fn (Builder $q) => $q
                            ->where('name', 'ilike', $like)
                            ->orWhere('username', 'ilike', $like));
                });
            })
            ->when($filters['method'] ?? null, fn (Builder $q, string $m) => $q->where('method', $m))
            ->when($filters['customer_id'] ?? null, fn (Builder $q, $id) => $q->where('customer_id', $id))
            ->when($filters['from'] ?? null, fn (Builder $q, string $d) => $q->whereDate('paid_at', '>=', $d))
            ->when($filters['to'] ?? null, fn (Builder $q, string $d) => $q->whereDate('paid_at', '<=', $d));
    }

    public static function nextNumber(): string
    {
        $prefix = 'PAY-'.now()->format('Ym').'-';
        $last = static::withTrashed()
            ->where('payment_number', 'like', $prefix.'%')
            ->orderByDesc('payment_number')
            ->value('payment_number');
        $seq = $last ? ((int) substr($last, strlen($prefix))) + 1 : 1;

        return $prefix.str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }
}
