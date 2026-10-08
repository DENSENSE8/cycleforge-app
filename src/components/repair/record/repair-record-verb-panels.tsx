'use client';

/**
 * The repair record verbs' writers and dialog bodies — print through the house
 * hidden-iframe path, Square checkout, Cancel (with its reason), the Zendesk
 * ticket # editor and the pickup signing sheet — wired by `useRepairRecordVerbs`.
 */

import { useState } from 'react';
import { Trash2 } from '@/components/Icons';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { Button, Layer, TextField } from '@/design-system/primitives';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { printHtmlInIframe, reserveLegacyPrintPopup } from '@/lib/print/iframePrint';
import { toast } from '@/lib/toast';
import { RepairPickupFlow } from '../RepairPickupFlow';

/** Fetch a printable page and print it through the house hidden-iframe path (no new tab). */
export async function printPage(url: string, name: string): Promise<void> {
  // Reserved while the click still owns the gesture (older WebKit only).
  const legacyPopup = reserveLegacyPrintPopup();
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`${name} failed (${res.status})`);
    if (!printHtmlInIframe(await res.text(), { name, legacyPopup })) throw new Error(`${name}: could not open the print frame`);
  } catch (error) {
    legacyPopup?.close();
    toast.error(error instanceof Error ? error.message : `${name} failed`);
  }
}

export async function markLabelPrinted(repairId: number): Promise<void> {
  const res = await fetch(`/api/repair-service/${repairId}/label-printed`, { method: 'POST' });
  if (!res.ok) toast.error('Label printed, but recording it failed — the repair stays on Needs label');
}

/** Square checkout — the payment page opens in a tab reserved on the click. */
export async function openSquareCheckout(repair: RSRecord): Promise<void> {
  const pending = window.open('', '_blank');
  try {
    const res = await fetch('/api/repair/square-payment-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repairId: repair.id, sourceSku: String(repair.source_sku || '').trim() || null }),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; paymentUrl?: string; error?: string };
    if (!res.ok || !body.success || !body.paymentUrl) throw new Error(body.error || 'Failed to create Square payment link');
    if (pending) pending.location.href = body.paymentUrl;
    else window.open(body.paymentUrl, '_blank', 'noopener,noreferrer');
  } catch (error) {
    if (pending && !pending.closed) pending.close();
    toast.error(error instanceof Error ? error.message : 'Failed to open Square checkout');
  }
}

/**
 * Cancel repair (danger) in the centered verb dialog: the reason field is
 * focused, and the ONE confirm button submits it — Enter in the field
 * confirms. The verb carries no key, so no double press can cancel. The
 * reason rides the soft-cancel (`DELETE ?reason=`) into the audit row; the
 * done face's Done closes the record (`onCancelled`).
 */
export function CancelRepairPanel({ repair, onCancelled, done }: { repair: RSRecord; onCancelled: () => void; done: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const submit = async () => {
    if (!reason.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/repair-service/${repair.id}?reason=${encodeURIComponent(reason.trim())}`, { method: 'DELETE' });
      const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !body?.success) throw new Error(body?.error || `Cancel failed (${res.status})`);
      setCancelled(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  };
  if (cancelled) {
    return (
      <VerbDoneState
        title="Repair cancelled"
        detail="It left every queue; it stays on file under All."
        onDone={() => {
          // The record closes with the dialog — refetching first would drop it from an open-only list under the dialog.
          done();
          onCancelled();
        }}
        testId="repair-record-cancel-done"
      />
    );
  }
  return (
    <form
      className="flex h-full min-h-0 flex-col gap-3"
      data-testid="repair-record-cancel"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="text-role-caption text-text-soft">The ticket leaves every queue; it stays on file under All.</p>
      <TextField label="Why is this repair cancelled?" value={reason} onChange={setReason} autoFocus />
      <div className="mt-auto flex flex-col gap-1.5 border-t border-border-soft pt-3">
        <Button type="submit" variant="danger" size="md" icon={<Trash2 />} className="w-full" loading={busy} disabled={!reason.trim()} data-testid="repair-record-cancel-confirm">
          Cancel repair
        </Button>
        <p className="text-center text-role-micro text-text-soft">Enter confirms</p>
        <Button type="button" variant="ghost" size="sm" className="w-full" disabled={busy} onClick={done}>
          Keep the repair
        </Button>
      </div>
    </form>
  );
}

/** The Zendesk ticket # the repair carries (`PATCH /api/repair-service { field: 'ticket_number' }`); Enter saves. */
export function TicketNumberPanel({ repair, onSaved, done }: { repair: RSRecord; onSaved: () => void; done: () => void }) {
  const [value, setValue] = useState(String(repair.ticket_number || '').replace(/^RS-?\d+$/i, ''));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    const ticket = value.trim().replace(/^#/, '');
    try {
      const res = await fetch('/api/repair-service', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: repair.id, field: 'ticket_number', value: ticket }),
      });
      if (!res.ok) throw new Error(`Ticket # save failed (${res.status})`);
      onSaved();
      setSaved(ticket);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ticket # save failed');
    } finally {
      setBusy(false);
    }
  };
  if (saved != null) {
    return (
      <VerbDoneState
        title={saved ? 'Ticket # saved' : 'Ticket # cleared'}
        detail={saved ? `#${saved}` : undefined}
        onDone={done}
        testId="repair-record-ticket-number-done"
      />
    );
  }
  return (
    <form
      className="flex h-full min-h-0 flex-col gap-3"
      data-testid="repair-record-ticket-number"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <TextField label="Zendesk ticket #" value={value} onChange={setValue} mono autoFocus />
      <div className="mt-auto flex justify-end border-t border-border-soft pt-3">
        <Button type="submit" variant="ink" size="md" loading={busy} data-testid="repair-record-ticket-number-save">
          Save ticket #
        </Button>
      </div>
    </form>
  );
}

/** The signing sheet over the desk while the verb is open; the header reads which verb is running. */
export function PickupDisplay({ repair, onUpdate, done }: { repair: RSRecord; onUpdate: () => void; done: () => void }) {
  return (
    <>
      <span className="truncate text-role-caption text-mode-muted">Pickup in progress…</span>
      <Layer level="panelOverlay">
        <RepairPickupFlow repair={repair} onUpdate={onUpdate} onClose={done} />
      </Layer>
    </>
  );
}
