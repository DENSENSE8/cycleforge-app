/**
 * Shipped — the package family's card model (layer 2 of the triage face): one
 * PACKAGE on the Allocate card. Line 1 is the order number; the host paints the
 * channel beside it. Top right is the order's SLA (`ship_by_date`), not the
 * dock stamp. The lines are the box's order lines, titled and pictured as the
 * package record does (`shipmentItemIdentity`), with the order card's facts
 * (qty · condition · price); a box of 2+ lines folds behind "+N items".
 */

import type { StateName } from '@/design-system/tokens/lifecycle';
import type { RecordCardLine, RecordCardModel, RecordCardStatus } from '@/design-system/components/record-card/record-card-types';
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

/** The status pills, in paint order. A package may light more than one. */
export const SHIPPED_STATUS_CHIPS = [
  'FULFILLED',
  'LABEL_ONLY',
  'ON_THE_WAY',
  'DELIVERED',
  'LATE',
  'EXCEPTION',
  'UNMATCHED',
  'NEVER_PACKED',
] as const;
export type ShippedStatusChip = (typeof SHIPPED_STATUS_CHIPS)[number];


function lateAgainstShipBy(row: DerivedPackerRecord): boolean {
  const scanned = String(row.ship_confirmed_at ?? '').trim();
  const by = String(row.ship_by_date ?? '').trim();
  if (!scanned || scanned === '1' || !by) return false;
  return scanned > by;
}

/**
 * Which pills a package lights. Fulfilled is every package on this page.
 * A dock scan stays under Scanned out after the carrier marks it Delivered.
 * The old words (In custody, Process gap, Orphan) fold into On the way,
 * Exception, and Unmatched — they are not painted beside the new word.
 */
export function shippedStatusKeys(row: DerivedPackerRecord): ShippedStatusChip[] {
  const category = String(row.latest_status_category ?? '').trim().toUpperCase();
  const keys: ShippedStatusChip[] = ['FULFILLED'];
  if (category === 'LABEL_CREATED') keys.push('LABEL_ONLY');
  if (category === 'ACCEPTED' || category === 'IN_TRANSIT' || category === 'OUT_FOR_DELIVERY') keys.push('ON_THE_WAY');
  if (category === 'DELIVERED' || row.is_delivered === true) keys.push('DELIVERED');
  if (lateAgainstShipBy(row)) keys.push('LATE');
  if (category === 'EXCEPTION' || category === 'RETURNED' || row.has_exception === true) keys.push('EXCEPTION');
  if (isOpenUnmatchedScan(row)) keys.push('UNMATCHED');
  if (row.packed_by == null) keys.push('NEVER_PACKED');
  return keys;
}

/** A pill's word and tone. Exception is a count that opens Exceptions, not a filter. */
export function shippedStatusChipFace(key: ShippedStatusChip): { label: string; tone: StateName } {
  switch (key) {
    case 'FULFILLED':
      return { label: 'Scanned out', tone: 'success' };
    case 'LABEL_ONLY':
      return { label: 'Label only', tone: 'neutral' };
    case 'ON_THE_WAY':
      return { label: 'On the way', tone: 'info' };
    case 'DELIVERED':
      return { label: 'Delivered', tone: 'success' };
    case 'LATE':
      return { label: 'Late', tone: 'warning' };
    case 'EXCEPTION':
      return { label: 'Exception', tone: 'danger' };
    case 'UNMATCHED':
      return { label: 'Unmatched', tone: 'danger' };
    case 'NEVER_PACKED':
      return { label: 'Never packed', tone: 'warning' };
  }
}


/** The packer as line 1 names them; null = the box was never pack-scanned. */
export function shippedPackerName(row: DerivedPackerRecord): string | null {
  if (row.packed_by == null) return null;
  return (row.packed_by_name || '').trim() || `Staff #${row.packed_by}`;
}


/** Top-right of this table: when the package left the building. */
function scanOutStatus(row: DerivedPackerRecord): RecordCardStatus {
  const at = String(row.ship_confirmed_at ?? '').trim();
  if (!at || at === '1') return { kind: 'date', face: 'Not scanned out', tip: null, alert: false };
  return { kind: 'date', face: formatMonthDayTimePST(at), tip: `Scanned out ${formatDateTimePST(at)} PT`, alert: false };
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
 * The card face. Platform and order on line 1. Top right is the dock stamp
 * (`ship_confirmed_at`), so a glance reads when it left. Ship-by stays in Details.
 */
export function shippedRecordCard(model: ShippedCardModel): RecordCardModel {
  const row = model.lead;
  const leadId = model.ids[0]!;
  const unmatched = isOpenUnmatchedScan(row);
  const state = shippedPackageFace(row.outboundState, unmatched);
  const handle = shippedPackageHandle(row);
  const { orderId } = shippedPackageOrder(row);
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
    status: scanOutStatus(row),
    // Bottom-right = the carrier's live word, else the outbound stage (the same
    // vocabulary as the rail). A terminal flag with no delivered_at still reads
    // Delivered; Details says the instant is unknown.
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
