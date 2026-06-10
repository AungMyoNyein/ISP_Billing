<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Crypt;

class Router extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name', 'host', 'api_port', 'username', 'password', 'use_ssl',
        'nas_ip', 'radius_secret', 'status', 'last_seen_at', 'last_resource', 'notes',
    ];

    protected $hidden = ['password', 'radius_secret'];

    protected function casts(): array
    {
        return [
            'use_ssl' => 'boolean',
            'last_seen_at' => 'datetime',
            'last_resource' => 'array',
        ];
    }

    protected function password(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value) => $value === null ? null : Crypt::decryptString($value),
            set: fn (?string $value) => $value === null ? null : Crypt::encryptString($value),
        );
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class);
    }
}
