/**
 * The receiving family's card model — layer 2 of the triage face
 * (`docs/design-system/HANDOFF-triage-family-contract.md`), pure: one card per
 * purchase, turned into the shared {@link RecordCardModel}. The face and the
 * card never learn that the rows are receiving lines (Law 1).
 *
 *   ┃ ☐  45235 · aerodeals  ⚠ Wrong destination → …                    ● Delivered · not scanned
 *   ┃ ◉  [photo] Bose Lifestyle AV-18 Series Media Center Remote
 *   ┃           ×1 · TRK 94378113 · SKU · Exp Sep 30                       → Receive
 */

import type { RowGroup } from '@/lib/group-rows';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { incomingExceptionReason } from '@/lib/receiving/incoming-exceptions';
import type { RecordCardLine } from '@/design-system/components/record-card/record-card-types';
import type { ViewCardModel } from '@/design-system/components/triage-card-list/triage-view';
import type { INCOMING_PIPELINE_VIEW } from '@/lib/triage/views/incoming-pipeline';
import { recordStateGlyph } from '@/design-system/components/record-card/record-state-glyph';
import type { RecordStateFace } from '@/design-system/tokens/record';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { fmtDate } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { inboundOrderIdentity, type OperationalIdentity } from '@/lib/operational-identity';
import { getLast8 } from '@/lib/copy-chip-format';
import { incomingDeliveryNextAction, purchaseDeliveryState } from '../incoming-delivery-state';

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
  /** The purchase's handle: its marketplace / source order, else its PO (`inboundOrderIdentity`). */
  identity: OperationalIdentity;
  /** Who sold it to us — never the platform, the account or the source type. */
  vendor: string | null;
}

export function receiptCardKey(group: RowGroup<ReceivingLineRow>): string {
  return `${group.key}#${group.rows[0]?.id ?? ''}`;
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
    identity: inboundOrderIdentity(lead),
    vendor: lead.vendor_name?.trim() || null,
  };
}

function receiptLine(row: ReceivingLineRow): RecordCardLine {
  const reason = incomingExceptionReason(row);
  const tracking = (row.tracking_number ?? '').trim();
  const expected = row.expected_delivery_date || row.po_date || row.created_at;
  return {
    id: row.id,
    title: resolveSkuIdentityTitle(row) || 'Unnamed inbound line',
    photoUrl: row.image_url,
    alert: reason != null,
    alertNote: reason ? `${reason.why} → ${reason.next}` : null,
    facts: {
      qty: { kind: 'qty', value: Number(row.quantity_expected ?? row.quantity_received ?? 0) },
      // A list face: the house last-8 (`getLast8`); the full number rides the title.
      tracking: tracking ? { kind: 'code', text: `TRK ${getLast8(tracking)}`, title: tracking } : { kind: 'missing', text: 'No tracking' },
      sku: row.sku ? { kind: 'code', text: row.sku, title: 'SKU' } : null,
      expected: expected ? { kind: 'date', text: `Exp ${fmtDate(expected, 'MMM d')}`, title: fmtDate(expected) } : null,
    },
  };
}

const needPerson = (count: number) => `${count} more need${count === 1 ? 's' : ''} a person`;

/** The purchase as the shared card reads it (`incoming.pipeline`: the delivery state top-right). */
export function receiptRecordCard(model: ReceiptCardModel): ViewCardModel<typeof INCOMING_PIPELINE_VIEW> {
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
      card: `${identity.ariaLabel}, ${state.label}, ${title}`,
      open: `Open ${identity.ariaLabel}`,
      check: `Select ${identity.ariaLabel}`,
    },
    channel: null,
    person: model.vendor,
    chips: [],
    // Why this delivery needs a person, and what to do — read-only on line 1.
    notes: { fixed: reason ? { label: reason.label, text: `${reason.why} → ${reason.next}` } : null, own: null },
    status: { kind: 'state', face: state.label, tone: state.tone, tip: reason ? `${state.label} — ${reason.why}` : null },
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
