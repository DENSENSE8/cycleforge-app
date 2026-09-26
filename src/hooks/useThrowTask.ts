'use client';

/**
 * Throwing a task, headless — resolve a record or ticket, name the project,
 * choose a team, send one shared assignment.
 *
 * The quick overlay, task desk composer and phone sheet have different layouts
 * but share this sequence: resolve the record server-side, load the roster,
 * POST one task with every chosen member, and report a degraded amplifier.
 * A tracking number has no client-side decoder; the server's scan resolver
 * and {@link resolveThrowTargets} are the source of truth on every surface.
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
import { TASK_ASSIGNEES_MAX } from '@/lib/tasks/create-task-core';
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
  missing_title: 'Say what needs doing, or link a record.',
  unsupported_entity: 'That record kind cannot carry a task.',
  invalid_entity_id: 'That record could not be identified.',
  invalid_assignee: 'That person could not be found.',
  note_too_long: 'That note is too long.',
  project_name_too_long: 'That project name is too long.',
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
  /**
   * Called with the created task's id (null if the response omitted it) and
   * whether the creator is one of its assignees — i.e. it lands in "mine".
   */
  onThrown: (taskId: number | null, mine: boolean) => void;
  /** Which question the record field asks. See {@link ThrowTaskMode}. */
  mode?: ThrowTaskMode;
}) {
  const { user } = useAuth();
  const selfId = user?.staffId ?? null;
  const [raw, setRaw] = useState('');
  const [resolve, setResolve] = useState<ThrowResolveState>({ status: 'idle' });
  const [picked, setPicked] = useState<ThrowTarget | null>(null);
  const [staff, setStaff] = useState<StaffRecipient[] | null>(null);
  const [assignees, setAssignees] = useState<StaffRecipient[]>([]);
  const [projectName, setProjectName] = useState('');
  const [note, setNote] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [throwing, setThrowing] = useState(false);

  // One key per attempt, so a double-fire or a flaky-network retry collapses to
  // a no-op server-side instead of throwing the same record twice.
  const idempotencyKey = useRef(safeRandomUUID());

  // The recipient list is needed on every create, so it loads with the surface
  // rather than on demand. The creator is listed first and preselected: a task
  // you write is yours until you hand it to someone — untick yourself to pass it on.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/staff-picker', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { staff?: StaffRecipient[] } | null) => {
        if (cancelled) return;
        const list = data?.staff ?? [];
        const me = list.find((s) => s.id === selfId);
        setStaff(me ? [me, ...list.filter((s) => s.id !== selfId)] : list);
        if (me) setAssignees((current) => (current.length > 0 ? current : [me]));
      })
      .catch(() => {
        if (!cancelled) setStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selfId]);

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

  /**
   * A record is OPTIONAL on a plain task: without one, the words are the task,
   * so they are required instead. The ticket face exists to anchor a ticket,
   * so there the ticket stays required.
   */
  const hasWords = Boolean(note.trim() || projectName.trim());
  const ready = assignees.length > 0 && (picked != null || (mode === 'record' && hasWords));

  const submit = useCallback(async () => {
    if (!ready || throwing) return;
    setThrowing(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey.current,
        },
        body: JSON.stringify({
          ...(picked ? { entityType: picked.entityType, entityId: picked.entityId } : {}),
          assigneeStaffIds: assignees.map((person) => person.id),
          projectName: projectName.trim() || undefined,
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
      const title = projectName.trim() || note.trim().split('\n')[0] || picked?.label || 'Task';
      const thrown = `${title} → ${assignees.map((person) => person.name).join(', ')}`;

      if (notified === 'sent' && urgency !== 'failed') {
        toast.success(`Task created · ${thrown}`);
      } else if (notified === 'skipped_entity') {
        toast.warning(`Task created · ${thrown}`, {
          description: 'This record kind cannot raise an inbox item yet, so they were not notified.',
        });
      } else if (notified === 'failed') {
        toast.warning(`Task created · ${thrown}`, {
          description: 'One or more team members were not notified; the task was created.',
        });
      } else {
        toast.warning(`Task created · ${thrown}`, {
          description: 'The task was created but the record was not marked urgent.',
        });
      }
      // A fresh key for the NEXT task — the composer stays mounted after a
      // send, so reusing the settled key would make the second task a no-op.
      idempotencyKey.current = safeRandomUUID();
      onThrown(data?.task?.id ?? null, assignees.some((person) => person.id === selfId));
    } catch {
      toast.error('Could not throw that task.');
      idempotencyKey.current = safeRandomUUID();
    } finally {
      setThrowing(false);
    }
  }, [ready, picked, assignees, throwing, note, projectName, urgent, deadline, onThrown, selfId]);

  /** Keep the first selected member as the lead; a tap toggles membership. */
  const toggleAssignee = useCallback((person: StaffRecipient) => {
    setAssignees((current) =>
      current.some((member) => member.id === person.id)
        ? current.filter((member) => member.id !== person.id)
        : current.length < TASK_ASSIGNEES_MAX ? [...current, person] : current,
    );
  }, []);

  const toggleAssigneeById = useCallback(
    (staffId: number | null, staffName: string | null) => {
      if (staffId == null) return;
      const known = staff?.find((person) => person.id === staffId);
      if (known) toggleAssignee(known);
      else if (staffName) toggleAssignee({ id: staffId, name: staffName, role: '', color_hex: '' });
    },
    [staff, toggleAssignee],
  );

  /** Clear the draft without unmounting — the composer's "send another". */
  const reset = useCallback(() => {
    setRaw('');
    setResolve({ status: 'idle' });
    setPicked(null);
    const me = staff?.find((s) => s.id === selfId);
    setAssignees(me ? [me] : []);
    setProjectName('');
    setNote('');
    setUrgent(false);
    setDeadline(null);
  }, [staff, selfId]);

  return {
    raw,
    setRaw,
    resolve,
    targets: resolve.status === 'done' ? resolve.targets : [],
    picked,
    setPicked,
    staff,
    assignees,
    toggleAssignee,
    toggleAssigneeById,
    projectName,
    setProjectName,
    note,
    setNote,
    urgent,
    setUrgent,
    deadline,
    setDeadline,
    throwing,
    canThrow: ready && !throwing,
    /** What still blocks the create, in field order; null when ready. */
    missing: picked == null && !(mode === 'record' && hasWords)
      ? mode === 'ticket'
        ? 'Find the ticket first'
        : 'Say what needs doing'
      : assignees.length === 0
        ? 'Pick who it goes to'
        : null,
    runResolve,
    submit,
    reset,
  };
}
