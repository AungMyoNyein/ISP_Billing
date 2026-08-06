<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Customer support tickets, filed by staff.
 *
 * The opening complaint lives on the ticket itself (`description`) rather than
 * as the first row of `ticket_replies`: a ticket always has exactly one of
 * them, and keeping it on the parent means the list screen can show what the
 * customer reported without a join or a second query per row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_tickets', function (Blueprint $table) {
            $table->id();
            $table->string('ticket_number')->unique();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->string('subject');
            $table->text('description');
            $table->string('category')->default('other')
                ->comment('connectivity|slow_speed|billing|installation|hardware|complaint|other');
            $table->string('priority')->default('normal')->comment('low|normal|high|urgent');
            $table->string('status')->default('open')
                ->comment('open|in_progress|pending_customer|resolved|closed');
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('opened_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('resolution')->nullable();
            // stamped by the model when status moves into resolved/closed, so
            // "how long did this take" survives a later status change
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            // the queue screen's default view: open tickets, worst first
            $table->index(['status', 'priority']);
            $table->index('assigned_to');
            $table->index('created_at');
        });

        Schema::create('ticket_replies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('support_ticket_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('body');
            // internal notes are staff-to-staff working notes; they are kept
            // apart from the reply thread so a future customer-facing view can
            // show one without ever exposing the other
            $table->boolean('is_internal')->default(false);
            $table->timestamps();

            $table->index(['support_ticket_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ticket_replies');
        Schema::dropIfExists('support_tickets');
    }
};
