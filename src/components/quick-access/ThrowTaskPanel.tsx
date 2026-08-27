'use client';

/**
 * Throw a task at a colleague — scan or paste what you are holding, pick who,
 * send.
 *
 * ## Why one panel and not a wizard
 *
 * Three fields (what · who · why) that all stay on screen at once. A stepped
 * wizard would hide the record while the operator picks a person, and hide the
 * person while they type the note — and the whole value of this surface is that
 * it is faster than writing a number on paper. Everything is mounted from the
 * first frame and fills in as it resolves (spatial predictability), so the panel
 * never reflows under a hand that is already moving toward Throw.
 *
 * ## Resolution is server-side, and that is not an implementation detail
 *
 * A tracking number is the single most likely thing to be in an operator's hand,
 * and `routeScan` — the client-side decoder — has **no tracking vocabulary**. It
 * decodes what this app PRINTS. Only `POST /api/scan/resolve` can turn a carrier
 * number into the order(s) it belongs to, so the field posts there and
 * {@link resolveThrowTargets} reads the answer back. A local parse would silently
 * fail on the commonest input.
 *
 * ## The two amplifiers are reported, never hidden
 *
 * `POST /api/tasks` returns what happened to the RECORD (`urgency`) and whether
 * the recipient was actually told (`notified`) alongside the task. Both may
 * degrade without failing the throw — a helpdesk that is down, or a ticket task
 * the inbox cannot anchor yet. A thrown-but-nobody-notified handoff looks
 * exactly like a delivered one, so the toast says which one happened rather
 * than reporting a flat success.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Inbox, Loader2, Package, Search, Send, Zap } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { resolveThrowTargets, type ThrowTarget } from '@/lib/tasks/throw-targets';
import { TASK_NOTE_MAX } from '@/lib/tasks/create-task-core';
import { Button, Switch } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { QuickAccessPanelShell } from './QuickAccessPanelShell';
import { StaffRecipientList, type StaffRecipient } from './StaffRecipientList';

interface ThrowTaskPanelProps {
  onClose: () => void;
}

type ResolveState =
  | { status: 'idle' }
  | { status: 'resolving' }
  | { status: 'done'; targets: ThrowTarget[]; raw: string }
  | { status: 'error' }
  /**
   * Resolve is gated on `sku_stock.view` while throwing is gated on
   * `work_orders.claim`, so a role can legitimately hold one and not the other.
   * Reported apart from a transient failure: "try again" is advice that can
   * never work here, and the fix is an admin granting a permission.
   */
  | { status: 'denied' };

const targetKey = (t: ThrowTarget) => `${t.entityType}:${t.entityId}`;

/** Refusals `POST /api/tasks` can return, in words an operator can act on. */
const REFUSAL_COPY: Record<string, string> = {
  self_throw: 'You cannot throw a task at yourself.',
  unsupported_entity: 'That record kind cannot carry a task.',
  invalid_entity_id: 'That record could not be identified.',
  invalid_assignee: 'That person could not be found.',
  note_too_long: 'That note is too long.',
};

