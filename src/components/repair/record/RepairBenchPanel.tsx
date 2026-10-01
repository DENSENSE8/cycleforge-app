'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Play, Wrench } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import {
  benchSessionElapsedMs,
  formatBenchClock,
  formatBenchDuration,
  serverClockOffsetMs,
  summarizeBenchSessions,
  type RepairBenchSessionsResponse,
} from '@/lib/repair/bench-session';
import {
  REPAIR_ACTION_COPY,
  repairActionLabel,
  type RepairActionRecord,
  type RepairDonorSource,
} from '@/lib/repair/repair-actions';
import type { RepairActionType } from '@/lib/repair-action-type-tone';
import { ticketPostView } from '@/lib/repair/repair-action-ticket-note';
import { formatMonthDayTimePST } from '@/utils/date';

const ACTION_TYPES: RepairActionType[] = ['repaired', 'replaced', 'cleaned', 'tested', 'awaiting_part', 'no_fix'];

interface WorkDraft {
  actionType: RepairActionType;
  partName: string;
  oldSku: string;
  newSku: string;
  oldSerial: string;
  newSerial: string;
  componentRef: string;
  componentValue: string;
  componentQty: string;
  donorSource: RepairDonorSource | null;
  donorRef: string;
  notes: string;
}

const EMPTY_DRAFT: WorkDraft = {
  actionType: 'repaired',
  partName: '',
  oldSku: '',
  newSku: '',
  oldSerial: '',
  newSerial: '',
  componentRef: '',
  componentValue: '',
  componentQty: '',
  donorSource: null,
  donorRef: '',
  notes: '',
};

async function responseJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body as T;
}

function missingFor(draft: WorkDraft): string | null {
  if (draft.actionType === 'replaced' && !draft.partName.trim() && !draft.oldSku.trim() && !draft.newSku.trim()) return 'Name the part or enter an old/new SKU.';
  if (draft.actionType === 'replaced' && !draft.donorSource) return 'Choose where the installed part came from.';
  if (draft.actionType === 'replaced' && draft.donorSource === 'donor_unit' && !draft.donorRef.trim()) return 'Enter the donor unit serial or SKU.';
  if (draft.actionType === 'repaired' && !draft.partName.trim() && !draft.componentRef.trim()) return 'Name the part or component you repaired.';
  if (draft.actionType === 'awaiting_part' && !draft.partName.trim() && !draft.newSku.trim()) return 'Name the part you are waiting on.';
  if (draft.actionType === 'no_fix' && !draft.notes.trim()) return 'Say why it cannot be repaired.';
  return null;
}

