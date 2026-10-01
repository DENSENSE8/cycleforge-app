'use client';

/**
 * The inbound record's ADAPTERS — each inbound read as the shared
 * `RecordModel` that `RecordView` paints:
 * - an incoming delivery (a purchase's lines + `useIncomingDetails`),
 * - a receiving carton (`useCartonRecord` + its carrier-event read),
 * - a pasted number nothing on file carries (the Check's answer).
 * One view, three sources — so On the way, Docked and Unboxed read as one
 * system, and as the outbound order record's twin (owner 2026-09-29).
 */

import type { ReactNode } from 'react';
import { Barcode, Boxes, DoorOpen, ExternalLink, FileText, PackageOpen, ShieldCheck, Star, Truck, Warehouse } from '@/components/Icons';
import { TrackingIdentity } from '@/components/ui/OrderIdentityChips';
import type { RecordFact, RecordModel, RecordModelItem, RecordStep } from '@/design-system/components/record-ledger/record-model';
import { RecordListingLink } from '@/design-system/components/record-ledger/RecordIdentity';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { ReceivingRecordPlatform } from '@/components/receiving/ReceivingRecordIdentity';
import type { CartonRecord } from '@/components/receiving/history/use-carton-record';
import { pastedNumberStatusFace } from '@/components/receiving/incoming/cards/PastedNumberCard';
import { purchaseExceptionReason, purchaseIdentity } from '@/components/receiving/incoming/incoming-delivery-state';
import {
  fmtDate,
  type DetailsResponse,
} from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { conditionLabel } from '@/lib/conditions';
import { readReturnReason } from '@/lib/inbound/return-reason-codes';
import type { CarrierEvent } from '@/lib/queries/carrier-events-query';
import type { CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import { deriveIncomingAlerts } from '@/lib/receiving/incoming-record-status';
import { deriveInboundInternalSteps, inboundCurrentStatus } from '@/lib/receiving/inbound-record-status';
import type { PastedNumber } from '@/lib/receiving/pasted-numbers';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ReceivingStatusStep } from '@/lib/receiving/receiving-status-strip';
import { patchLineQcAssignee } from '@/lib/qc/qc-assignee-client';
import { INBOUND_LIFECYCLE, type InboundLifecycleState } from '@/design-system/tokens/lifecycle';
import { NotesTab } from '@/components/sidebar/receiving/incoming-details/NotesTab';
import { InboundEvidencePhotosButton } from './InboundEvidencePhotosButton';
import { receivingRecordIdentity, receivingRecordSerials, receivingSerialCountWarning } from '@/lib/receiving/record-identity';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { formatMonthDayTimePST } from '@/utils/date';
import type { DeliveryPromiseInput } from '@/lib/shipping/delivery-promise';
import { DeliveryPromise } from '@/design-system/components/record-ledger/DeliveryPromise';
import { cn } from '@/utils/_cn';

/** Each floor step's glyph — the same icon-per-step grammar as the order's Fulfillment ladder. */
const STEP_ICON: Readonly<Record<string, ReactNode>> = {
  ordered: <FileText aria-hidden />,
  known: <Barcode aria-hidden />,
  delivered: <Truck aria-hidden />,
  scanned: <DoorOpen aria-hidden />,
  unboxed: <PackageOpen aria-hidden />,
  graded: <Star aria-hidden />,
  tested: <ShieldCheck aria-hidden />,
  putaway: <Warehouse aria-hidden />,
};

/** Each step's lifecycle colour — the inbound twin of outbound's `LIFECYCLE.*.tone` per step. */
const STEP_LIFECYCLE: Readonly<Record<string, InboundLifecycleState>> = {
  ordered: 'ordered',
  known: 'ordered',
  delivered: 'docked',
  scanned: 'docked',
  unboxed: 'unboxed',
  graded: 'graded',
  tested: 'tested',
  putaway: 'putAway',
};

