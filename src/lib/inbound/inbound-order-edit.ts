/**
 * Reopening a landed inbound order as the draft the form edits — the "fix a
 * wrong import" path. The rebuilt draft keeps the order's identity (platform +
 * order number) and every landed line's `lineKey`, so re-submitting it through
 * the one writer (`ingestInboundOrder`) updates the same `inbound_order` and
 * the same `receiving_line` rows instead of minting new ones; the content hash
 * marks the landing "updated".
 *
 * Current rows are the truth (a desk edit may have changed a quantity after
 * the landing): line identity, the bought-as grade, the listing serials and a
 * return's facts (`receiving_line_return`) read back from their tables; the
 * last landed ledger payload only fills facts the rows do not keep (buyer
 * account, item numbers, pickup receipt). `lineEvidence` carries what is not
 * in the draft at all: each landed line's listing photos.
 *
 * Client-safe and pure: the server loader is `load-inbound-order-edit.ts`.
 */

import { CONDITION_GRADES, type ConditionGrade } from '@/lib/conditions';
import {
  assignInboundLineKeys,
  emptyInboundOrderDraft,
  emptyInboundOrderLine,
  filledInboundLines,
  inboundOrderDraftSchema,
  inboundOrderIdentity,
  INBOUND_ORDER_TYPES,
  INBOUND_PRIORITY_AUTO,
  normalizeInboundOrderNumber,
  type InboundOrderDraft,
  type InboundOrderLine,
  type InboundOrderType,
} from '@/lib/inbound/inbound-order-draft';

export interface InboundOrderHeaderRow {
  id: number;
  source_type: string;
  source_platform: string;
  external_order_id: string;
  receiving_type: string;
  origin: string;
  status: string;
  vendor_name: string | null;
  currency: string | null;
  order_date: string | null;
  expected_date: string | null;
  priority_tier: number | null;
  notes: string | null;
}

export interface InboundOrderLineRow {
  id: number;
  line_key: string;
  sku: string | null;
  item_name: string | null;
  sku_catalog_id: number | null;
  quantity_expected: number | null;
  quantity_received: number | null;
  unit_cost_cents: number | null;
  listing_url: string | null;
  purchase_condition_grade: string | null;
  /** `receiving_line_listing_serial.serial`, first seen first. */
  listing_serials: string[] | null;
  /** `photos.id` of the line's listing photos (photo_type 'listing'), oldest first. */
  listing_photo_ids: number[] | null;
  /** `receiving_line_return` — null when the line has no return row. */
  return_reason: string | null;
  rma_ref: string | null;
  return_requested_on: string | null;
  fnsku: string | null;
  license_plate_number: string | null;
  disposition: string | null;
  customer_comment: string | null;
}

export interface InboundOrderTrackingRow {
  tracking: string | null;
  carrier: string | null;
}

/** What a landed line carries outside the draft — the form shows and deletes these. */
export interface InboundOrderLineEvidence {
  lineKey: string;
  receivingLineId: number;
  /** `url` = `/api/photos/${id}/content`; delete with `DELETE /api/photos/${id}`. */
  listingPhotos: Array<{ id: number; url: string }>;
}

export interface InboundOrderEditRecord {
  inboundOrderId: number;
  status: string;
  origin: string;
  sourceType: string;
  draft: InboundOrderDraft;
  /** Keys of the lines already on the order — the writer keeps them; a re-save edits them in place. */
  landedLineKeys: string[];
  /** Units already received per landed line key. */
  receivedByLineKey: Record<string, number>;
  /** Why this order cannot be corrected by hand; null = editable. */
  refusal: string | null;
  /** One entry per landed line, in line order. */
  lineEvidence: InboundOrderLineEvidence[];
}

/** An inbound order behind a carton — the phone carton record's door to correct it. */
export interface CartonInboundOrder {
  inboundOrderId: number;
  orderNumber: string;
  platform: string;
  type: string;
  lineCount: number;
  /** Why it cannot be corrected by hand; null = editable. */
  refusal: string | null;
}

/**
 * The platform token that reproduces a stored identity through
 * `inboundOrderIdentity` — the inverse of (source_type, source_platform).
 */
export function inboundPlatformForIdentity(sourceType: string, sourcePlatform: string): string {
  if (sourceType !== 'manual') return sourceType;
  return sourcePlatform && sourcePlatform !== 'none' ? sourcePlatform : 'manual';
}

/** Zoho orders arrive by sync and a repair drop-off lands from its ticket — neither is corrected by hand. */
export function inboundOrderEditRefusal(header: Pick<InboundOrderHeaderRow, 'source_type' | 'receiving_type'>): string | null {
  if (header.source_type === 'zoho') return 'Zoho purchase orders arrive by sync — correct them in Zoho.';
  if (header.receiving_type === 'REPAIR') return 'A repair drop-off is owned by its repair ticket.';
  return null;
}

function ledgerDraftFor(header: InboundOrderHeaderRow, payload: unknown): InboundOrderDraft | null {
  const parsed = inboundOrderDraftSchema.safeParse(payload);
  if (!parsed.success) return null;
  const identity = inboundOrderIdentity(parsed.data);
  const same =
    identity.sourceType === header.source_type &&
    identity.sourcePlatform === header.source_platform &&
    identity.externalOrderIdNorm === normalizeInboundOrderNumber(header.external_order_id);
  return same ? parsed.data : null;
}

