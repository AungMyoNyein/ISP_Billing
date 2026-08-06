<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class SupportTicket extends Model
{
    use SoftDeletes;

    public const STATUS_OPEN = 'open';

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_PENDING_CUSTOMER = 'pending_customer';

    public const STATUS_RESOLVED = 'resolved';

    public const STATUS_CLOSED = 'closed';

    public const STATUSES = [
        self::STATUS_OPEN,
        self::STATUS_IN_PROGRESS,
        self::STATUS_PENDING_CUSTOMER,
        self::STATUS_RESOLVED,
        self::STATUS_CLOSED,
    ];

    /** Statuses that still need somebody to do something. */
    public const OPEN_STATUSES = [
        self::STATUS_OPEN,
        self::STATUS_IN_PROGRESS,
        self::STATUS_PENDING_CUSTOMER,
    ];

    public const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

    public const CATEGORIES = [
        'connectivity', 'slow_speed', 'billing', 'installation', 'hardware', 'complaint', 'other',
    ];

    protected $fillable = [
        'ticket_number', 'customer_id', 'subject', 'description', 'category',
        'priority', 'status', 'assigned_to', 'opened_by', 'resolution',
        'resolved_at', 'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'resolved_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function opener(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(TicketReply::class);
    }

    public function scopeStillOpen(Builder $query): Builder
    {
        return $query->whereIn('status', self::OPEN_STATUSES);
    }

    public function scopeFilter(Builder $query, array $filters): Builder
    {
        return $query
            ->when($filters['search'] ?? null, function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(function (Builder $q) use ($like) {
                    $q->where('ticket_number', 'ilike', $like)
                        ->orWhere('subject', 'ilike', $like)
                        ->orWhere('description', 'ilike', $like)
                        ->orWhereHas('customer', fn (Builder $q) => $q
                            ->where('name', 'ilike', $like)
                            ->orWhere('username', 'ilike', $like)
                            ->orWhere('customer_code', 'ilike', $like));
                });
            })
            // "open" in the filter bar means the whole unfinished queue, not
            // just the untouched status of the same name — that is the view an
            // operator actually wants when they ask for open tickets
            ->when($filters['status'] ?? null, fn (Builder $q, string $s) => $s === 'unresolved'
                ? $q->stillOpen()
                : $q->where('status', $s))
            ->when($filters['priority'] ?? null, fn (Builder $q, string $p) => $q->where('priority', $p))
            ->when($filters['category'] ?? null, fn (Builder $q, string $c) => $q->where('category', $c))
            ->when($filters['customer_id'] ?? null, fn (Builder $q, $id) => $q->where('customer_id', $id))
            ->when($filters['assigned_to'] ?? null, fn (Builder $q, $id) => $id === 'unassigned'
                ? $q->whereNull('assigned_to')
                : $q->where('assigned_to', $id))
            ->when($filters['from'] ?? null, fn (Builder $q, string $d) => $q->whereDate('created_at', '>=', $d))
            ->when($filters['to'] ?? null, fn (Builder $q, string $d) => $q->whereDate('created_at', '<=', $d));
    }

    /**
     * Newest first, but with anything still needing work above anything
     * finished, and urgent above trivial inside that. Ordering by the priority
     * string alone would sort alphabetically — high, low, normal, urgent —
     * so the ranks are spelled out in SQL.
     */
    public function scopeQueueOrder(Builder $query): Builder
    {
        return $query
            ->orderByRaw('CASE WHEN status IN (?, ?) THEN 1 ELSE 0 END', [self::STATUS_RESOLVED, self::STATUS_CLOSED])
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END")
            ->orderByDesc('created_at');
    }

    public static function nextNumber(): string
    {
        $prefix = 'TKT-'.now()->format('Ym').'-';
        $last = static::withTrashed()
            ->where('ticket_number', 'like', $prefix.'%')
            ->orderByDesc('ticket_number')
            ->value('ticket_number');
        $seq = $last ? ((int) substr($last, strlen($prefix))) + 1 : 1;

        return $prefix.str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }

    /**
     * Move the ticket to a new status, stamping the moment it first reached
     * resolved or closed. Re-opening clears the stamp, so the timestamps always
     * describe the state the ticket is actually in.
     */
    public function moveTo(string $status): void
    {
        $this->status = $status;

        $this->resolved_at = in_array($status, [self::STATUS_RESOLVED, self::STATUS_CLOSED], true)
            ? ($this->resolved_at ?? now())
            : null;

        $this->closed_at = $status === self::STATUS_CLOSED ? ($this->closed_at ?? now()) : null;
    }
}
