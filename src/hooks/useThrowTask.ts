'use client';

/**
 * Throwing a task, headless — resolve a record, pick a person, send.
 *
 * ## Why a hook and not two copies
 *
 * Two surfaces hand work to a colleague and they are genuinely different
 * shapes: `ThrowTaskPanel` is a 380px chord-summoned overlay ("I am holding
 * this thing, take it"), and the task desk's composer is a full inline form
 * with a deadline ("plan this work"). What they share is not layout — it is
 * the SEQUENCE: resolve the record server-side, load the roster, POST the
 * task, and report honestly when an amplifier degraded. That sequence has four
 * branch points a second copy would get subtly wrong, so it lives here once
 * and each surface brings its own chrome.
 *
 * ## Resolution is server-side, and that is not an implementation detail
 *
 * A tracking number is the single most likely thing to be in an operator's
 * hand, and `routeScan` — the client-side decoder — has **no tracking
 * vocabulary**. It decodes what this app PRINTS. Only `POST /api/scan/resolve`
 * can turn a carrier number into the order(s) it belongs to, so the field posts
 * there and {@link resolveThrowTargets} reads the answer back. A local parse
 * would silently fail on the commonest input.
 *
 * ## The two amplifiers are reported, never hidden
 *
 * `POST /api/tasks` returns what happened to the RECORD (`urgency`) and whether
 * the recipient was actually told (`notified`) alongside the task. Both may
 * degrade without failing the throw — a helpdesk that is down, or a record kind
 * the inbox cannot anchor (`isInboxAnchorable`; every kind a task can point at
 * is anchorable since migration `2026-09-22a`, and the branch stays for the
 * next enum value). A thrown-but-nobody-notified handoff looks exactly like a
 * delivered one, so the toast says which one happened rather than reporting a
 * flat success.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { resolveThrowTargets, type ThrowTarget } from '@/lib/tasks/throw-targets';
import type { StaffRecipient } from '@/lib/staff/staff-recipient';

/**
 * What the record field is looking FOR.
 *
 * `record` posts the typed value at `/api/scan/resolve` — the decoder for
 * things this app prints. `ticket` posts it at `/api/tasks/ticket-target`,
 * because a helpdesk number is not printed here and the scan resolver has no
 * vocabulary for it. Same field, same picked-target shape, different question.
 */
export type ThrowTaskMode = 'record' | 'ticket';

export type ThrowResolveState =
  | { status: 'idle' }
  | { status: 'resolving' }
  | { status: 'done'; targets: ThrowTarget[]; raw: string }
  | { status: 'error' }
  /**
   * A refusal the server put into words — a mistyped ticket number, a ticket
   * neither the registry nor the helpdesk knows, a helpdesk that did not
   * answer. Carried as a message because "try again" is wrong advice for two
   * of the three.
   */
  | { status: 'refused'; message: string }
  /**
   * Resolve is gated on `sku_stock.view` while throwing is gated on
   * `work_orders.claim`, so a role can legitimately hold one and not the
   * other. Reported as its own state because "try again" is the wrong advice
   * for a permission wall.
   */
  | { status: 'denied' };

/** Stable identity for a target across re-resolves. */
export function throwTargetKey(target: ThrowTarget): string {
  return `${target.entityType}:${target.entityId}`;
}

/** Refusals `POST /api/tasks` can return, in words an operator can act on. */
const REFUSAL_COPY: Record<string, string> = {
  self_throw: 'You cannot throw a task at yourself.',
  unsupported_entity: 'That record kind cannot carry a task.',
  invalid_entity_id: 'That record could not be identified.',
  invalid_assignee: 'That person could not be found.',
  note_too_long: 'That note is too long.',
};

/** Refusals `POST /api/tasks/ticket-target` can return, in the same voice. */
const TICKET_REFUSAL_COPY: Record<string, string> = {
  invalid_number: 'A ticket is a number — 48120, or #48120.',
  not_found: 'No ticket with that number, here or on the helpdesk.',
  helpdesk_unavailable: 'The helpdesk did not answer. Try that number again shortly.',
};

