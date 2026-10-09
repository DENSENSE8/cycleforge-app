/**
 * eBay Post-Order return payloads → the `ebay_returns` import file
 * (`return-files.ts`). Pure: no network, no database — `returns.ts` fetches,
 * this renders. Each return becomes one row in the eBay returns report shape
 * (the preset's own header words), so it lands through `runPoCsvImport` like
 * an uploaded report.
 *
 * Payload slices follow the official contracts: Post-Order v2
 * `GET /post-order/v2/return/search` (ReturnSummaryType members) and
 * `GET /post-order/v2/return/{returnId}` FULL (`summary` + `detail.itemDetail`,
 * `detail.returnShipmentInfo`), and Sell Fulfillment v1 `getOrder`
 * (`orderId`, `lineItems[].legacyItemId/sku/title`).
 */

import { z } from 'zod';
import type { ReturnReportFile, ReturnWindow } from '@/lib/returns/return-files';

const SEARCH_SPAN_MS = 90 * 24 * 60 * 60 * 1000;

// ── API payload slices ──────────────────────────────────────────────────────

const Id = z.union([z.string(), z.number()]).transform((v) => String(v).trim());
const Count = z.union([z.string(), z.number()]).transform((v) => Number(v));
const DateTime = z.object({ value: z.string().optional() });
const Tracking = z.object({ trackingNumber: z.string().optional() });

const ReturnSummary = z.object({
  returnId: Id,
  orderId: Id.optional(),
  state: z.string().optional(),
  creationInfo: z
    .object({
      item: z
        .object({ itemId: Id.optional(), transactionId: Id.optional(), returnQuantity: Count.optional() })
        .optional(),
      reason: z.string().optional(),
      comments: z.object({ content: z.string().optional() }).optional(),
      creationDate: DateTime.optional(),
    })
    .optional(),
});

const SearchResponse = z.object({
  members: z.array(ReturnSummary).optional(),
  paginationOutput: z.object({ totalEntries: Count.optional(), totalPages: Count.optional() }).optional(),
});

const ReturnDetailResponse = z.object({
  summary: ReturnSummary.optional(),
  detail: z
    .object({
      itemDetail: z
        .object({ itemId: Id.optional(), itemTitle: z.string().optional(), returnQuantity: Count.optional() })
        .optional(),
      returnShipmentInfo: z
        .object({ shipmentTracking: Tracking.optional(), allShipmentTrackings: z.array(Tracking).optional() })
        .optional(),
    })
    .optional(),
});

const FulfillmentOrder = z.object({
  orderId: z.string().optional(),
  lineItems: z
    .array(z.object({ legacyItemId: Id.optional(), sku: z.string().optional(), title: z.string().optional() }))
    .optional(),
});

export type EbayReturnSummary = z.infer<typeof ReturnSummary>;

// ── Payloads → one record → the import file ─────────────────────────────────

/** One eBay return request, in the words the returns report carries. */
export interface EbayReturnRecord {
  returnId: string;
  orderNumber: string;
  itemId: string;
  itemTitle: string;
  sku: string;
  quantity: number | null;
  /** The ReturnReasonEnum code as eBay sent it (decoded on read by `readReturnReason`). */
  reason: string;
  buyerComments: string;
  trackingNumber: string;
  /** Civil date (UTC) the buyer opened the return, YYYY-MM-DD; '' when eBay sent none. */
  openedOn: string;
}

/** The `ebay_returns` preset's own header words (`po-columns.ts` headerAliases), in file order. */
export const EBAY_RETURNS_HEADERS = [
  'return id',
  'order number',
  'item id',
  'item title',
  'custom label',
  'quantity',
  'return reason',
  'buyer comments',
  'return tracking number',
  'return opened',
] as const;

/** Parse one search page; `total` is eBay's entry count for the whole query. */
export function parseReturnSearchPage(json: unknown): { members: EbayReturnSummary[]; total: number | null } {
  const parsed = SearchResponse.parse(json ?? {});
  const total = parsed.paginationOutput?.totalEntries;
  return { members: parsed.members ?? [], total: total != null && Number.isFinite(total) ? total : null };
}

