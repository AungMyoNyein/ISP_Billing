<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A NAS (PPPoE concentrator) known to FreeRADIUS. The billing app
 * only talks RADIUS to it: nas table sync for auth/acct, and
 * Disconnect-Requests to coa_port for live session kicks.
 */
class Router extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name', 'nas_ip', 'coa_port', 'radius_secret', 'notes',
    ];

    protected $hidden = ['radius_secret'];

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class);
    }
}