/** The floor ladder as the record's steps: its glyph and `INBOUND_LIFECYCLE` tone per step. */
function inboundSteps(steps: readonly ReceivingStatusStep[]): RecordStep[] {
  return steps.map((step) => {
    const lifecycle = STEP_LIFECYCLE[step.key];
    return { ...step, icon: STEP_ICON[step.key] ?? <Boxes aria-hidden />, tone: lifecycle ? INBOUND_LIFECYCLE[lifecycle].tone : undefined };
  });
}

/** The frame every inbound record shares: the Receiving band, the inbound words. */
const INBOUND_FRAME = { internalLabel: 'Receiving', flow: 'inbound' } as const;

/** The carton's staff note, edited in place under the serials (PATCH support_notes). */
function staffNoteEditor(receivingId: number, value: string, onSaved: () => void): ReactNode {
  return <NotesTab key={receivingId} receivingId={receivingId} initialValue={value} onSaved={onSaved} label={null} />;
}

/** The evidence door — the carton's and PO's photos. */
function photosDoor(key: string, receivingId: number | null, poRef: string | null): ReactNode {
  return <InboundEvidencePhotosButton key={`photos:${key}`} receivingId={receivingId} poRef={poRef} />;
}

const text = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
};

const positiveId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const stamp = (value: string | null | undefined): string | null => (text(value) ? formatMonthDayTimePST(value!) : null);

/** `who · when`, dropping whichever part is missing. */
const byAt = (who: string | null | undefined, at: string | null | undefined): string | null =>
  [text(who), stamp(at)].filter(Boolean).join(' · ') || null;

/** The header date when nothing better is known: the row's import time. */
function importedDate(lines: readonly ReceivingLineRow[]): RecordModel['title']['date'] {
  const at = lines.map((line) => text(line.created_at)).find(Boolean);
  return at ? { label: formatMonthDayTimePST(at), tip: `Imported ${formatMonthDayTimePST(at)}` } : null;
}

/** The carton a delivery landed in — from the details read, else the row. */
export function cartonIdOf(row: ReceivingLineRow, data: DetailsResponse | undefined): number | null {
  return positiveId(data?.receiving?.id) ?? positiveId(row.receiving_id);
}

/** Inbound source token (`zoho`, `ebay`, `manual_entry`) → its sentence-case face. */
function inboundSourceLabel(raw: string): string {
  const meta = sourcePlatformMeta(raw);
  if (meta.value) return meta.label;
  const spaced = raw.trim().replace(/_+/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A zendesk ticket (`#12345`) as a link to the helpdesk, else its text. */
export function TicketLink({ ticket }: { ticket: string }) {
  const href = zendeskTicketUrl(ticket);
  const face = ticket.startsWith('#') ? ticket : `#${ticket}`;
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(RECORD_ID_CLASS, 'inline-flex items-center gap-1 underline decoration-mode-edge underline-offset-2 hover:decoration-mode-ink', focusRing('control'))}
    >
      {face}
      <ExternalLink aria-hidden className="h-3 w-3" />
    </a>
  ) : (
    <span className={RECORD_ID_CLASS}>{face}</span>
  );
}

const id = (value: string) => <span className={cn(RECORD_ID_CLASS, 'select-all')}>{value}</span>;

function trackingFact(tracking: string | null, carrier: string | null): RecordFact {
  return {
    label: 'Tracking',
    value: tracking ? (
      <TrackingIdentity tracking={tracking} carrierHint={carrier} />
    ) : (
      <span className={cn(RECORD_ID_CLASS, 'text-mode-warn')}>Not attached</span>
    ),
  };
}

function stampFact(label: string, who: string | null | undefined, at: string | null | undefined): RecordFact[] {
  const face = byAt(who, at);
  return face ? [{ label, value: <span className={RECORD_ID_CLASS}>{face}</span> }] : [];
}

/** The carrier's promise — "Arrives Thu, Sep 30" — the outbound face, when the carrier gave one. */
function promiseFact(promise: DeliveryPromiseInput | null): RecordFact[] {
  return promise?.estimatedDeliveryAt
    ? [{ label: 'Arrival', value: <DeliveryPromise promise={promise} testId="inbound-record-arrival" /> }]
    : [];
}

