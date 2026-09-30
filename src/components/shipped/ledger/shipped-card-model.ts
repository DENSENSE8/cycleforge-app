/**
 * Shipped — the package family's card model (layer 2 of the triage face): one
 * PACKAGE as the Allocate card (owner 2026-09-29). Line 1 reads like the order
 * card's — the order number, its channel, who packed it — with the carrier
 * status + tracking before the top-right stamp (when it left the dock). The
 * lines are the box's order lines, titled and pictured as the package record
 * does (`shipmentItemIdentity`), with the order card's facts (qty · condition
 * · price); a box of 2+ lines folds behind "+N items".
 */

import type { StateName } from '@/design-system/tokens/lifecycle';
import type { RecordCardLine, RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import { recordStateGlyph } from '@/design-system/components/record-card/record-state-glyph';
import type { TriageCardModelBase } from '@/design-system/components/triage-card-list/TriageCardList';
import { lineCondition, linePrice, orderLineFacts } from '@/lib/orders/order-card-model';
import { marketplaceThumbUrl } from '@/lib/photos/marketplace-thumb-url';
import { shipmentItemIdentity } from '@/lib/shipments/shipment-record-types';
import type { DerivedPackerRecord } from '@/lib/shipped-records';
import { formatDateTimePST, formatMonthDayTimePST } from '@/utils/date';
import { isOpenExceptionStatus, shippedPackageFace, shippedPackageTracking } from './shipped-package-state';

export type ShippedCardModel = TriageCardModelBase<DerivedPackerRecord>;

/** An open unmatched pack scan — no order line claims the box yet. */
export function isOpenUnmatchedScan(row: DerivedPackerRecord): boolean {
  return row.row_source === 'exception' && isOpenExceptionStatus(row.exception_status);
}

function lineFacts(source: {
  quantity?: string | number | null;
  condition?: string | null;
  sale_amount?: string | number | null;
  currency?: string | null;
}): RecordCardLine['facts'] {
  const condition = lineCondition(source);
  const price = linePrice(source);
  const qty = Number(source.quantity);
  return orderLineFacts({
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    condition: condition.label,
    conditionCode: condition.code,
    price: price.text,
    priceEstimate: price.estimate,
  });
}

/** The box's lines; a scan with no package line on file reads as its own one line, pictured by its pack photo. */
function shippedCardLines(row: DerivedPackerRecord, leadId: number, unmatched: boolean): RecordCardLine[] {
  const lines = row.package_lines ?? [];
  if (lines.length > 0) {
    return lines.map((line) => {
      const identity = shipmentItemIdentity(line);
      return {
        id: Number(line.id),
        title: identity.title,
        photoUrl: marketplaceThumbUrl(identity.photoUrl),
        facts: lineFacts(line),
        alert: false,
        alertNote: null,
      };
    });
  }
  return [
    {
      id: leadId,
      title: (row.product_title || '').trim() || (unmatched ? 'Unmatched pack scan' : 'No order line'),
      photoUrl: Array.isArray(row.packer_photos_url)
        ? ((row.packer_photos_url.find((p: { url?: unknown }) => typeof p?.url === 'string')?.url as string | undefined) ?? null)
        : null,
      facts: lineFacts(row),
      alert: false,
      alertNote: null,
    },
  ];
}

/** The package's handle for aria and titles: its tracking number, else the scan. */
export function shippedPackageHandle(row: DerivedPackerRecord): string {
  return shippedPackageTracking(row) || `Scan ${row.id}`;
}

/**
 * The order the package ships — the scan's own match, else the box's primary
 * line (a scan-out-only box carries no match of its own, only its lines).
 */
export function shippedPackageOrder(row: DerivedPackerRecord): { orderId: string; accountSource: string | null } {
  const line = row.package_lines?.[0];
  const orderId = (row.order_id || '').trim();
  if (orderId) return { orderId, accountSource: row.account_source ?? line?.account_source ?? null };
  return { orderId: (line?.order_id || '').trim(), accountSource: line?.account_source ?? row.account_source ?? null };
}

/** The status pills, in order — the package's state face ids, plus the box nobody pack-scanned. */
export const SHIPPED_STATUS_CHIPS = [
  'SCANNED_OUT',
  'IN_CUSTODY',
  'DELIVERED',
  'EXCEPTION',
  'PROCESS_GAP',
  'ORPHAN',
  'UNMATCHED',
  'NEVER_PACKED',
] as const;
export type ShippedStatusChip = (typeof SHIPPED_STATUS_CHIPS)[number];

/** Which pills a package lights (its state, and Never packed when no pack scan exists). */
export function shippedStatusKeys(row: DerivedPackerRecord): ShippedStatusChip[] {
  const state = shippedPackageFace(row.outboundState, isOpenUnmatchedScan(row)).id as ShippedStatusChip;
  return row.packed_by == null ? [state, 'NEVER_PACKED'] : [state];
}

/** A pill's word and tone — the state face the cards wear, so a pill reads like the rails it narrows to. */
export function shippedStatusChipFace(key: ShippedStatusChip): { label: string; tone: StateName } {
  if (key === 'NEVER_PACKED') return { label: 'Never packed', tone: 'warning' };
  const face = key === 'UNMATCHED' ? shippedPackageFace('ORPHAN', true) : shippedPackageFace(key, false);
  return { label: face.label, tone: face.tone };
}

/** The packer as line 1 names them; null = the box was never pack-scanned. */
export function shippedPackerName(row: DerivedPackerRecord): string | null {
  if (row.packed_by == null) return null;
  return (row.packed_by_name || '').trim() || `Staff #${row.packed_by}`;
}

/** The carrier's live word for the box; USPS has no live feed yet. */
export function shippedCarrierStatus(row: DerivedPackerRecord): { face: string | null; tip: string | null } {
  if (String(row.carrier ?? '').trim().toUpperCase() === 'USPS') {
    return { face: 'Integration pending', tip: 'USPS live tracking integration is pending.' };
  }
  const face = (row.latest_status_label || row.latest_status_code || '').trim() || null;
  return { face, tip: (row.latest_status_description || '').trim() || face };
}

/**
 * The card face. The header is the order number + tracking only (owner
 * 2026-09-29, Allocate's simplified face): channel, packer, "never packed"
 * and notes are Details facts, so line 1 carries none of them.
 */
export function shippedRecordCard(model: ShippedCardModel): RecordCardModel {
  const row = model.lead;
  const leadId = model.ids[0]!;
  const unmatched = isOpenUnmatchedScan(row);
  const state = shippedPackageFace(row.outboundState, unmatched);
  const handle = shippedPackageHandle(row);
  const { orderId } = shippedPackageOrder(row);
  const shippedAt = row.ship_confirmed_at ?? null;
  const lines = shippedCardLines(row, leadId, unmatched);
  const product = lines[0]!.title;
  return {
    key: model.key,
    leadId,
    state,
    stateIcon: recordStateGlyph(state),
    stateMeaning: unmatched ? `${state.label} — no order line claims this box` : state.label,
    alert: null,
    aria: {
      card: `Package ${handle}${orderId ? `, order ${orderId}` : ''}, ${state.label}, ${product}`,
      open: `Open package ${handle}`,
      check: `Select package ${handle}`,
    },
    channel: null,
    person: null,
    chips: [],
    notes: { fixed: null, own: null },
    status: shippedAt
      ? { kind: 'date', face: formatMonthDayTimePST(shippedAt), tip: `Shipped ${formatDateTimePST(shippedAt)} PT`, alert: false }
      : { kind: 'date', face: 'Not scanned out', tip: null, alert: false },
    // Bottom-right = the carrier's live word for the box (owner 2026-09-29), where Allocate paints its next step.
    next: unmatched
      ? { label: 'Resolve', tone: 'danger', tip: 'Next: match this box to its order line', blocked: true }
      : (() => {
          const live = shippedCarrierStatus(row);
          return {
            label: live.face ?? state.label,
            tone: state.tone,
            tip: live.tip ?? state.label,
            blocked: false,
          };
        })(),
    lines,
    hiddenAlertLabel: () => '',
  };
}
