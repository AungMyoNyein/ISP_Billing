<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * FreeRADIUS post-auth log table. The stock 3.x default site runs the
 * sql module in post-auth ("-sql"), which inserts a row per Access-Accept
 * or Access-Reject — without this table every authentication fails.
 */
return new class extends Migration
{
    protected $connection = 'radius';

    public function up(): void
    {
        $schema = Schema::connection('radius');

        if (! $schema->hasTable('radpostauth')) {
            $schema->create('radpostauth', function (Blueprint $table) {
                $table->id();
                $table->string('username', 64)->default('')->index();
                $table->string('pass', 64)->default('');
                $table->string('reply', 32)->default('');
                $table->timestamp('authdate')->useCurrent();
                $table->string('class', 64)->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::connection('radius')->dropIfExists('radpostauth');
    }
};