/** eBay DateTime value (ISO-8601 UTC) → the civil day `parsePoDate` reads, '' when absent. */
function civilDay(iso: string | undefined): string {
  const m = /^(\d{4}-\d{2}-\d{2})T/.exec(iso?.trim() ?? '');
  return m ? m[1]! : '';
}

/**
 * Merge a search member, its full return (`getReturn` FULL, null when not
 * fetched) and its Fulfillment order (null when unavailable) into one record.
 */
export function ebayReturnRecord(
  summary: EbayReturnSummary,
  detailJson: unknown | null,
  orderJson: unknown | null,
): EbayReturnRecord {
  const full = detailJson == null ? null : ReturnDetailResponse.parse(detailJson);
  const order = orderJson == null ? null : FulfillmentOrder.parse(orderJson);
  const info = summary.creationInfo ?? full?.summary?.creationInfo;
  const fullInfo = full?.summary?.creationInfo;
  const itemId = info?.item?.itemId || fullInfo?.item?.itemId || full?.detail?.itemDetail?.itemId || '';
  const line = order?.lineItems?.find((l) => l.legacyItemId === itemId) ?? null;
  const shipment = full?.detail?.returnShipmentInfo;
  const tracking =
    shipment?.shipmentTracking?.trackingNumber?.trim() ||
    shipment?.allShipmentTrackings?.map((t) => t.trackingNumber?.trim() ?? '').find(Boolean) ||
    '';
  const quantity = info?.item?.returnQuantity ?? fullInfo?.item?.returnQuantity ?? full?.detail?.itemDetail?.returnQuantity;
  return {
    returnId: summary.returnId,
    orderNumber: order?.orderId?.trim() || summary.orderId || full?.summary?.orderId || '',
    itemId,
    itemTitle: full?.detail?.itemDetail?.itemTitle?.trim() || line?.title?.trim() || '',
    sku: line?.sku?.trim() || '',
    quantity: quantity != null && Number.isFinite(quantity) && quantity > 0 ? quantity : null,
    reason: (info?.reason || fullInfo?.reason || '').trim(),
    buyerComments: (info?.comments?.content || fullInfo?.comments?.content || '').trim(),
    trackingNumber: tracking,
    openedOn: civilDay(info?.creationDate?.value || fullInfo?.creationDate?.value),
  };
}

/** Render records into the `ebay_returns` import file (one row per return). */
export function renderEbayReturnsFile(records: readonly EbayReturnRecord[], window: ReturnWindow): ReturnReportFile {
  const rows = records.map((r): Record<string, string> => ({
    'return id': r.returnId,
    'order number': r.orderNumber,
    'item id': r.itemId,
    'item title': r.itemTitle,
    'custom label': r.sku,
    quantity: r.quantity != null ? String(r.quantity) : '',
    'return reason': r.reason,
    'buyer comments': r.buyerComments,
    'return tracking number': r.trackingNumber,
    'return opened': r.openedOn,
  }));
  return {
    fileName: `ebay-returns ${window.since.toISOString().slice(0, 10)}..${window.until.toISOString().slice(0, 10)}`,
    preset: 'ebay_returns',
    headers: [...EBAY_RETURNS_HEADERS],
    rows,
  };
}

/**
 * Split [since, until) into search ranges eBay accepts: never before its
 * 18-month floor, each at most 90 days (its documented default span).
 */
export function ebaySearchRanges(window: ReturnWindow, now: Date): Array<{ from: string; to: string }> {
  const floor = new Date(now);
  floor.setUTCMonth(floor.getUTCMonth() - 18);
  floor.setUTCDate(floor.getUTCDate() + 1);
  const start = Math.max(window.since.getTime(), floor.getTime());
  const end = Math.min(window.until.getTime(), now.getTime());
  const ranges: Array<{ from: string; to: string }> = [];
  for (let from = start; from < end; from += SEARCH_SPAN_MS) {
    const to = Math.min(from + SEARCH_SPAN_MS, end) - 1; // the window's upper bound is exclusive
    ranges.push({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
  }
  return ranges;
}
