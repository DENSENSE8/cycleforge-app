/**
 * Reopening a landed inbound order as the draft the form edits — the "fix a
 * wrong import" path. The rebuilt draft keeps the order's identity (platform +
 * order number) and every landed line's `lineKey`, so re-submitting it through
 * the one writer (`ingestInboundOrder`) updates the same `inbound_order` and
 * the same `receiving_line` rows instead of minting new ones; the content hash
 * marks the landing "updated".
 *
 * Current rows are the truth (a desk edit may have changed a quantity after
 * the landing); the last landed ledger payload only fills facts the rows do
 * not keep (buyer account, return facts, item numbers, pickup receipt).
 *
 * Client-safe and pure: the server loader is `load-inbound-order-edit.ts`.
 */

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
  line_key: string;
  sku: string | null;
  item_name: string | null;
  sku_catalog_id: number | null;
  quantity_expected: number | null;
  quantity_received: number | null;
  unit_cost_cents: number | null;
  listing_url: string | null;
}

export interface InboundOrderTrackingRow {
  tracking: string | null;
  carrier: string | null;
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

  const lines: InboundOrderLine[] = args.lines.map((row) => {
    const prior = ledgerLine.get(row.line_key);
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
    tracking: (tracking.length ? tracking : [{ number: '', carrier: '' }]).slice(0, 10),
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
  };
}
