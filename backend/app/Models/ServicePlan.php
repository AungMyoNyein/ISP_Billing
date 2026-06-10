<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ServicePlan extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name', 'price', 'download_speed_kbps', 'upload_speed_kbps',
        'session_timeout', 'idle_timeout', 'mikrotik_rate_limit',
        'validity_days', 'radius_group', 'is_active', 'description',
    ];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class);
    }

    /**
     * MikroTik rate limit string, e.g. "10M/5M" (upload/download as
     * rx/tx from the router's perspective is download/upload here).
     */
    public function rateLimit(): string
    {
        if ($this->mikrotik_rate_limit) {
            return $this->mikrotik_rate_limit;
        }

        $fmt = fn (int $kbps) => $kbps % 1024 === 0 ? ($kbps / 1024).'M' : $kbps.'k';

        return $fmt($this->upload_speed_kbps).'/'.$fmt($this->download_speed_kbps);
    }
}
