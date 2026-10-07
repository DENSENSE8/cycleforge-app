/**
 * `/api/shipping/label-intake/orders` wire contract — Labels & docs › Orders
 * (`?view=orders`): one row per ORDER, shaped as the slots that ship with it.
 *
 *   Shipping label  one per package (canonical label rows; unpaired candidates as suggestions)
 *   Packing slip    one per order
 *   Product paperwork, per line — manuals and inserts resolved order › item # › SKU (live, read-time)
 *
 * Every slot is exactly one {@link PacketSlotState}. The order's status is
 * derived from its slots, never stored. Labels and paperwork reuse the desk's
 * existing row shapes so print, preview and press code stays one path.
 */
import { z } from 'zod';
import type { ListingLink } from '@/utils/external-item-url';
import type { LabelOrderLine, LabelPrintRow, PaperworkDocumentRow } from './contracts';

export const PACKET_SLOT_STATES = ['filled', 'missing', 'not_required', 'review'] as const;
/** `review` = an uncertain auto-match or a held (quarantined / unconfirmed) label — counts as a gap. */
export type PacketSlotState = (typeof PACKET_SLOT_STATES)[number];

/** Order status — ONE param; absence = All. */
export const ORDER_PACKET_STATUS_PARAM = 'status';
export const ORDER_PACKET_STATUSES = ['missing', 'ready', 'printed'] as const;
export type OrderPacketStatus = (typeof ORDER_PACKET_STATUSES)[number];
export const ORDER_PACKET_STATUS_LABEL: Readonly<Record<'all' | OrderPacketStatus, string>> = {
  all: 'All',
  missing: 'Missing',
  ready: 'Ready',
  printed: 'Printed',
};

/** Which slot is missing — multi; absence = any. */
export const ORDER_PACKET_GAP_PARAM = 'gap';
export const ORDER_PACKET_GAPS = ['label', 'slip', 'paperwork'] as const;
export type OrderPacketGap = (typeof ORDER_PACKET_GAPS)[number];
export const ORDER_PACKET_GAP_LABEL: Readonly<Record<OrderPacketGap, string>> = {
  label: 'Shipping label',
  slip: 'Packing slip',
  paperwork: 'Product paperwork',
};

/** Channel (`orders.account_source`) — multi; absence = any. */
export const ORDER_PACKET_CHANNEL_PARAM = 'channel';

export const ORDER_PACKET_SORT_PARAM = 'sort';
/** `priority` (default): Missing › Ready › Printed; then ship-by, oldest first; then order id. */
export const ORDER_PACKET_SORTS = ['priority', 'ship-by', 'newest', 'oldest', 'order'] as const;
export type OrderPacketSort = (typeof ORDER_PACKET_SORTS)[number];
export const ORDER_PACKET_SORT_LABEL: Readonly<Record<OrderPacketSort, string>> = {
  priority: 'Priority',
  'ship-by': 'Ship-by',
  newest: 'Newest order',
  oldest: 'Oldest order',
  order: 'Order number',
};

/** Sidebar Find — server-side over order number (full or last 8), tracking, SKU, item number, product title. */
export const ORDER_PACKET_QUERY_PARAM = 'q';

export const ORDER_PACKET_PAGE_SIZE = 100;
export const MAX_ORDER_PACKET_PAGE_SIZE = 200;