const money = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * The purchase's price breakdown, outbound's shape: Items (the line totals),
 * the PO's shipping fee and tax (Zoho custom fields), then Total. The fee rows
 * paint only when Items + Shipping + Tax add up to the PO total — a custom
 * field already folded into the line rates would print a sum that lies.
 */
function purchasePrice(data: DetailsResponse | undefined): RecordModel['price'] {
  if (!data) return null;
  const priced = data.line_items.filter((item) => item.item_total != null || item.rate != null);
  const items = priced.length
    ? priced.reduce((sum, item) => sum + (item.item_total ?? (item.rate ?? 0) * (item.quantity_expected || 0)), 0)
    : null;
  const raw = data.po?.raw ?? {};
  const shipping = money(raw.cf_shipping_fee_unformatted);
  const tax = money(raw.cf_tax_unformatted);
  const poTotal = money(data.po?.total);
  const withFees = (items ?? 0) + (shipping ?? 0) + (tax ?? 0);
  const feesAddUp = items != null && (poTotal == null || Math.abs(withFees - poTotal) < 0.05);
  const total = poTotal ?? (items == null ? null : withFees);
  if (items == null && total == null) return null;
  return {
    rows: [
      ...(items != null ? [{ label: 'Items', value: items }] : []),
      ...(feesAddUp && shipping ? [{ label: 'Shipping', value: shipping }] : []),
      ...(feesAddUp && tax ? [{ label: 'Tax', value: tax }] : []),
      { label: 'Total', value: total },
    ],
  };
}

/** A carton's price: its lines' unit costs × what was ordered. */
function cartonPrice(itemLines: readonly ReceivingLineRow[]): RecordModel['price'] {
  const priced = itemLines.filter((line) => (money(line.unit_price) ?? 0) > 0);
  if (priced.length === 0) return null;
  const total = priced.reduce((sum, line) => sum + money(line.unit_price)! * (line.quantity_expected || 1), 0);
  return { rows: [{ label: 'Total', value: total }] };
}

/** An item's line price: unit × qty = total; null when nothing prices it. */
function lineCost(unit: number | null, qty: number | null, total: number | null): RecordModelItem['cost'] {
  const units = qty != null && qty > 0 ? qty : 1;
  const priced = unit != null && unit > 0 ? unit : null;
  if (priced == null && total == null) return null;
  return { unit: priced, qty: units, total: total ?? (priced != null ? priced * units : null) };
}

/** One receiving line as an item — the Zoho-governed title (SKU IDENTITY LAW), qty, condition, cost, serials. */
function lineItem(
  line: ReceivingLineRow,
  current: boolean,
  overrides: Partial<Pick<RecordModelItem, 'title' | 'sku' | 'received' | 'expected' | 'cost'>> & {
    description?: string | null;
  } = {},
): RecordModelItem {
  const title =
    overrides.title ??
    (resolveSkuIdentityTitle({
      zoho_item_title: line.zoho_item_title,
      catalog_product_title: line.catalog_product_title,
      item_name: line.item_name,
      sku: line.sku,
    }) ||
      'Unidentified item');
  const identity = receivingRecordIdentity(line);
  const expected = overrides.expected ?? line.quantity_expected ?? null;
  const received = overrides.received ?? line.quantity_received ?? null;
  const ticket = text(line.zendesk_ticket);
  const facts: RecordFact[] = [
    ...(ticket ? [{ label: 'Claim', value: <TicketLink ticket={ticket} /> }] : []),
    ...(text(line.notes) ? [{ label: 'Item note', value: line.notes, wide: true }] : []),
    ...(text(line.label_note) ? [{ label: 'Label face', value: line.label_note, wide: true }] : []),
    ...(text(line.zoho_notes) ? [{ label: 'PO line note', value: line.zoho_notes, wide: true }] : []),
    ...(text(overrides.description) ? [{ label: 'Description', value: overrides.description, wide: true }] : []),
  ];
  return {
    key: `line:${line.id}`,
    title,
    sku: overrides.sku !== undefined ? text(overrides.sku) : text(line.sku),
    skuCatalogId: positiveId(line.sku_catalog_id),
    photoUrl: text(line.image_url),
    received,
    expected,
    short: expected != null && received != null && received < expected && Boolean(line.unboxed_at),
    condition: line.condition_grade ? conditionLabel(line.condition_grade, 'label') : null,
    conditionGrade: text(line.condition_grade),
    listing: identity.itemNumber || identity.listingHref ? { href: identity.listingHref, itemNumber: identity.itemNumber } : null,
    serials: receivingRecordSerials(line),
    serialNote:
      receivingSerialCountWarning(line) ??
      (line.serial_absent ? `Serial waived${line.serial_absent_reason ? ` · ${line.serial_absent_reason}` : ''}` : null),
    facts,
    cost: overrides.cost !== undefined ? overrides.cost : lineCost(money(line.unit_price), expected ?? received, null),
    current,
  };
}

