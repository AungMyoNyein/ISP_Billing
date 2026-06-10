<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * FreeRADIUS standard SQL schema (radcheck, radreply, radusergroup,
 * radgroupcheck, radgroupreply, radacct, nas) created on the dedicated
 * "radius" connection so the billing system can share the database with
 * a real FreeRADIUS instance. If FreeRADIUS already created these tables
 * the migration skips them.
 */
return new class extends Migration
{
    protected $connection = 'radius';

    public function up(): void
    {
        $schema = Schema::connection('radius');

        if (! $schema->hasTable('radcheck')) {
            $schema->create('radcheck', function (Blueprint $table) {
                $table->id();
                $table->string('username', 64)->default('')->index();
                $table->string('attribute', 64)->default('');
                $table->string('op', 2)->default('==');
                $table->string('value', 253)->default('');
            });
        }

        if (! $schema->hasTable('radreply')) {
            $schema->create('radreply', function (Blueprint $table) {
                $table->id();
                $table->string('username', 64)->default('')->index();
                $table->string('attribute', 64)->default('');
                $table->string('op', 2)->default('=');
                $table->string('value', 253)->default('');
            });
        }

        if (! $schema->hasTable('radusergroup')) {
            $schema->create('radusergroup', function (Blueprint $table) {
                $table->id();
                $table->string('username', 64)->default('')->index();
                $table->string('groupname', 64)->default('');
                $table->integer('priority')->default(1);
            });
        }

        if (! $schema->hasTable('radgroupcheck')) {
            $schema->create('radgroupcheck', function (Blueprint $table) {
                $table->id();
                $table->string('groupname', 64)->default('')->index();
                $table->string('attribute', 64)->default('');
                $table->string('op', 2)->default('==');
                $table->string('value', 253)->default('');
            });
        }

        if (! $schema->hasTable('radgroupreply')) {
            $schema->create('radgroupreply', function (Blueprint $table) {
                $table->id();
                $table->string('groupname', 64)->default('')->index();
                $table->string('attribute', 64)->default('');
                $table->string('op', 2)->default('=');
                $table->string('value', 253)->default('');
            });
        }

        if (! $schema->hasTable('radacct')) {
            $schema->create('radacct', function (Blueprint $table) {
                $table->bigIncrements('radacctid');
                $table->string('acctsessionid', 64)->default('')->index();
                $table->string('acctuniqueid', 32)->default('')->unique();
                $table->string('username', 64)->default('')->index();
                $table->string('realm', 64)->nullable();
                $table->string('nasipaddress', 15)->default('')->index();
                $table->string('nasportid', 32)->nullable();
                $table->string('nasporttype', 32)->nullable();
                $table->timestamp('acctstarttime')->nullable()->index();
                $table->timestamp('acctupdatetime')->nullable();
                $table->timestamp('acctstoptime')->nullable()->index();
                $table->bigInteger('acctinterval')->nullable();
                $table->bigInteger('acctsessiontime')->nullable();
                $table->string('acctauthentic', 32)->nullable();
                $table->string('connectinfo_start', 128)->nullable();
                $table->string('connectinfo_stop', 128)->nullable();
                $table->bigInteger('acctinputoctets')->nullable();
                $table->bigInteger('acctoutputoctets')->nullable();
                $table->string('calledstationid', 50)->default('');
                $table->string('callingstationid', 50)->default('');
                $table->string('acctterminatecause', 32)->default('');
                $table->string('servicetype', 32)->nullable();
                $table->string('framedprotocol', 32)->nullable();
                $table->string('framedipaddress', 15)->default('')->index();
                $table->string('framedipv6address', 45)->nullable();
                $table->string('framedipv6prefix', 45)->nullable();
                $table->string('framedinterfaceid', 44)->nullable();
                $table->string('delegatedipv6prefix', 45)->nullable();
                $table->string('class', 64)->nullable();
            });
        }

        if (! $schema->hasTable('nas')) {
            $schema->create('nas', function (Blueprint $table) {
                $table->id();
                $table->string('nasname', 128)->index();
                $table->string('shortname', 32)->nullable();
                $table->string('type', 30)->default('other');
                $table->integer('ports')->nullable();
                $table->string('secret', 60)->default('secret');
                $table->string('server', 64)->nullable();
                $table->string('community', 50)->nullable();
                $table->string('description', 200)->default('RADIUS Client');
            });
        }
    }

    public function down(): void
    {
        $schema = Schema::connection('radius');
        foreach (['radacct', 'radgroupreply', 'radgroupcheck', 'radusergroup', 'radreply', 'radcheck', 'nas'] as $table) {
            $schema->dropIfExists($table);
        }
    }
};