export function inboundOrderEditRecordFrom(args: {
  header: InboundOrderHeaderRow;
  lines: readonly InboundOrderLineRow[];
  tracking: readonly InboundOrderTrackingRow[];
  /** `inbound_ingest_event.payload` of the order's last landing, if any. */
  ledgerPayload: unknown;
}): InboundOrderEditRecord {
  const { header } = args;
  const type: InboundOrderType = (INBOUND_ORDER_TYPES as readonly string[]).includes(header.receiving_type)
    ? (header.receiving_type as InboundOrderType)
    : 'PO';
  const ledger = ledgerDraftFor(header, args.ledgerPayload);
  const base = ledger ?? emptyInboundOrderDraft(type);
  // The writer keyed the landed lines with assignInboundLineKeys over the filled lines — map them back the same way.
  const ledgerLines = ledger ? filledInboundLines(ledger) : [];
  const ledgerKeys = assignInboundLineKeys(ledgerLines);
  const ledgerLine = new Map(ledgerLines.map((l, i) => [ledgerKeys[i], l]));

  // The order's return facts: the last landing's own values, else the first line's row (the writer stamps
  // the order's values on every line whose own are blank). A line keeps its own only where it differs.
  const firstRow = args.lines[0];
  const orderReturnReason = ledger ? ledger.returnReason : firstRow?.return_reason ?? base.returnReason;
  const orderRmaId = ledger ? ledger.rmaId : firstRow?.rma_ref ?? base.rmaId;
  const orderReturnRequestDate = ledger ? ledger.returnRequestDate : firstRow?.return_requested_on ?? base.returnRequestDate;

  const lines: InboundOrderLine[] = args.lines.map((row) => {
    const prior = ledgerLine.get(row.line_key);
    const grade = row.purchase_condition_grade as ConditionGrade | null;
    return {
      ...emptyInboundOrderLine(),
      ...prior,
      lineKey: row.line_key,
      skuCatalogId: row.sku_catalog_id == null ? null : Number(row.sku_catalog_id),
      sku: row.sku?.trim() ?? '',
      title: row.item_name?.trim() ?? '',
      quantity: row.quantity_expected == null ? null : Math.max(1, Number(row.quantity_expected)),
      unitCostCents: row.unit_cost_cents == null ? null : Number(row.unit_cost_cents),
      listingUrl: row.listing_url?.trim() || prior?.listingUrl || '',
      conditionGrade: grade && CONDITION_GRADES.includes(grade) ? grade : null,
      listingSerials: row.listing_serials ?? [],
      // Absent stays absent (undefined), so an untouched reopen re-hashes as unchanged.
      fnsku: row.fnsku ?? prior?.fnsku,
      licensePlateNumber: row.license_plate_number ?? prior?.licensePlateNumber,
      disposition: row.disposition ?? prior?.disposition,
      customerComment: row.customer_comment ?? prior?.customerComment,
      returnReason: row.return_reason != null && row.return_reason !== orderReturnReason ? row.return_reason : undefined,
      rmaId: row.rma_ref != null && row.rma_ref !== orderRmaId ? row.rma_ref : undefined,
      returnRequestDate:
        row.return_requested_on != null && row.return_requested_on !== orderReturnRequestDate ? row.return_requested_on : undefined,
    };
  });

  const scanned = args.tracking
    .filter((t) => t.tracking?.trim())
    .map((t) => ({ number: t.tracking!.trim(), carrier: t.carrier?.trim() && t.carrier !== 'UNKNOWN' ? t.carrier.trim() : '' }));
  const tracking = scanned.length ? scanned : base.tracking.filter((t) => t.number.trim());

  const draft: InboundOrderDraft = {
    ...base,
    type,
    platform: ledger?.platform ?? inboundPlatformForIdentity(header.source_type, header.source_platform),
    orderNumber: header.external_order_id,
    vendor: header.vendor_name?.trim() ?? base.vendor,
    currency: (header.currency?.trim() || base.currency || 'USD').toUpperCase(),
    orderDate: header.order_date ?? base.orderDate,
    expectedDate: header.expected_date ?? base.expectedDate,
    priority: header.priority_tier == null ? INBOUND_PRIORITY_AUTO : (String(header.priority_tier) as InboundOrderDraft['priority']),
    notes: header.notes ?? base.notes,
    returnReason: orderReturnReason,
    rmaId: orderRmaId,
    returnRequestDate: orderReturnRequestDate,
    tracking: tracking.length ? tracking : [{ number: '', carrier: '' }],
    lines: lines.length ? lines : [emptyInboundOrderLine()],
  };

  return {
    inboundOrderId: Number(header.id),
    status: header.status,
    origin: header.origin,
    sourceType: header.source_type,
    draft,
    landedLineKeys: args.lines.map((l) => l.line_key),
    receivedByLineKey: Object.fromEntries(args.lines.map((l) => [l.line_key, Number(l.quantity_received ?? 0)])),
    refusal: inboundOrderEditRefusal(header),
    lineEvidence: args.lines.map((l) => ({
      lineKey: l.line_key,
      receivingLineId: Number(l.id),
      listingPhotos: (l.listing_photo_ids ?? []).map((id) => ({ id: Number(id), url: `/api/photos/${id}/content` })),
    })),
  };
}