/** The Tested step's in-line assignee — only a single test-bound line has one to assign. */
function testAssignFor(itemLines: readonly ReceivingLineRow[], onCommitted: () => void): RecordModel['stepAssign'] {
  const testLines = itemLines.filter((line) => line.needs_test || text(line.tested_at) || (line.tested_count ?? 0) > 0);
  if (testLines.length !== 1) return null;
  const line = testLines[0]!;
  if (text(line.tested_at) || (line.tested_count ?? 0) > 0) return null;
  return {
    stepKey: 'tested',
    label: 'tester',
    role: 'technician',
    staffId: line.assigned_tech_id ?? null,
    onCommit: (staffId) => patchLineQcAssignee(line.id, staffId).then(onCommitted),
  };
}

function sumQty(lines: readonly ReceivingLineRow[]): number | undefined {
  const total = lines.reduce((sum, line) => sum + (line.quantity_expected ?? 0), 0);
  return total > 0 ? total : undefined;
}

/** The delivery read the adapter needs: the details controller's state. */
export interface InboundDeliveryRead {
  data: DetailsResponse | undefined;
  loading: boolean;
  error: boolean;
  /** Why the row has no details identity (toast copy), when it has none. */
  unresolved: string | null;
  refetch: () => void;
  invalidate: () => void;
}

