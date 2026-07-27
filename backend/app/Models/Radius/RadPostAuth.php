<?php

namespace App\Models\Radius;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * FreeRADIUS post-auth log: one row per Access-Accept / Access-Reject.
 *
 * Read-only for us — FreeRADIUS writes it. The `pass` column holds the
 * credential the client submitted, so it is hidden and must never reach
 * the API.
 */
class RadPostAuth extends Model
{
    protected $connection = 'radius';

    protected $table = 'radpostauth';

    public $timestamps = false;

    protected $guarded = [];

    protected $hidden = ['pass'];

    protected function casts(): array
    {
        return [
            'authdate' => 'datetime',
        ];
    }

    /** Rejected authentications — the rows worth looking at first. */
    public function scopeRejected(Builder $query): Builder
    {
        return $query->where('reply', 'Access-Reject');
    }
}