export function ThrowTaskPanel({ onClose }: ThrowTaskPanelProps) {
  const { user } = useAuth();

  const [raw, setRaw] = useState('');
  const [resolve, setResolve] = useState<ResolveState>({ status: 'idle' });
  const [picked, setPicked] = useState<ThrowTarget | null>(null);
  const [staff, setStaff] = useState<StaffRecipient[] | null>(null);
  const [assignee, setAssignee] = useState<StaffRecipient | null>(null);
  const [note, setNote] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [throwing, setThrowing] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);
  // One key per attempt, so a double-fire or a flaky-network retry collapses to
  // a no-op server-side instead of throwing the same record twice.
  const idempotencyKey = useRef(safeRandomUUID());

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  // The recipient list is needed on every throw, so it loads with the panel
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

  const runResolve = useCallback(async () => {
    const value = raw.trim();
    if (!value) return;
    setResolve({ status: 'resolving' });
    setPicked(null);
    try {
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
  }, [raw]);

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
      onClose();
    } catch {
      toast.error('Could not throw that task.');
      idempotencyKey.current = safeRandomUUID();
    } finally {
      setThrowing(false);
    }
  }, [picked, assignee, throwing, note, urgent, onClose]);

  const targets = resolve.status === 'done' ? resolve.targets : [];
  const canThrow = Boolean(picked && assignee) && !throwing;

  return (
    <QuickAccessPanelShell
      title="Throw a task"
      subtitle="Hand a record to a colleague"
      onClose={onClose}
      widthClass="w-[380px]"
      maxHeightClass="max-h-[560px]"
      toolbar={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runResolve();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint"
              aria-hidden
            />
            <input
              ref={scanRef}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Scan or paste tracking, PO, order…"
              aria-label="Record to throw"
              className={cn(
                'w-full rounded-md border border-border-soft bg-surface-card py-1.5 pl-7 pr-2',
                'text-role-caption text-text-default placeholder:text-text-faint',
                focusRing('field'),
              )}
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" disabled={!raw.trim() || resolve.status === 'resolving'}>
            {resolve.status === 'resolving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Find'}
          </Button>
        </form>
      }
      footer={
        <div className="flex items-center gap-3">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <Switch checked={urgent} onCheckedChange={setUrgent} aria-label="Mark urgent" />
            <span className="inline-flex items-center gap-1 text-role-caption text-text-muted">
              <Zap className={cn('h-3.5 w-3.5', urgent ? 'text-amber-600' : 'text-text-faint')} aria-hidden />
              Urgent
            </span>
          </label>
          <Button type="button" size="sm" onClick={() => void submit()} disabled={!canThrow}>
            {throwing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Send className="h-3.5 w-3.5" aria-hidden /> Throw
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* ── What ─────────────────────────────────────────────────────── */}
        <section className="space-y-1">
          <p className="px-1 text-role-micro uppercase tracking-widest text-text-soft">Record</p>
          {resolve.status === 'idle' ? (
            <p className="px-1 py-2 text-role-caption text-text-faint">
              Scan a carton label, or paste a tracking number, PO or order id.
            </p>
          ) : resolve.status === 'resolving' ? (
            <p className="flex items-center gap-2 px-1 py-2 text-role-caption text-text-faint">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Looking that up…
            </p>
          ) : resolve.status === 'error' ? (
            <p className="flex items-center gap-2 px-1 py-2 text-role-caption text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> That lookup failed. Try again.
            </p>
          ) : resolve.status === 'denied' ? (
            <p className="flex items-center gap-2 px-1 py-2 text-role-caption text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> Your role cannot look records up.
              Ask an admin for inventory view access.
            </p>
          ) : targets.length === 0 ? (
            <p className="px-1 py-2 text-role-caption text-text-faint">
              Nothing throwable matched “{resolve.raw}”. A task points at an order or a carton.
            </p>
          ) : (
            <ul className="space-y-1">
              {targets.map((t) => {
                const active = picked != null && targetKey(picked) === targetKey(t);
                return (
                  <li key={targetKey(t)}>
                    <button
                      type="button"
                      onClick={() => setPicked(t)}
                      className={cn(
                        'ds-raw-button flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                        active ? 'bg-blue-50' : 'hover:bg-surface-card active:bg-surface-sunken',
                      )}
                    >
                      {t.entityType === 'receiving' ? (
                        <Package className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
                      ) : (
                        <Inbox className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-role-caption font-semibold text-text-default">
                          {t.label}
                        </span>
                        {t.sublabel ? (
                          <span className="block truncate text-role-micro text-text-soft">{t.sublabel}</span>
                        ) : null}
                      </span>
                      {active ? <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Who ──────────────────────────────────────────────────────── */}
        <section className="space-y-1 border-t border-border-hairline pt-2">
          {staff === null ? (
            <p className="flex items-center gap-2 px-1 py-2 text-role-caption text-text-faint">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading staff…
            </p>
          ) : (
            <StaffRecipientList
              staff={staff}
              title="Throw to…"
              emptyLabel="No other staff to throw to."
              currentStaffId={assignee?.id ?? null}
              onPick={setAssignee}
            />
          )}
        </section>

        {/* ── Why ──────────────────────────────────────────────────────── */}
        <section className="space-y-1 border-t border-border-hairline pt-2">
          <label
            htmlFor="throw-task-note"
            className="block px-1 text-role-micro uppercase tracking-widest text-text-soft"
          >
            Note <span className="normal-case tracking-normal text-text-faint">(optional)</span>
          </label>
          <textarea
            id="throw-task-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={TASK_NOTE_MAX}
            rows={2}
            placeholder="What do you need them to do?"
            className={cn(
              'w-full resize-none rounded-md border border-border-soft bg-surface-card px-2 py-1.5',
              'text-role-caption text-text-default placeholder:text-text-faint',
              focusRing('field'),
            )}
          />
        </section>
      </div>
    </QuickAccessPanelShell>
  );
}
