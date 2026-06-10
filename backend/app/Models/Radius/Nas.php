<?php

namespace App\Models\Radius;

use Illuminate\Database\Eloquent\Model;

class Nas extends Model
{
    protected $connection = 'radius';
    protected $table = 'nas';
    public $timestamps = false;

    protected $fillable = [
        'nasname', 'shortname', 'type', 'ports', 'secret',
        'server', 'community', 'description',
    ];

    protected $hidden = ['secret'];
}
