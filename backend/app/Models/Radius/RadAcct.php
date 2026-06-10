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

    /** Sessions that have started and not yet stopped (online now). */
    public function scopeOnline(Builder $query): Builder
    {
        return $query->whereNotNull('acctstarttime')->whereNull('acctstoptime');
    }
}
