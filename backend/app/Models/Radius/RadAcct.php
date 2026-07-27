<?php

namespace App\Models\Radius;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class RadAcct extends Model
{
    protected $connection = 'radius';
    protected $table = 'radacct';
    protected $primaryKey = 'radacctid';
    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'acctstarttime' => 'datetime',
            'acctupdatetime' => 'datetime',
            'acctstoptime' => 'datetime',
        ];
    }

    /**
     * Sessions that are actually online now.
     *
     * "No acctstoptime" alone is not enough: that row is only closed when the
     * NAS sends an Accounting-Stop, so a router that reboots, loses power or
     * has its uplink cut leaves its sessions open forever — and every online
     * count derived from them stays frozen at the moment things broke. A live
     * session keeps its accounting fresh via Acct-Interim-Interval, so require
     * recent activity too.
     *
     * COALESCE because acctupdatetime is null until the first interim update
     * lands, which would otherwise hide sessions that just started.
     */
    public function scopeOnline(Builder $query): Builder
    {
        $query->whereNotNull('acctstarttime')->whereNull('acctstoptime');

        $staleMinutes = (int) config('services.radius.session_stale_minutes', 30);
        if ($staleMinutes > 0) {
            $query->whereRaw(
                'COALESCE(acctupdatetime, acctstarttime) >= ?',
                [now()->subMinutes($staleMinutes)],
            );
        }

        return $query;
    }
}