/** Desktop bench timer, work writer, and repair-action timeline. */
export function RepairBenchPanel({ repair }: { repair: RSRecord }) {
  const actionsQuery = useQuery({
    queryKey: ['repairs', 'workbench', repair.id, 'actions'],
    queryFn: async ({ signal }) => (await responseJson<{ actions?: RepairActionRecord[] }>(`/api/repair/actions?repairId=${repair.id}`, signal)).actions ?? [],
  });
  const sessionsQuery = useQuery({
    queryKey: ['repairs', 'workbench', repair.id, 'bench'],
    queryFn: async ({ signal }) => responseJson<RepairBenchSessionsResponse>(`/api/repair/bench-sessions?repairId=${repair.id}`, signal),
  });
  const [draft, setDraft] = useState<WorkDraft>(EMPTY_DRAFT);
  const [logging, setLogging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const serverOffset = useMemo(
    () => serverClockOffsetMs(sessionsQuery.data?.serverNow ?? '', Date.now()),
    [sessionsQuery.data?.serverNow],
  );
  const [now, setNow] = useState(() => Date.now() + serverOffset);
  const sessions = sessionsQuery.data?.sessions ?? [];
  const open = sessionsQuery.data?.open ?? null;
  const actions = actionsQuery.data ?? [];
  const summary = useMemo(() => summarizeBenchSessions(sessions, now), [now, sessions]);
  const missing = missingFor(draft);

  useEffect(() => {
    setNow(Date.now() + serverOffset);
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now() + serverOffset), 1000);
    return () => window.clearInterval(timer);
  }, [open, serverOffset]);

  const writeTimer = async (action: 'start' | 'stop') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/repair/bench-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repairId: repair.id, action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) throw new Error(body?.error || `HTTP ${response.status}`);
      await sessionsQuery.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Timer update failed');
    } finally {
      setBusy(false);
    }
  };

  const saveWork = async () => {
    if (busy || missing) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/repair/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repairId: repair.id,
          sessionId: open?.id ?? null,
          actionType: draft.actionType,
          partName: draft.partName.trim() || null,
          oldSku: draft.oldSku.trim() || null,
          newSku: draft.newSku.trim() || null,
          oldSerial: draft.oldSerial.trim() || null,
          newSerial: draft.newSerial.trim() || null,
          componentRef: draft.componentRef.trim() || null,
          componentValue: draft.componentValue.trim() || null,
          componentQty: draft.componentQty ? Number(draft.componentQty) : null,
          donorSource: draft.actionType === 'replaced' ? draft.donorSource : null,
          donorRef: draft.donorSource === 'donor_unit' ? draft.donorRef.trim() || null : null,
          notes: draft.notes.trim() || null,
          consumeStock: false,
          stockLocationId: null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) throw new Error(body?.details || body?.error || `HTTP ${response.status}`);
      setHighlightId(Number(body.action?.id) || null);
      setDraft(EMPTY_DRAFT);
      setLogging(false);
      await actionsQuery.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const retryTicketPost = async (actionId: number) => {
    setError(null);
    try {
      const response = await fetch(`/api/repair/actions/${actionId}/ticket-post`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      await actionsQuery.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Retry failed');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col divide-y divide-mode-rule">
      <section aria-labelledby="repair-bench-timer">
        <h3 id="repair-bench-timer" className="bg-mode-bar px-mode-page py-2 text-role-label font-semibold text-mode-ink">Bench timer</h3>
        <div className="flex items-center gap-3 bg-mode-panel px-mode-page py-3">
          <div className="min-w-0 flex-1">
            {open ? (
              <>
                <p className="font-mono text-2xl font-semibold tabular-nums text-mode-ink" data-testid="bench-clock">{formatBenchClock(benchSessionElapsedMs(open, now))}</p>
                <p className="text-role-caption text-mode-muted">Started {formatMonthDayTimePST(open.started_at)}</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-mode-ink">{sessionsQuery.isPending ? 'Loading…' : 'Not running'}</p>
                <p className="text-role-caption text-mode-muted">{summary.count ? `${formatBenchDuration(summary.totalMs)} across ${summary.count} session${summary.count === 1 ? '' : 's'}` : 'Start when the unit reaches your bench.'}</p>
              </>
            )}
          </div>
          <Button variant={open ? 'secondary' : 'primary'} size="lg" icon={open ? <Check /> : <Play />} loading={busy} disabled={sessionsQuery.isPending} onClick={() => void writeTimer(open ? 'stop' : 'start')}>
            {open ? 'Stop' : 'Start'}
          </Button>
        </div>
      </section>

      {logging ? (
        <form className="grid gap-4 bg-mode-panel p-mode-page" onSubmit={(event) => { event.preventDefault(); void saveWork(); }}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3" role="group" aria-label="Work type">
            {ACTION_TYPES.map((type) => (
              <Button key={type} type="button" variant={draft.actionType === type ? 'primary' : 'secondary'} onClick={() => setDraft((current) => ({ ...current, actionType: type }))}>
                {REPAIR_ACTION_COPY[type].label}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <TextField label={draft.actionType === 'awaiting_part' ? 'Part needed' : 'Part or assembly'} value={draft.partName} onChange={(partName) => setDraft((current) => ({ ...current, partName }))} disabled={busy} />
            <TextField label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} multiline rows={3} disabled={busy} />
            <TextField label="Old SKU" value={draft.oldSku} onChange={(oldSku) => setDraft((current) => ({ ...current, oldSku }))} mono disabled={busy} />
            <TextField label="New SKU" value={draft.newSku} onChange={(newSku) => setDraft((current) => ({ ...current, newSku }))} mono disabled={busy} />
            <TextField label="Old serial" value={draft.oldSerial} onChange={(oldSerial) => setDraft((current) => ({ ...current, oldSerial }))} mono disabled={busy} />
            <TextField label="New serial" value={draft.newSerial} onChange={(newSerial) => setDraft((current) => ({ ...current, newSerial }))} mono disabled={busy} />
            <TextField label="Component reference" value={draft.componentRef} onChange={(componentRef) => setDraft((current) => ({ ...current, componentRef: componentRef.toUpperCase() }))} mono disabled={busy} />
            <TextField label="Component value" value={draft.componentValue} onChange={(componentValue) => setDraft((current) => ({ ...current, componentValue }))} disabled={busy} />
            <TextField label="Component quantity" value={draft.componentQty} onChange={(componentQty) => setDraft((current) => ({ ...current, componentQty: componentQty.replace(/[^0-9]/g, '').slice(0, 3) }))} inputMode="numeric" disabled={busy} />
          </div>
          {draft.actionType === 'replaced' ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="flex gap-2" role="group" aria-label="Installed part source">
                {(['new_stock', 'customer_part', 'donor_unit'] as const).map((source) => (
                  <Button key={source} type="button" size="sm" variant={draft.donorSource === source ? 'primary' : 'secondary'} onClick={() => setDraft((current) => ({ ...current, donorSource: source }))}>{source.replaceAll('_', ' ')}</Button>
                ))}
              </div>
              {draft.donorSource === 'donor_unit' ? <TextField label="Donor unit serial or SKU" value={draft.donorRef} onChange={(donorRef) => setDraft((current) => ({ ...current, donorRef }))} mono disabled={busy} /> : null}
            </div>
          ) : null}
          {missing || error ? <p role="alert" className="text-role-caption font-semibold text-rose-700">{error ?? missing}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setLogging(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={missing != null}>Save work</Button>
          </div>
        </form>
      ) : (
        <div className="flex justify-end bg-mode-panel px-mode-page py-3">
          <Button variant="primary" icon={<Wrench className="size-4" aria-hidden />} onClick={() => setLogging(true)}>Log work</Button>
        </div>
      )}

      <section aria-labelledby="repair-work-history">
        <h3 id="repair-work-history" className="bg-mode-bar px-mode-page py-2 text-role-label font-semibold text-mode-ink">Work history · {actions.length}</h3>
        {actionsQuery.isPending ? <p className="px-mode-page py-4 text-role-caption text-mode-muted">Loading…</p> : null}
        {!actionsQuery.isPending && actions.length === 0 ? <p className="px-mode-page py-4 text-role-caption text-mode-muted">No work logged yet.</p> : null}
        <ul className="divide-y divide-mode-rule">
          {actions.map((action) => {
            const ticket = ticketPostView(action, Date.now());
            return (
              <li key={action.id} className={action.id === highlightId ? 'bg-emerald-50 px-mode-page py-3' : 'px-mode-page py-3'}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold text-mode-ink">{repairActionLabel(action.action_type)}{action.part_name ? ` — ${action.part_name}` : ''}</p>
                  <time dateTime={action.created_at} className="shrink-0 text-role-micro text-mode-muted">{formatMonthDayTimePST(action.created_at)}</time>
                </div>
                <p className="mt-1 text-role-caption text-mode-muted">{[action.old_sku && `Out ${action.old_sku}`, action.new_sku && `In ${action.new_sku}`, action.old_serial && `SN ${action.old_serial}`, action.new_serial && `SN ${action.new_serial}`, action.notes].filter(Boolean).join(' · ') || 'No additional details'}</p>
                {ticket?.kind === 'failed' ? <Button variant="secondary" size="sm" className="mt-2" onClick={() => void retryTicketPost(action.id)}>Retry ticket post</Button> : null}
              </li>
            );
          })}
        </ul>
      </section>
      {error && !logging ? <p role="alert" className="bg-rose-50 px-mode-page py-3 text-role-caption font-semibold text-rose-700">{error}</p> : null}
    </div>
  );
}
