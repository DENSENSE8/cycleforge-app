'use client';

/**
 * The repair record verbs' writers and panel bodies — print through the house
 * hidden-iframe path, Square checkout, Cancel (with its reason), the Zendesk
 * ticket # editor and the pickup signing sheet — wired by `useRepairRecordVerbs`.
 */

import { useState } from 'react';
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

/** Cancel asks why — the reason rides the soft-cancel (`DELETE ?reason=`) into the audit row. */
export function CancelRepairPanel({ repair, onCancelled }: { repair: RSRecord; onCancelled: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/repair-service/${repair.id}?reason=${encodeURIComponent(reason.trim())}`, { method: 'DELETE' });
      const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !body?.success) throw new Error(body?.error || `Cancel failed (${res.status})`);
      toast.success('Repair cancelled');
      onCancelled();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="repair-record-cancel"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="text-role-data text-mode-muted">The ticket leaves every queue; it stays on file under All.</p>
      <TextField label="Why is this repair cancelled?" value={reason} onChange={setReason} multiline rows={3} autoFocus />
      <div className="flex justify-end">
        <Button type="submit" variant="danger" size="sm" loading={busy} disabled={!reason.trim()} data-testid="repair-record-cancel-confirm">
          Cancel repair
        </Button>
      </div>
    </form>
  );
}

/** The Zendesk ticket # the repair carries (`PATCH /api/repair-service { field: 'ticket_number' }`). */
export function TicketNumberPanel({ repair, onSaved }: { repair: RSRecord; onSaved: () => void }) {
  const [value, setValue] = useState(String(repair.ticket_number || '').replace(/^RS-?\d+$/i, ''));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/repair-service', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: repair.id, field: 'ticket_number', value: value.trim().replace(/^#/, '') }),
      });
      if (!res.ok) throw new Error(`Ticket # save failed (${res.status})`);
      toast.success('Ticket # saved');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ticket # save failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="repair-record-ticket-number"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <TextField label="Zendesk ticket #" value={value} onChange={setValue} mono autoFocus />
      <div className="flex justify-end">
        <Button type="submit" variant="ink" size="sm" loading={busy} data-testid="repair-record-ticket-number-save">
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
