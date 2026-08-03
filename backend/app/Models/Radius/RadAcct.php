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
            // localtimestamp, not a bound now(): these columns are `timestamp
            // without time zone` and FreeRADIUS writes them in the database
            // server's local time, while Carbon's now() follows app.timezone
            // (UTC). Binding the PHP clock compared Yangon-local values against
            // a UTC threshold and silently widened a 30-minute window to seven
            // hours — sessions kept counting as online most of a day after
            // their accounting stopped. Comparing inside the database keeps
            // both sides on the same clock whatever either is set to.
            $query->whereRaw(
                "COALESCE(acctupdatetime, acctstarttime) >= localtimestamp - (? * interval '1 minute')",
                [$staleMinutes],
            );
        }

        return $query;
    }
}