export function inboundDeliveryModel(
  row: ReceivingLineRow,
  purchaseLines: readonly ReceivingLineRow[],
  read: InboundDeliveryRead,
): RecordModel {
  const { data } = read;
  const lines = purchaseLines.length > 0 ? purchaseLines : [row];
  const itemLines = lines.filter((line) => line.id > 0);
  const paired = Boolean(data?.po?.zoho_purchaseorder_id || row.zoho_purchaseorder_id || data?.inbound || row.source_order_id);
  const tracking = text(data?.shipment?.tracking_number) ?? text(row.tracking_number) ?? text(data?.inbound?.tracking_number);
  const carrier = text(data?.shipment?.carrier) ?? text(row.carrier);
  // An incoming line's door scan is its `received_at` (the carton's arrival
  // stamp), else the line's own scan — the carton read the ladder expects.
  const dockedAt =
    text(data?.receiving?.received_at) ?? lines.map((line) => text(line.received_at) ?? text(line.scanned_at)).find(Boolean) ?? null;
  const poDate = text(data?.po?.po_date) ?? text(row.po_date);
  const internal = deriveInboundInternalSteps(
    dockedAt ? { id: cartonIdOf(row, data) ?? 0, tracking_scanned_at: dockedAt, tracking_scanned_by_name: row.received_by_name ?? null } : null,
    lines,
    { poDate },
  );
  const delivered =
    Boolean(data?.shipment?.is_delivered || data?.shipment?.delivered_at) || lines.some((line) => line.is_delivered || text(line.delivered_at));
  const currency = data?.po?.currency ?? null;
  const byLineId = new Map(lines.map((line) => [line.id, line] as const));
  const po = text(data?.po?.zoho_purchaseorder_number) ?? text(row.zoho_purchaseorder_number);
  const orderRef = text(data?.inbound?.order_number) ?? text(row.source_order_id);
  const listing = text(data?.inbound?.listing_url) ?? text(row.listing_url) ?? text(row.receiving_listing_url);
  const bin = text(row.staged_location_code) ?? text(row.staged_location_name) ?? text(row.staging_location_label);
  const expectedDate = text(data?.po?.expected_delivery_date) ?? text(row.expected_delivery_date);
  const exception = purchaseExceptionReason(lines);
  const receivingId = cartonIdOf(row, data);
  const promise: DeliveryPromiseInput | null = tracking
    ? {
        estimatedDeliveryAt: data?.shipment?.estimated_delivery_at ?? null,
        deliveredAt: data?.shipment?.delivered_at ?? row.delivered_at ?? null,
        isDelivered: delivered,
      }
    : null;

  const items: RecordModelItem[] | null = data?.line_items.length
    ? data.line_items.map((item, index) => {
        const line = byLineId.get(item.receiving_line_id ?? -1);
        const title =
          resolveSkuIdentityTitle({
            zoho_item_title: line?.zoho_item_title,
            catalog_product_title: line?.catalog_product_title,
            item_name: item.name ?? line?.item_name,
            sku: item.sku,
          }) || `Line ${index + 1}`;
        const cost = lineCost(money(item.rate), item.quantity_expected ?? item.quantity_received, money(item.item_total));
        if (line) {
          return lineItem(line, line.id === row.id, {
            title,
            sku: item.sku,
            received: item.quantity_received,
            expected: item.quantity_expected,
            description: item.description,
            cost,
          });
        }
        return {
          key: `po-line:${item.line_item_id ?? index}`,
          title,
          sku: text(item.sku),
          skuCatalogId: null,
          photoUrl: null,
          received: item.quantity_received,
          expected: item.quantity_expected,
          short: false,
          condition: null,
          conditionGrade: null,
          listing: item.listing_url ? { href: item.listing_url, itemNumber: null } : null,
          serials: [],
          serialNote: null,
          cost,
          facts: [
            ...(text(item.description) ? [{ label: 'Description', value: item.description, wide: true }] : []),
          ],
          current: false,
        } satisfies RecordModelItem;
      })
    : read.loading && !data
      ? null
      : itemLines.map((line) => lineItem(line, line.id === row.id));
  const ordered = data?.line_items.reduce((sum, item) => sum + (item.quantity_expected || 0), 0) ?? 0;
  const receivedQty = data?.line_items.reduce((sum, item) => sum + (item.quantity_received || 0), 0) ?? 0;

  return {
    ...INBOUND_FRAME,
    key: `delivery:${row.id}`,
    title: {
      ref: po ?? purchaseIdentity(row),
      platform: text(data?.inbound?.source_type) ?? text(row.inbound_source_type) ?? text(row.source_platform) ?? 'zoho',
      date: poDate
        ? { label: fmtDate(poDate, 'MMM d'), tip: `Ordered ${fmtDate(poDate)}` }
        : importedDate(lines),
    },
    status: inboundCurrentStatus({
      internal,
      delivered,
      carrierStatus: text(data?.shipment?.latest_status_category) ?? text(row.shipment_status),
      tracking,
    }),
    alerts: deriveIncomingAlerts(lines, paired),
    exception,
    dates: [
      ...(poDate ? [{ label: 'Ordered', value: fmtDate(poDate, 'MMM d') }] : []),
      ...(expectedDate ? [{ label: 'Expected', value: fmtDate(expectedDate, 'MMM d') }] : []),
    ],
    promise,
    external: tracking
      ? {
          events: (data?.shipment?.events ?? []).map((event) => ({
            id: event.id,
            eventOccurredAt: event.event_occurred_at,
            category: event.normalized_status_category,
            label: event.external_status_label,
            description: event.external_status_description,
            city: event.event_city,
            state: event.event_state,
            exception: event.exception_description,
            signedBy: event.signed_by,
          })),
          carrier,
          loading: read.loading,
          error: read.error,
        }
      : null,
    internal: inboundSteps(internal),
    stepAssign: testAssignFor(itemLines, read.invalidate),
    items,
    itemsNotice: read.unresolved
      ? read.unresolved
      : items && items.length === 0
        ? 'No item lines on this purchase yet.'
        : null,
    itemsSummary: data?.line_items.length ? `received ${receivedQty}/${ordered}` : null,
    serials: [...new Set(itemLines.flatMap(receivingRecordSerials))],
    expectedUnits: sumQty(itemLines),
    notes: text(row.notes) ? [{ label: 'Line note', value: row.notes, wide: true }] : [],
    staffNote: receivingId ? staffNoteEditor(receivingId, data?.notes ?? '', read.invalidate) : null,
    price: purchasePrice(data),
    currency,
    refresh: read.invalidate,
    photos: photosDoor(`delivery:${row.id}`, receivingId, po),
    party: [
      {
        label: 'Name',
        value: text(data?.po?.vendor_name) ?? text(data?.inbound?.seller_name) ?? text(row.vendor_name) ?? <span className="text-mode-muted">Unknown</span>,
      },
      ...(text(data?.inbound?.account_label) ?? text(row.platform_account_label)
        ? [{ label: 'Account', value: text(data?.inbound?.account_label) ?? text(row.platform_account_label) }]
        : []),
      {
        label: 'Source',
        value: id(inboundSourceLabel(data?.inbound?.source_type || row.inbound_source_type || row.source_platform || 'zoho')),
      },
      ...(po ? [{ label: 'PO', value: id(po) }] : []),
      ...(orderRef ? [{ label: 'Order #', value: id(orderRef) }] : []),
      ...(text(data?.po?.status) ?? text(data?.inbound?.status)
        ? [{ label: 'Status', value: sentenceCaseLabel(data?.po?.status || data?.inbound?.status || '') }]
        : []),
      ...(text(data?.po?.reference_number) ? [{ label: 'Reference', value: id(data!.po!.reference_number!) }] : []),
      ...(listing ? [{ label: 'Listing', value: <RecordListingLink href={listing} itemNumber={null} face="value" /> }] : []),
      ...(data?.inbound?.links.length
        ? data.inbound.links.map((link) => ({
            label: link.is_primary ? 'Primary' : 'Linked',
            value: id(`${inboundSourceLabel(link.source_type)} · ${link.source_order_id}`),
          }))
        : []),
    ],
    movement: [
      trackingFact(tracking, carrier),
      ...promiseFact(promise),
      ...stampFact('Delivered', null, data?.shipment?.delivered_at ?? row.delivered_at),
      ...stampFact('Docked', row.received_by_name, data?.receiving?.received_at ?? row.received_at),
      ...stampFact('Last check', null, data?.shipment?.last_checked_at ?? row.shipment_last_checked_at),
      ...(receivingId ? [{ label: 'Carton', value: id(String(receivingId)) }] : []),
      ...(bin ? [{ label: 'Location', value: id(bin) }] : []),
    ],
    loadFailed:
      !read.unresolved && read.error && !data ? { message: 'Could not load delivery details.', retry: read.refetch } : null,
  };
}

