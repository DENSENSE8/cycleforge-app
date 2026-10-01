/**
 * The receiving family's card model — layer 2 of the triage face
 * (`docs/design-system/HANDOFF-triage-family-contract.md`), pure: one card per
 * purchase, turned into the shared {@link RecordCardModel}. The face and the
 * card never learn that the rows are receiving lines (Law 1).
 *
 *   ┃ ☐  PO 21-15192-45235 · eBay aerodeals  ⚠ Wrong destination → …   ● Delivered · not scanned
 *   ┃ ◉  [photo] Bose Lifestyle AV-18 Series Media Center Remote
 *   ┃           ×1 · TRK …4378113 · SKU · Exp Sep 30                       → Receive
 */

import type { RowGroup } from '@/lib/group-rows';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { incomingExceptionReason } from '@/lib/receiving/incoming-exceptions';
import type { RecordCardLine, RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import { recordStateGlyph } from '@/design-system/components/record-card/record-state-glyph';
import type { RecordStateFace } from '@/design-system/tokens/record';
import { displayReceivingProductTitle } from '@/components/station/receiving-grid/cells';
import { fmtDate } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { incomingDeliveryNextAction, purchaseDeliveryState, purchaseIdentity } from '../incoming-delivery-state';

export interface ReceiptCardModel {
  /** Card key: the purchase key can head two groups, the lead line's id keeps it unique. */
  key: string;
  ids: number[];
  /** The line the card body opens — the purchase's first line needing a person, else its first. */
  lead: ReceivingLineRow;
  /** Every line, lines needing a person first. */
  rows: ReceivingLineRow[];
  /** The purchase's worst delivery state. */
  state: RecordStateFace;
  /** `PO …` handle. */
  identity: string;
  /** Vendor / account / platform the purchase came from. */
  source: string | null;
}

export function receiptCardKey(group: RowGroup<ReceivingLineRow>): string {
  return `${group.key}#${group.rows[0]?.id ?? ''}`;
}

function sourceLabel(row: ReceivingLineRow): string | null {
  return (row.platform_account_label || row.vendor_name || (row.inbound_source_type || row.source_platform || '').trim()) || null;
}

export function receiptCardModel(group: RowGroup<ReceivingLineRow>): ReceiptCardModel {
  // Stable: lines needing a person float up, the rest keep the host's order.
  const rows = [...group.rows].sort((a, b) => Number(incomingExceptionReason(b) != null) - Number(incomingExceptionReason(a) != null));
  const lead = rows[0]!;
  return {
    key: receiptCardKey(group),
    ids: rows.map((row) => row.id),
    lead,
    rows,
    state: purchaseDeliveryState(rows),
    identity: purchaseIdentity(lead),
    source: sourceLabel(lead),
  };
}

/** Tracking cut to its tail — enough to match a label at the dock. */
function trackingTail(value: string): string {
  return value.length > 10 ? `…${value.slice(-8)}` : value;
}

function receiptLine(row: ReceivingLineRow): RecordCardLine {
  const reason = incomingExceptionReason(row);
  const tracking = (row.tracking_number ?? '').trim();
  const expected = row.expected_delivery_date || row.po_date || row.created_at;
  return {
    id: row.id,
    title: displayReceivingProductTitle(row),
    photoUrl: row.image_url,
    alert: reason != null,
    alertNote: reason ? `${reason.why} → ${reason.next}` : null,
    facts: {
      qty: { kind: 'qty', value: Number(row.quantity_expected ?? row.quantity_received ?? 0) },
      tracking: tracking ? { kind: 'code', text: `TRK ${trackingTail(tracking)}`, title: tracking } : { kind: 'missing', text: 'No tracking' },
      sku: row.sku ? { kind: 'code', text: row.sku, title: 'SKU' } : null,
      expected: expected ? { kind: 'date', text: `Exp ${fmtDate(expected, 'MMM d')}`, title: fmtDate(expected) } : null,
    },
  };
}

const needPerson = (count: number) => `${count} more need${count === 1 ? 's' : ''} a person`;

/** The purchase as the shared card reads it. */
export function receiptRecordCard(model: ReceiptCardModel): RecordCardModel {
  const { state, identity, rows } = model;
  const lines = rows.map(receiptLine);
  const alertCount = lines.filter((line) => line.alert).length;
  const reason = incomingExceptionReason(model.lead);
  const nextVerb = incomingDeliveryNextAction(state.id);
  const title = lines[0]?.title ?? '';
  return {
    key: model.key,
    leadId: model.lead.id,
    state,
    stateIcon: recordStateGlyph(state),
    stateMeaning: reason ? `${state.label} — ${reason.why}` : state.label,
    alert:
      alertCount > 0
        ? {
            count: alertCount,
            summary: `${alertCount} of ${lines.length} need${alertCount === 1 ? 's' : ''} a person`,
            ariaLabel: `${state.label}, ${alertCount} of ${lines.length} lines need a person`,
          }
        : null,
    aria: {
      card: `PO ${identity}, ${state.label}, ${title}`,
      open: `Open PO ${identity}`,
      check: `Select PO ${identity}`,
    },
    channel: null,
    person: model.source,
    chips: [],
    // Why this delivery needs a person, and what to do — read-only on line 1.
    notes: { fixed: reason ? { label: reason.label, text: `${reason.why} → ${reason.next}` } : null, own: null },
    status: { kind: 'none' },
    next: {
      label: nextVerb,
      tone: state.tone,
      tip: `Next: ${nextVerb.toLowerCase()}`,
      blocked: state.tone === 'danger',
    },
    lines,
    hiddenAlertLabel: needPerson,
  };
}