export const orderPacketQuerySchema = z
  .object({
    status: z.enum(ORDER_PACKET_STATUSES).optional(),
    gap: z.array(z.enum(ORDER_PACKET_GAPS)).max(ORDER_PACKET_GAPS.length).optional(),
    channel: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    sort: z.enum(ORDER_PACKET_SORTS).default('priority'),
    q: z.string().trim().max(200).optional(),
    /** Exactly these order rows' orders (any line of the order) — another surface's selection (the Live feed's print). */
    ids: z.array(z.coerce.number().int().positive()).min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_ORDER_PACKET_PAGE_SIZE).default(ORDER_PACKET_PAGE_SIZE),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type OrderPacketQuery = z.input<typeof orderPacketQuerySchema>;
export type OrderPacketParsedQuery = z.output<typeof orderPacketQuerySchema>;

/** An unpaired stored label that may belong to this order (one click accepts it). */
export interface PacketLabelSuggestion {
  /** `label_ingestions.id`. */
  ingestionId: number;
  rowVersion: number;
  fileBasename: string;
  batchId: number | null;
  pageNumber: number | null;
  /** `label_ingestions.match_method` or the reason the projection suggested it (e.g. `BUYER_NAME`). */
  matchMethod: string;
  trackingNumber: string | null;
  carrier: string | null;
  observedAt: string;
}

/**
 * A shipping-label `documents` row of the order that NO ledger ingestion was
 * applied to (uploaded on the order, a channel / manual label) — prints by
 * `documentId` (`labelPrintRecordBodySchema.documentIds`).
 */
export interface PacketLabelDocument {
  /** `doc:<documents.id>`. */
  key: string;
  documentId: number;
  title: string;
  /** Same-origin bytes (`documentContentUrl`). */
  src: string;
  trackingNumber: string | null;
  createdAt: string;
  printCount: number;
  lastPrintedAt: string | null;
}

export interface OrderPacketLabelSlot {
  state: PacketSlotState;
  /** Canonical ledger labels, one per physical label (an APPLIED ingestion is its document, never twice). */
  labels: LabelPrintRow[];
  /** Shipping-label documents with no ingestion — the rest of the order's physical labels. */
  documents: PacketLabelDocument[];
  suggestions: PacketLabelSuggestion[];
}

export interface OrderPacketSlipSlot {
  state: PacketSlotState;
  /** `kind === 'packing_slip'` only. */
  documents: PaperworkDocumentRow[];
}

/** One product line and its paperwork slot. */
export interface OrderPacketLine extends LabelOrderLine {
  photoUrl: string | null;
  /** `sku_catalog.paperwork_not_required` for this line's catalog SKU. */
  paperworkNotRequired: boolean;
  state: PacketSlotState;
  /** `kind === 'manual'` rows (any `product_manuals.type`: manual, packing list, PL + M, insert) resolved for this line. */
  documents: PaperworkDocumentRow[];
  /** The listing on the order's platform (`resolveListingLink`), or why there is none. */
  listing: ListingLink;
}

/** The order's shipment as the identity strip names it. */
export interface OrderPacketShipment {
  trackingNumber: string;
  carrier: string | null;
}

/**
 * A label on the order whose own evidence disagrees with the order (docs
 * popover QoL 3): its tracking is none of the order's shipments, or the
 * ship-to name read off it is not the order's buyer.
 */
export interface PacketLabelMismatch {
  /** `label:<label_ingestions.id>` | `doc:<documents.id>`. */
  labelKey: string;
  kind: 'tracking' | 'ship_to';
  /** What the label reads. */
  label: string;
  /** What the order holds. */
  order: string;
}

export interface OrderPacket {
  /** Head order (`orders.id` of the first line). */
  orderId: number;
  /** Full order number — paint through the last-8 helpers in lists. */
  orderRef: string;
  accountSource: string | null;
  orderedAt: string | null;
  shipByAt: string | null;
  /** Pickup orders need no shipping label. */
  pickup: boolean;
  /** `orders.docs_not_required` — the order-level exemption (slip + product paperwork). */
  docsNotRequired: boolean;
  /** Who it ships to (ShipStation ship-to, then the customer book). */
  buyerName: string | null;
  shipment: OrderPacketShipment | null;
  /** Labels whose tracking or ship-to name disagrees with this order. */
  labelMismatches: PacketLabelMismatch[];
  label: OrderPacketLabelSlot;
  slip: OrderPacketSlipSlot;
  lines: OrderPacketLine[];
  /** Slots in `missing` or `review` (label + slip + each line). */
  gapCount: number;
  status: OrderPacketStatus;
  printCount: number;
  lastPrintedAt: string | null;
}

export interface OrderPacketQueue {
  rows: OrderPacket[];
  /** Rows matching every filter (before limit/offset). */
  total: number;
  /** Per status under every OTHER filter — the sidebar status counts. */
  counts: Record<'all' | OrderPacketStatus, number>;
  /** Per gap under every OTHER filter. */
  gapCounts: Record<OrderPacketGap, number>;
  /** Per channel under every OTHER filter. */
  channelCounts: Record<string, number>;
}

/** `GET /api/sku-catalog/[id]/paperwork-reach` — what a SKU-scope pair or unpair touches. */
export interface SkuPaperworkReach {
  skuCatalogId: number;
  /** Open (unshipped, uncancelled) orders with a line on this SKU. */
  openOrders: number;
}

/** `PATCH /api/sku-catalog/[id]/paperwork-required` body. */
export const skuPaperworkRequiredBodySchema = z.object({ notRequired: z.boolean() }).strict();
export type SkuPaperworkRequiredBody = z.infer<typeof skuPaperworkRequiredBodySchema>;

/** Status from slots — the one derivation server and tests share. */
export function packetStatus(input: { gapCount: number; printable: { printCount: number }[] }): OrderPacketStatus {
  if (input.gapCount > 0) return 'missing';
  if (input.printable.length > 0 && input.printable.every((doc) => doc.printCount > 0)) return 'printed';
  return 'ready';
}

/** A slot is a gap when it needs the operator. */
export const isPacketGap = (state: PacketSlotState): boolean => state === 'missing' || state === 'review';