export function useThrowTask({
  onThrown,
  mode = 'record',
}: {
  onThrown: () => void;
  /** Which question the record field asks. See {@link ThrowTaskMode}. */
  mode?: ThrowTaskMode;
}) {
  const { user } = useAuth();

  const [raw, setRaw] = useState('');
  const [resolve, setResolve] = useState<ThrowResolveState>({ status: 'idle' });
  const [picked, setPicked] = useState<ThrowTarget | null>(null);
  const [staff, setStaff] = useState<StaffRecipient[] | null>(null);
  const [assignee, setAssignee] = useState<StaffRecipient | null>(null);
  const [note, setNote] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [throwing, setThrowing] = useState(false);

  // One key per attempt, so a double-fire or a flaky-network retry collapses to
  // a no-op server-side instead of throwing the same record twice.
  const idempotencyKey = useRef(safeRandomUUID());

  // The recipient list is needed on every throw, so it loads with the surface
  // rather than on demand — a picker that spins after the record resolves puts
  // the wait in the middle of the flow instead of before it.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/staff-picker', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { staff?: StaffRecipient[] } | null) => {
        if (cancelled) return;
        setStaff((data?.staff ?? []).filter((s) => s.id !== user?.staffId));
      })
      .catch(() => {
        if (!cancelled) setStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.staffId]);

  /**
   * Switching what the field ASKS FOR invalidates what it found. A carton
   * picked under `record` must not survive into a Ticket draft and get thrown
   * as the ticket the operator believes they just typed.
   */
  useEffect(() => {
    setRaw('');
    setResolve({ status: 'idle' });
    setPicked(null);
  }, [mode]);

  const resolveTicket = useCallback(async (value: string) => {
    const res = await fetch('/api/tasks/ticket-target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: value }),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401 || res.status === 403) {
      setResolve({ status: 'denied' });
      return;
    }
    if (!res.ok) {
      const reason = typeof data?.error === 'string' ? data.error : '';
      const message = TICKET_REFUSAL_COPY[reason];
      setResolve(message ? { status: 'refused', message } : { status: 'error' });
      return;
    }
    const target = (data?.target ?? null) as ThrowTarget | null;
    if (!target) {
      setResolve({ status: 'error' });
      return;
    }
    // A ticket number names exactly ONE ticket, so there is never a list to
    // choose from — the answer is the pick.
    setResolve({ status: 'done', targets: [target], raw: value });
    setPicked(target);
  }, []);

  const runResolve = useCallback(async () => {
    const value = raw.trim();
    if (!value) return;
    setResolve({ status: 'resolving' });
    setPicked(null);
    try {
      if (mode === 'ticket') {
        await resolveTicket(value);
        return;
      }
      const res = await fetch('/api/scan/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The route reads `input` — not `value`, which is the name the response
        // uses for the decoded payload.
        body: JSON.stringify({ input: value }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401 || res.status === 403) {
        setResolve({ status: 'denied' });
        return;
      }
      if (!res.ok || !data) {
        setResolve({ status: 'error' });
        return;
      }
      const targets = resolveThrowTargets(data);
      setResolve({ status: 'done', targets, raw: value });
      // One unambiguous answer needs no choosing — a scanned sticker names
      // exactly one record, and asking the operator to confirm it is a click
      // that says nothing.
      if (targets.length === 1) setPicked(targets[0]);
    } catch {
      setResolve({ status: 'error' });
    }
  }, [raw, mode, resolveTicket]);

  const submit = useCallback(async () => {
    if (!picked || !assignee || throwing) return;
    setThrowing(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey.current,
        },
        body: JSON.stringify({
          entityType: picked.entityType,
          entityId: picked.entityId,
          assigneeStaffId: assignee.id,
          note: note.trim() || undefined,
          urgency: urgent ? 'urgent' : 'normal',
          deadlineAt: deadline ? deadline.toISOString() : undefined,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const reason = typeof data?.error === 'string' ? data.error : '';
        toast.error(REFUSAL_COPY[reason] ?? 'Could not throw that task.');
        // A refused attempt is a different attempt once it is corrected.
        idempotencyKey.current = safeRandomUUID();
        return;
      }

      // Honest reporting: the task landed, but say so if an amplifier did not.
      const notified: string = data?.notified ?? 'sent';
      const urgency: string = data?.urgency ?? 'not_urgent';
      const thrown = `${picked.label} → ${assignee.name}`;

      if (notified === 'sent' && urgency !== 'failed') {
        toast.success(`Thrown · ${thrown}`);
      } else if (notified === 'skipped_entity') {
        toast.warning(`Thrown · ${thrown}`, {
          description: 'This record kind cannot raise an inbox item yet, so they were not notified.',
        });
      } else if (notified === 'failed') {
        toast.warning(`Thrown · ${thrown}`, {
          description: 'The task was created but the notification did not go out.',
        });
      } else {
        toast.warning(`Thrown · ${thrown}`, {
          description: 'The task was created but the record was not marked urgent.',
        });
      }
      // A fresh key for the NEXT task — the composer stays mounted after a
      // send, so reusing the settled key would make the second task a no-op.
      idempotencyKey.current = safeRandomUUID();
      onThrown();
    } catch {
      toast.error('Could not throw that task.');
      idempotencyKey.current = safeRandomUUID();
    } finally {
      setThrowing(false);
    }
  }, [picked, assignee, throwing, note, urgent, deadline, onThrown]);

  /**
   * Pick by id — for a combobox that commits `(staffId, staffName)` rather
   * than handing back a roster row. Resolves against the loaded roster so the
   * face keeps its avatar colour; synthesises a minimal recipient only when
   * the roster has not settled, because the POST needs the id and nothing
   * else.
   */
  const setAssigneeById = useCallback(
    (staffId: number | null, staffName: string | null) => {
      if (staffId == null) {
        setAssignee(null);
        return;
      }
      const known = staff?.find((s) => s.id === staffId);
      setAssignee(known ?? { id: staffId, name: staffName ?? `#${staffId}`, role: '', color_hex: '' });
    },
    [staff],
  );

  /** Clear the draft without unmounting — the composer's "send another". */
  const reset = useCallback(() => {
    setRaw('');
    setResolve({ status: 'idle' });
    setPicked(null);
    setAssignee(null);
    setNote('');
    setUrgent(false);
    setDeadline(null);
  }, []);

  return {
    raw,
    setRaw,
    resolve,
    targets: resolve.status === 'done' ? resolve.targets : [],
    picked,
    setPicked,
    staff,
    assignee,
    setAssignee,
    setAssigneeById,
    note,
    setNote,
    urgent,
    setUrgent,
    deadline,
    setDeadline,
    throwing,
    canThrow: Boolean(picked && assignee) && !throwing,
    runResolve,
    submit,
    reset,
  };
}
