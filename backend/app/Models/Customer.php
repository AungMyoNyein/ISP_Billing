<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;

class Customer extends Model
{
    use SoftDeletes;

    public const STATUS_PENDING = 'pending';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_SUSPENDED = 'suspended';

    public const STATUS_EXPIRED = 'expired';

    public const STATUS_DISABLED = 'disabled';

    protected $fillable = [
        'customer_code', 'username', 'radius_password', 'name', 'phone',
        'address', 'dn_zone', 'sn_odb', 'gps_location', 'status', 'notes',
        'service_plan_id', 'router_id', 'smartolt_onu_sn', 'framed_ip_address',
        'activation_date', 'expiry_date', 'last_renewed_at',
    ];

    protected $hidden = ['radius_password'];

    protected function casts(): array
    {
        return [
            'activation_date' => 'date',
            'expiry_date' => 'date',
            'last_renewed_at' => 'datetime',
        ];
    }

    protected function radiusPassword(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value) => $value === null ? null : $this->decryptPassword($value),
            set: fn (?string $value) => $value === null ? null : Crypt::encryptString($value),
        );
    }

    /**
     * A row encrypted under a different APP_KEY — restored from a backup, or
     * copied from the other host — cannot be read back. Returning null lets
     * the customer still be opened and the password re-entered, where
     * throwing took the whole detail page down with a DecryptException
     * ("The MAC is invalid") and left no way to fix it from the UI.
     */
    private function decryptPassword(string $value): ?string
    {
        try {
            return Crypt::decryptString($value);
        } catch (\Throwable $e) {
            Log::warning('Customer RADIUS password could not be decrypted.', [
                'customer_id' => $this->getKey(),
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    public function servicePlan(): BelongsTo
    {
        return $this->belongsTo(ServicePlan::class);
    }

    public function router(): BelongsTo
    {
        return $this->belongsTo(Router::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(SupportTicket::class);
    }

    public function scopeStatus(Builder $query, string $status): Builder
    {
        return $query->where('status', $status);
    }

    public function scopeExpiringWithin(Builder $query, int $days): Builder
    {
        return $query->whereNotNull('expiry_date')
            ->whereBetween('expiry_date', [now()->startOfDay(), now()->addDays($days)->endOfDay()])
            ->whereIn('status', [self::STATUS_ACTIVE]);
    }

    /** Common list filters used by CRM and billing screens. */
    public function scopeFilter(Builder $query, array $filters): Builder
    {
        return $query
            ->when($filters['search'] ?? null, function (Builder $q, string $search) {
                $q->where(function (Builder $q) use ($search) {
                    $like = '%'.$search.'%';
                    $q->where('name', 'ilike', $like)
                        ->orWhere('username', 'ilike', $like)
                        ->orWhere('customer_code', 'ilike', $like)
                        ->orWhere('phone', 'ilike', $like)
                        ->orWhere('address', 'ilike', $like);
                });
            })
            ->when($filters['status'] ?? null, fn (Builder $q, string $s) => $q->where('status', $s))
            ->when($filters['dn_zone'] ?? null, fn (Builder $q, string $z) => $q->where('dn_zone', $z))
            ->when($filters['sn_odb'] ?? null, fn (Builder $q, string $o) => $q->where('sn_odb', $o))
            ->when($filters['service_plan_id'] ?? null, fn (Builder $q, $id) => $q->where('service_plan_id', $id))
            ->when($filters['router_id'] ?? null, fn (Builder $q, $id) => $q->where('router_id', $id));
    }
}
