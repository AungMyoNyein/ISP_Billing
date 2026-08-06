"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, Field, Modal, PageHeader, inputCls } from "@/components/ui";
import { TicketForm } from "@/components/TicketForm";
import type { SupportTicket, TicketOptions } from "@/lib/types";

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [options, setOptions] = useState<TicketOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(() => {
    api<SupportTicket>(`/tickets/${id}`).then(setTicket).catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    api<TicketOptions>("/tickets/filter-options").then(setOptions).catch(() => {});
  }, []);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    try {
      setTicket(await api<SupportTicket>(`/tickets/${id}`, { method: "PUT", body }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function remove() {
    if (!confirm("Delete this ticket and its whole reply history?")) return;
    try {
      await api(`/tickets/${id}`, { method: "DELETE" });
      router.push("/support/tickets");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (!ticket) {
    return <div className="py-20 text-center text-slate-400">{error ?? "Loading…"}</div>;
  }

  const finished = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <div>
      <PageHeader
        title={ticket.subject}
        subtitle={`${ticket.ticket_number} · opened ${formatDateTime(ticket.created_at)}${
          ticket.opener ? ` by ${ticket.opener.name}` : ""
        }`}
        actions={
          <>
            <Badge value={ticket.priority} />
            <Badge value={humanize(ticket.status)} />
            <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit</Button>
            <Button variant="ghost" onClick={remove}>Delete</Button>
          </>
        }
      />
      <ErrorNote message={error} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Reported issue</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{ticket.description}</p>
          </Card>

          <Conversation ticket={ticket} onPosted={setTicket} onError={setError} />
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Customer</p>
            {ticket.customer ? (
              <div className="space-y-1.5 text-sm">
                <Link className="font-medium text-blue-700" href={`/customers/${ticket.customer.id}`}>
                  {ticket.customer.name}
                </Link>
                <Row label="Code" value={ticket.customer.customer_code} />
                <Row label="Username" value={ticket.customer.username} />
                <Row label="Phone" value={ticket.customer.phone ?? "—"} />
                <Row label="Plan" value={ticket.customer.service_plan?.name ?? "—"} />
                <Row label="Account" value={<Badge value={ticket.customer.status} />} />
              </div>
            ) : (
              <p className="text-sm text-slate-400">Customer removed.</p>
            )}
          </Card>

          <Card className="p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Handling</p>
            <div className="space-y-3">
              <Field label="Status">
                <select
                  className={`${inputCls} capitalize`}
                  value={ticket.status}
                  onChange={(e) => patch({ status: e.target.value })}
                >
                  {(options?.statuses ?? [ticket.status]).map((s) => (
                    <option key={s} value={s} className="capitalize">{humanize(s)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select
                  className={`${inputCls} capitalize`}
                  value={ticket.priority}
                  onChange={(e) => patch({ priority: e.target.value })}
                >
                  {(options?.priorities ?? [ticket.priority]).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Assigned to">
                <select
                  className={inputCls}
                  value={ticket.assigned_to ?? ""}
                  onChange={(e) => patch({ assigned_to: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Unassigned</option>
                  {(options?.agents ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <div className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
                <Row label="Category" value={<span className="capitalize">{humanize(ticket.category)}</span>} />
                <Row label="Opened" value={formatDate(ticket.created_at)} />
                <Row label="Resolved" value={ticket.resolved_at ? formatDateTime(ticket.resolved_at) : "—"} />
                <Row label="Closed" value={ticket.closed_at ? formatDateTime(ticket.closed_at) : "—"} />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Resolution</p>
            <ResolutionBox
              value={ticket.resolution ?? ""}
              hint={finished ? undefined : "Recorded when the ticket is resolved."}
              onSave={(resolution) => patch({ resolution: resolution || null })}
            />
          </Card>
        </div>
      </div>

      <Modal title={`Edit ${ticket.ticket_number}`} open={editOpen} onClose={() => setEditOpen(false)} wide>
        <TicketForm
          ticket={ticket}
          options={options ?? undefined}
          onSaved={(t) => { setTicket(t); setEditOpen(false); }}
        />
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}

/**
 * The reply thread, and the box that adds to it.
 *
 * Posting can carry a status change with it, because "answer the customer and
 * mark it resolved" is one action to the person doing it — sending it as one
 * request is also what keeps the reply and the status from disagreeing when the
 * second call fails.
 */
function Conversation({ ticket, onPosted, onError }: {
  ticket: SupportTicket;
  onPosted: (t: SupportTicket) => void;
  onError: (message: string | null) => void;
}) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [alsoResolve, setAlsoResolve] = useState(false);
  const [busy, setBusy] = useState(false);
  const replies = ticket.replies ?? [];
  const unfinished = ticket.status !== "resolved" && ticket.status !== "closed";

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    onError(null);
    try {
      const updated = await api<SupportTicket>(`/tickets/${ticket.id}/replies`, {
        method: "POST",
        body: {
          body,
          is_internal: internal,
          status: alsoResolve ? "resolved" : undefined,
        },
      });
      onPosted(updated);
      setBody("");
      setInternal(false);
      setAlsoResolve(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not post reply");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
        Conversation {replies.length > 0 && <span className="text-slate-400">({replies.length})</span>}
      </p>

      {replies.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No replies yet.</p>
      ) : (
        <div className="space-y-3">
          {replies.map((r) => (
            <div
              key={r.id}
              className={`rounded-md border p-3 ${
                r.is_internal ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-white"
              }`}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-slate-700">{r.user?.name ?? "Removed user"}</span>
                <span className="text-slate-400">{formatDateTime(r.created_at)}</span>
                {r.is_internal && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">Internal note</span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{r.body}</p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={post} className="mt-4 border-t border-slate-100 pt-4">
        <textarea
          className={`${inputCls} h-24 py-2`}
          placeholder={internal ? "Internal note — staff only…" : "Reply to the customer…"}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              Internal note
            </label>
            {unfinished && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" className="h-4 w-4" checked={alsoResolve} onChange={(e) => setAlsoResolve(e.target.checked)} />
                Mark resolved
              </label>
            )}
          </div>
          <Button type="submit" disabled={busy || !body.trim()}>
            {busy ? "Posting…" : internal ? "Add Note" : "Add Reply"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Free-text resolution, saved explicitly so a half-typed note is never sent. */
function ResolutionBox({ value, hint, onSave }: {
  value: string;
  hint?: string;
  onSave: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  return (
    <div>
      <textarea
        className={`${inputCls} h-24 py-2`}
        placeholder="What fixed it?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={5000}
      />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      <div className="mt-2 flex justify-end">
        <Button variant="secondary" disabled={text === value} onClick={() => onSave(text)}>Save</Button>
      </div>
    </div>
  );
}
