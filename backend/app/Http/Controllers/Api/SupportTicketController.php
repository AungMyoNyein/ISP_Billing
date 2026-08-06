<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\SupportTicket;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SupportTicketController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tickets = SupportTicket::with([
            'customer:id,customer_code,name,username,phone',
            'assignee:id,name',
            'opener:id,name',
        ])
            ->withCount('replies')
            ->filter($request->only(['search', 'status', 'priority', 'category', 'customer_id', 'assigned_to', 'from', 'to']))
            ->queueOrder()
            ->paginate($request->integer('per_page', 15));

        return response()->json($tickets);
    }

    /** Values used to populate the filter bar and the ticket form dropdowns. */
    public function filterOptions(): JsonResponse
    {
        return response()->json([
            'statuses' => SupportTicket::STATUSES,
            'priorities' => SupportTicket::PRIORITIES,
            'categories' => SupportTicket::CATEGORIES,
            'agents' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'counts' => SupportTicket::selectRaw('status, count(*) as total')
                ->groupBy('status')->pluck('total', 'status'),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateData($request);

        $ticket = SupportTicket::create([
            ...$data,
            'ticket_number' => SupportTicket::nextNumber(),
            'opened_by' => $request->user()->id,
        ]);

        AuditLog::record('created', $ticket, [
            'ticket_number' => $ticket->ticket_number,
            'subject' => $ticket->subject,
        ]);

        return response()->json($this->withRelations($ticket), 201);
    }

    public function show(SupportTicket $supportTicket): JsonResponse
    {
        return response()->json($this->withRelations($supportTicket));
    }

    public function update(Request $request, SupportTicket $supportTicket): JsonResponse
    {
        $data = $this->validateData($request, $supportTicket);

        // status carries the resolved/closed stamps with it, so it goes through
        // the model rather than straight into the mass assignment
        $status = $data['status'] ?? null;
        unset($data['status']);

        $supportTicket->fill($data);
        if ($status !== null && $status !== $supportTicket->status) {
            $supportTicket->moveTo($status);
        }
        $supportTicket->save();

        AuditLog::record('updated', $supportTicket, $supportTicket->getChanges());

        return response()->json($this->withRelations($supportTicket));
    }

    public function destroy(SupportTicket $supportTicket): JsonResponse
    {
        $supportTicket->delete();
        AuditLog::record('deleted', $supportTicket, ['ticket_number' => $supportTicket->ticket_number]);

        return response()->json(['message' => 'Ticket deleted.']);
    }

    /**
     * Add a reply or an internal note, optionally moving the ticket in the same
     * action — answering and resolving is one thought for the operator, and
     * splitting it into two requests loses the second one often enough to
     * leave finished tickets sitting in the queue.
     */
    public function reply(Request $request, SupportTicket $supportTicket): JsonResponse
    {
        $data = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
            'is_internal' => ['boolean'],
            'status' => ['nullable', Rule::in(SupportTicket::STATUSES)],
        ]);

        $reply = $supportTicket->replies()->create([
            'user_id' => $request->user()->id,
            'body' => $data['body'],
            'is_internal' => $data['is_internal'] ?? false,
        ]);

        if (! empty($data['status']) && $data['status'] !== $supportTicket->status) {
            $supportTicket->moveTo($data['status']);
            $supportTicket->save();
        }

        AuditLog::record('replied', $supportTicket, [
            'ticket_number' => $supportTicket->ticket_number,
            'reply_id' => $reply->id,
            'internal' => $reply->is_internal,
            'status' => $supportTicket->status,
        ]);

        return response()->json($this->withRelations($supportTicket), 201);
    }

    private function withRelations(SupportTicket $ticket): SupportTicket
    {
        return $ticket->load([
            'customer:id,customer_code,name,username,phone,status,service_plan_id',
            'customer.servicePlan:id,name',
            'assignee:id,name',
            'opener:id,name',
            'replies' => fn ($q) => $q->with('user:id,name')->orderBy('created_at'),
        ]);
    }

    private function validateData(Request $request, ?SupportTicket $ticket = null): array
    {
        // an update may send any subset of the fields; a new ticket must carry
        // the ones that identify what is wrong and for whom
        $required = $ticket ? 'sometimes' : 'required';

        return $request->validate([
            'customer_id' => [$required, 'integer', Rule::exists('customers', 'id')->whereNull('deleted_at')],
            'subject' => [$required, 'string', 'max:200'],
            'description' => [$required, 'string', 'max:5000'],
            'category' => ['sometimes', Rule::in(SupportTicket::CATEGORIES)],
            'priority' => ['sometimes', Rule::in(SupportTicket::PRIORITIES)],
            'status' => ['sometimes', Rule::in(SupportTicket::STATUSES)],
            'assigned_to' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'resolution' => ['nullable', 'string', 'max:5000'],
        ]);
    }
}
