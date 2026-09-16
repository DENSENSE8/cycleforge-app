/**
 * Gate preamble (Fact-Forcing):
 * - Importers: useKioskSlotEventsSpreadsheet adapter; unit tests.
 * - Affected API: none (pure CompoundRowView adapter).
 * - Schemas: KioskSlotEventTableRow → CompoundRowView.
 * - User: "Continue to the next phase" (history peer, no Revoke).
 */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { KioskSlotEventTableRow } from '@/lib/kiosk/kiosk-slot-event-row';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function toneFor(state: string | null): CompoundStateTone {
  const s = (state ?? '').toLowerCase();
  if (!s) return 'neutral';
  if (s.includes('error') || s.includes('fault') || s.includes('offline')) return 'alert';
  if (s.includes('idle') || s.includes('clear') || s.includes('done')) return 'done';
  return 'neutral';
}

export function kioskSlotEventCompoundView(row: KioskSlotEventTableRow): CompoundRowView {
  const from = str(row.fromState);
  const to = str(row.toState);
  const device =
    str(row.deviceLabel) ??
    (row.kioskDeviceId ? `Device #${row.kioskDeviceId}` : 'Unknown device');
  const slot = str(row.slotKey);

  return {
    id: String(row.id),
    thumbUrl: null,
    title: device,
    note: slot ? `Slot ${slot}` : null,
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
    identityFace: compoundIdentityFace(row.kioskDeviceId ? String(row.kioskDeviceId) : null, 'Device id'),
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: to ?? from ?? '—',
    stateTone: toneFor(to ?? from),
    stateTip: from && to ? `${from} → ${to}` : undefined,
    nextStep: slot ? { label: slot } : null,
    delay: null,
    amount: null,
  };
}