const SOURCE_LABEL: Readonly<Record<string, string>> = {
  zoho_po: 'Zoho purchase order',
  unmatched: 'Unmatched carton',
  local_pickup: 'Local pickup',
};

/** The carton's carrier-event read state (`cartonCarrierEventsQuery`). */
export interface InboundCarrierRead {
  events: readonly CarrierEvent[];
  carrier: string | null;
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
  isDelivered: boolean;
  loading: boolean;
  error: boolean;
}

export function inboundCartonModel(record: CartonRecord, openLineId: number, carrierRead: InboundCarrierRead): RecordModel {
  const { receivingId, carton, lines, itemLines, live, poNumber, tracking, carrier } = record;
  const internal = deriveInboundInternalSteps(carton, lines);
  const delivered = lines.some((line) => line.is_delivered || text(line.delivered_at));
  const vendor = text(live.vendor_name);
  const source = text(carton?.source) ?? text(live.receiving_source);
  const dockedAt = text(carton?.tracking_scanned_at) ?? text(live.scanned_at);
  const stagingLabel = text(carton?.staging_location_label) ?? text(live.staging_location_label);
  const bins = [...new Set(lines.map((line) => text(line.staged_location_code) ?? text(line.staged_location_name)).filter(Boolean))];
  const tickets = [...new Set(lines.map((line) => text(line.zendesk_ticket)).filter((ticket): ticket is string => ticket != null))];
  const supportNote = text(carton?.support_notes) ?? text(live.receiving_support_notes);
  const identity = receivingRecordIdentity(live);
  const received = itemLines.reduce((sum, line) => sum + (line.quantity_received ?? 0), 0);
  const expected = sumQty(itemLines);
  const promise: DeliveryPromiseInput | null = tracking
    ? {
        estimatedDeliveryAt: carrierRead.estimatedDeliveryAt,
        deliveredAt: carrierRead.deliveredAt ?? text(live.delivered_at),
        isDelivered: carrierRead.isDelivered || delivered,
      }
    : null;

  return {
    ...INBOUND_FRAME,
    key: `carton:${receivingId}`,
    title: {
      ref: poNumber ?? String(receivingId),
      platform: text(carton?.source_platform) ?? text(live.source_platform) ?? (poNumber ? 'zoho' : null),
      date: dockedAt ? { label: formatMonthDayTimePST(dockedAt), tip: `Docked ${formatMonthDayTimePST(dockedAt)}` } : importedDate(lines),
    },
    status: inboundCurrentStatus({
      internal,
      delivered,
      carrierStatus: text(live.shipment_status),
      tracking,
    }),
    alerts: record.alerts,
    exception: null,
    dates: [
      ...(dockedAt ? [{ label: 'Docked', value: formatMonthDayTimePST(dockedAt) }] : []),
      ...(text(carton?.unboxed_at) ? [{ label: 'Unboxed', value: formatMonthDayTimePST(carton!.unboxed_at!) }] : []),
    ],
    promise,
    external: tracking || carrierRead.events.length > 0
      ? { events: carrierRead.events, carrier: carrierRead.carrier ?? carrier, loading: carrierRead.loading, error: carrierRead.error }
      : null,
    internal: inboundSteps(internal),
    stepAssign: testAssignFor(itemLines, record.refresh),
    items: record.linesLoading ? null : itemLines.map((line) => lineItem(line, line.id === openLineId)),
    itemsNotice:
      !record.linesLoading && itemLines.length === 0
        ? `No item lines on this carton yet — ${record.unfound ? 'pair it to a purchase order in Unbox.' : 'open it in Unbox to add its contents.'}`
        : null,
    itemsSummary: expected != null && carton?.unboxed_at ? `received ${received}/${expected}` : null,
    serials: [...new Set(itemLines.flatMap(receivingRecordSerials))],
    expectedUnits: expected,
    notes: [],
    staffNote: staffNoteEditor(receivingId, supportNote ?? '', record.refresh),
    price: cartonPrice(itemLines),
    currency: null,
    refresh: record.refresh,
    photos: photosDoor(`carton:${receivingId}`, receivingId, poNumber),
    party: [
      { label: 'Platform', value: <span className="flex h-8 items-center"><ReceivingRecordPlatform row={live} /></span> },
      ...(vendor ? [{ label: 'Name', value: vendor }] : []),
      { label: 'PO #', value: <span className={cn(RECORD_ID_CLASS, 'select-all', !poNumber && 'text-mode-warn')}>{poNumber ?? 'Not paired'}</span> },
      ...(source
        ? [{
            label: 'Source',
            value: `${SOURCE_LABEL[source] ?? source}${carton?.is_return ? ` · return${carton.return_reason ? ` (${readReturnReason(carton.return_reason)?.label ?? carton.return_reason})` : ''}` : ''}`,
          }]
        : []),
      ...(identity.listingHref || identity.itemNumber
        ? [{ label: 'Listing', value: <RecordListingLink href={identity.listingHref} itemNumber={identity.itemNumber} face="value" /> }]
        : []),
      ...(tickets.length > 0
        ? [{ label: 'Claims', value: <span className="flex flex-wrap gap-x-3">{tickets.map((ticket) => <TicketLink key={ticket} ticket={ticket} />)}</span> }]
        : []),
    ],
    movement: [
      trackingFact(tracking, carrier),
      ...promiseFact(promise),
      ...(text(live.shipment_status) ? [{ label: 'Carrier status', value: sentenceCaseLabel(live.shipment_status!) }] : []),
      ...stampFact('Delivered', null, live.delivered_at),
      ...stampFact('Docked', carton?.tracking_scanned_by_name, dockedAt),
      { label: 'Carton', value: id(String(receivingId)) },
      ...(stagingLabel ? [{ label: 'Staging', value: stagingLabel }] : []),
      ...(live.priority_lane ? [{ label: 'Lane', value: live.priority_lane }] : []),
      ...(bins.length > 0 ? [{ label: 'Bin', value: id(bins.join(', ')) }] : []),
    ],
    loadFailed: record.loadFailed
      ? { message: 'Some receiving evidence could not be loaded. Missing data is not proof of non-receipt.', retry: record.refresh }
      : null,
  };
}

