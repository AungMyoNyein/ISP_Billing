<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('routers', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('host');
            $table->unsignedInteger('api_port')->default(8728);
            $table->string('username');
            $table->text('password')->comment('encrypted');
            $table->boolean('use_ssl')->default(false);
            $table->string('nas_ip')->nullable()->comment('IP as seen by FreeRADIUS');
            $table->string('radius_secret')->nullable();
            $table->string('status')->default('unknown')->comment('online|offline|unknown');
            $table->timestamp('last_seen_at')->nullable();
            $table->json('last_resource')->nullable()->comment('cached /system/resource');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('routers');
    }
};