/** A pasted number with no lines on file: the Check's answer, on the same record. */
export function inboundPastedNumberModel(number: PastedNumber, check: CheckZohoReceivedRow | null): RecordModel {
  const { entry, sharedWith } = number;
  const face = pastedNumberStatusFace(entry);
  const local = check?.local ?? null;
  const step = (key: string, label: string, done: boolean | undefined): ReceivingStatusStep => ({
    key,
    label,
    state: done ? 'done' : 'todo',
    who: null,
    at: null,
    detail: null,
  });
  return {
    ...INBOUND_FRAME,
    key: `number:${entry.key}`,
    title: { ref: entry.ref, platform: null, date: null },
    status: { label: face.face, detail: entry.detail },
    alerts: [],
    exception: entry.exception ? { why: face.face, next: entry.exception.reason } : null,
    dates: [],
    promise: null,
    external: null,
    internal: local
      ? inboundSteps([
          step('known', 'Known', local.known),
          step('delivered', 'Delivered', local.delivered),
          step('scanned', 'Docked', local.scanned),
          step('unboxed', 'Unboxed', local.unboxed),
        ])
      : [],
    stepAssign: null,
    items: [],
    itemsNotice: sharedWith ? `Its lines sit under ${sharedWith}.` : 'Nothing on file carries this number.',
    itemsSummary: null,
    serials: [],
    expectedUnits: undefined,
    notes: local?.watch ? [{ label: 'Watch', value: local.watch }] : [],
    staffNote: null,
    price: null,
    currency: null,
    refresh: null,
    photos: photosDoor(`number:${entry.key}`, null, check?.po_number ?? null),
    party: check?.vendor_name ? [{ label: 'Name', value: check.vendor_name }] : [],
    movement: [
      { label: 'Number', value: id(entry.ref) },
      ...(check
        ? [
            { label: 'Reason', value: check.reason },
            { label: 'Verdict', value: check.verdict },
            ...(check.status ? [{ label: 'PO status', value: check.status }] : []),
            ...(check.po_number ? [{ label: 'PO', value: id(check.po_number) }] : []),
          ]
        : [{ label: 'Check', value: entry.detail }]),
    ],
    loadFailed: null,
  };
}
