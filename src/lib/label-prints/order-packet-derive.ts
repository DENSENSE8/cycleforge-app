/**
 * Labels & docs › Orders — the pure half of the order projection (client-safe,
 * no DB): canonical labels, slot states, label suggestions, the packet, and
 * the queue's filter / count / sort / page. `order-packets.ts` reads the raw
 * facts in one statement and hands them here, so the route, the sidebar
 * facets and the tests run ONE derivation.
 *
 * Slot rules (docs/handoff/PROMPT-labels-docs-orders-view-2026-10-05.md):
 *   Label  not_required when pickup; filled with ≥1 canonical label (an
 *          applied / linked / ShipStation ingestion, or a label document);
 *          review when only a matched but unapplied ingestion exists; else missing.
 *   Slip   filled with ≥1 packing slip on any line; not_required when the order
 *          is exempt (`docs_not_required`); else missing.
 *   Line   filled with ≥1 resolved product paperwork; not_required when its SKU
 *          (`sku_catalog.paperwork_not_required`) or the order is exempt; else missing.
 */
import { normalizeBuyerName, sameBuyer } from '@/lib/label-ingestions/exact-resolver';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import { orderStorefront, resolveListingLink, type StoredListing } from '@/utils/external-item-url';
import type { LabelOrderLine, LabelPrintRow, PaperworkDocumentRow } from './contracts';
import {
  isPacketGap,
  packetStatus,
  type OrderPacket,
  type OrderPacketGap,
  type OrderPacketLine,
  type OrderPacketParsedQuery,
  type OrderPacketQueue,
  type OrderPacketSort,
  type OrderPacketStatus,
  type PacketLabelDocument,
  type PacketLabelSuggestion,
  type PacketLabelMismatch,
  type OrderPacketShipment,
  type PacketSlotState,
} from './order-packet-contracts';

/** At most this many suggested unpaired labels per order. */
export const MAX_PACKET_LABEL_SUGGESTIONS = 5;

// ── Labels ─────────────────────────────────────────────────────────────────

/**
 * One physical label = one row: a label document an APPLIED ingestion became
 * IS that ingestion's row, so it never also lists as a document.
 */
export function canonicalPacketLabels(
  labels: readonly LabelPrintRow[],
  documents: readonly PacketLabelDocument[],
): { labels: LabelPrintRow[]; documents: PacketLabelDocument[] } {
  const applied = new Set(labels.flatMap((row) => (row.documentId == null ? [] : [row.documentId])));
  const seen = new Set<number>();
  return {
    labels: [...labels],
    documents: documents.filter((doc) => {
      if (applied.has(doc.documentId) || seen.has(doc.documentId)) return false;
      seen.add(doc.documentId);
      return true;
    }),
  };
}

/** A ledger label that ships the order: applied to its document, linked by an operator, or bought through ShipStation. */
export function isFiledLabel(row: Pick<LabelPrintRow, 'documentId' | 'state' | 'source'>): boolean {
  return row.documentId != null || row.state === 'APPLIED' || row.state === 'LINKED' || row.source === 'SHIPSTATION_API';
}

export function deriveLabelSlotState(input: {
  pickup: boolean;
  labels: readonly Pick<LabelPrintRow, 'documentId' | 'state' | 'source'>[];
  documents: readonly unknown[];
}): PacketSlotState {
  if (input.pickup) return 'not_required';
  if (input.documents.length > 0 || input.labels.some(isFiledLabel)) return 'filled';
  if (input.labels.length > 0) return 'review';
  return 'missing';
}

// ── Slip + lines ───────────────────────────────────────────────────────────

export function deriveSlipSlotState(input: { docsNotRequired: boolean; slips: readonly unknown[] }): PacketSlotState {
  if (input.slips.length > 0) return 'filled';
  return input.docsNotRequired ? 'not_required' : 'missing';
}

export function deriveLineSlotState(input: { paperworkNotRequired: boolean; orderExempt: boolean; documents: readonly unknown[] }): PacketSlotState {
  if (input.documents.length > 0) return 'filled';
  return input.paperworkNotRequired || input.orderExempt ? 'not_required' : 'missing';
}

/** The product paperwork resolved for one line — a manual covering several lines lists on each of them. */
export function linePaperwork(documents: readonly PaperworkDocumentRow[], orderLineId: number): PaperworkDocumentRow[] {
  return documents.filter((doc) => doc.kind === 'manual' && doc.association.orderLineIds.includes(orderLineId));
}

// ── Suggestions ────────────────────────────────────────────────────────────

/** A staged label no order holds yet, with what it read off the page. */
export interface UnpairedLabelCandidate extends Omit<PacketLabelSuggestion, 'matchMethod'> {
  shipToName: string | null;
  /** The marketplace order number read off the label. */
  marketplaceOrderId: string | null;
}

const refKey = (value: string | null | undefined) => (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Unpaired labels that may belong to this order, newest first: the order
 * number the label prints, then the buyer-name rule the resolver pairs by
 * (`sameBuyer` over `normalizeBuyerName`, `exact-resolver.ts`).
 */
export function matchLabelSuggestions(
  order: { orderRef: string; buyerNames: readonly string[] },
  unpaired: readonly UnpairedLabelCandidate[],
  cap = MAX_PACKET_LABEL_SUGGESTIONS,
): PacketLabelSuggestion[] {
  const ref = refKey(order.orderRef);
  const buyers = order.buyerNames.map(normalizeBuyerName).filter((name) => name.split(' ').length > 1);
  const out: PacketLabelSuggestion[] = [];
  for (const candidate of unpaired) {
    if (out.length >= cap) break;
    const { shipToName, marketplaceOrderId, ...suggestion } = candidate;
    if (ref && refKey(marketplaceOrderId) === ref) {
      out.push({ ...suggestion, matchMethod: 'MARKETPLACE_ORDER_ID' });
      continue;
    }
    const label = shipToName ? normalizeBuyerName(shipToName) : '';
    if (label.split(' ').length > 1 && buyers.some((buyer) => sameBuyer(label, buyer))) {
      out.push({ ...suggestion, matchMethod: 'BUYER_NAME' });
    }
  }
  return out;
}

// ── Mismatch (QoL 3) ───────────────────────────────────────────────────────

/** One label as the mismatch rule reads it. */
export interface LabelEvidence {
  key: string;
  trackingNumber: string | null;
  shipToName: string | null;
}

/** Same parcel: one canonical number, or one is the other behind a routing prefix (USPS `420<zip>`). */
function sameTracking(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 12 && long.endsWith(short);
}

/**
 * Labels on the order that disagree with it: a tracking number that is none
 * of the order's shipments (only when the order holds any), or a ship-to name
 * that is not the order's buyer under the resolver's own rule (`sameBuyer`,
 * both sides two words or more). A label with nothing read stays quiet.
 */
export function packetLabelMismatches(input: {
  buyerNames: readonly string[];
  trackingNumbers: readonly string[];
  labels: readonly LabelEvidence[];
}): PacketLabelMismatch[] {
  const orderTracking = [...new Set(input.trackingNumbers.map(extractCanonicalTracking).filter(Boolean))];
  const buyers = input.buyerNames.map(normalizeBuyerName).filter((name) => name.split(' ').length > 1);
  const out: PacketLabelMismatch[] = [];
  for (const label of input.labels) {
    const tracking = label.trackingNumber ? extractCanonicalTracking(label.trackingNumber) : '';
    if (tracking && orderTracking.length > 0 && !orderTracking.some((own) => sameTracking(own, tracking))) {
      out.push({ labelKey: label.key, kind: 'tracking', label: tracking, order: orderTracking.join(', ') });
    }
    const shipTo = label.shipToName ? normalizeBuyerName(label.shipToName) : '';
    if (shipTo.split(' ').length > 1 && buyers.length > 0 && !buyers.some((buyer) => sameBuyer(shipTo, buyer))) {
      out.push({ labelKey: label.key, kind: 'ship_to', label: label.shipToName!.trim(), order: input.buyerNames[0]! });
    }
  }
  return out;
}

// ── The packet ─────────────────────────────────────────────────────────────

export interface PacketSourceLine extends LabelOrderLine {
  photoUrl: string | null;
  paperworkNotRequired: boolean;
  /** This line's own `orders.docs_not_required`. */
  docsNotRequired: boolean;
  /** Active `sku_platform_ids` rows for the line's item number, catalog SKU or SKU text. */
  storedListings?: StoredListing[];
}

/** Everything one order's packet derives from — the projection's raw read, mapped. */
export interface PacketSource {
  orderId: number;
  orderRef: string;
  accountSource: string | null;
  /** The catalog platform slug `account_source` names (a seller account resolves to its platform). */
  platformSlug?: string | null;
  orderedAt: string | null;
  shipByAt: string | null;
  pickup: boolean;
  /** The head order row's `docs_not_required` — the order exemption the pane toggles. */
  docsNotRequired: boolean;
  /** Who the order ships to (ShipStation ship-to, customer book names) — the buyer-name suggestion key. */
  buyerNames: string[];
  /** The order's own shipment (`orders.shipment_id`), when it has one. */
  shipment?: OrderPacketShipment | null;
  /** Every shipment's tracking number on any line (`orders.shipment_id` + `shipment_links`). */
  trackingNumbers?: string[];
  /** The ship-to name each ingestion read off its label. */
  labelShipTo?: { ingestionId: number; name: string }[];
  labels: LabelPrintRow[];
  labelDocuments: PacketLabelDocument[];
  /** Packing slips and product paperwork, as the paperwork resolution yields them. */
  documents: PaperworkDocumentRow[];
  lines: PacketSourceLine[];
}

type Printable = { printCount: number; lastPrintedAt: string | null };

export function buildOrderPacket(source: PacketSource, unpaired: readonly UnpairedLabelCandidate[]): OrderPacket {
  const canonical = canonicalPacketLabels(source.labels, source.labelDocuments);
  const labelState = deriveLabelSlotState({ pickup: source.pickup, labels: canonical.labels, documents: canonical.documents });
  const slips = source.documents.filter((doc) => doc.kind === 'packing_slip');
  const slipState = deriveSlipSlotState({ docsNotRequired: source.docsNotRequired, slips });
  const storefront = orderStorefront(source.orderRef, source.platformSlug ?? source.accountSource);
  const lines: OrderPacketLine[] = source.lines.map(({ docsNotRequired, storedListings, ...line }) => {
    const documents = linePaperwork(source.documents, line.orderLineId);
    const orderExempt = source.docsNotRequired || docsNotRequired;
    return {
      ...line,
      state: deriveLineSlotState({ paperworkNotRequired: line.paperworkNotRequired, orderExempt, documents }),
      documents,
      listing: resolveListingLink({ storefront, itemNumber: line.itemNumber, stored: storedListings }),
    };
  });
  const shipTo = new Map((source.labelShipTo ?? []).map((row) => [row.ingestionId, row.name]));
  const labelMismatches = packetLabelMismatches({
    buyerNames: source.buyerNames,
    trackingNumbers: source.trackingNumbers ?? (source.shipment ? [source.shipment.trackingNumber] : []),
    labels: [
      ...canonical.labels.map((row) => ({ key: `label:${row.id}`, trackingNumber: row.trackingNumber, shipToName: shipTo.get(row.id) ?? null })),
      ...canonical.documents.map((doc) => ({ key: doc.key, trackingNumber: doc.trackingNumber, shipToName: null })),
    ],
  });
  const gapCount = [labelState, slipState, ...lines.map((line) => line.state)].filter(isPacketGap).length;

  const printable = new Map<string, Printable>();
  for (const row of canonical.labels) printable.set(`label:${row.id}`, row);
  for (const doc of canonical.documents) printable.set(doc.key, doc);
  for (const doc of source.documents) if (doc.src) printable.set(doc.key, doc);
  const prints = [...printable.values()];

  return {
    orderId: source.orderId,
    orderRef: source.orderRef,
    accountSource: source.accountSource,
    orderedAt: source.orderedAt,
    shipByAt: source.shipByAt,
    pickup: source.pickup,
    docsNotRequired: source.docsNotRequired,
    buyerName: source.buyerNames[0] ?? null,
    shipment: source.shipment ?? null,
    labelMismatches,
    label: {
      state: labelState,
      labels: canonical.labels,
      documents: canonical.documents,
      suggestions: labelState === 'missing' ? matchLabelSuggestions(source, unpaired) : [],
    },
    slip: { state: slipState, documents: slips },
    lines,
    gapCount,
    status: packetStatus({ gapCount, printable: prints }),
    printCount: prints.reduce((sum, doc) => sum + doc.printCount, 0),
    lastPrintedAt: prints.reduce<string | null>((latest, doc) => (doc.lastPrintedAt && (!latest || doc.lastPrintedAt > latest) ? doc.lastPrintedAt : latest), null),
  };
}

// ── The queue ──────────────────────────────────────────────────────────────

export function packetGaps(packet: Pick<OrderPacket, 'label' | 'slip' | 'lines'>): Set<OrderPacketGap> {
  const gaps = new Set<OrderPacketGap>();
  if (isPacketGap(packet.label.state)) gaps.add('label');
  if (isPacketGap(packet.slip.state)) gaps.add('slip');
  if (packet.lines.some((line) => isPacketGap(line.state))) gaps.add('paperwork');
  return gaps;
}

type QueueFilter = Pick<OrderPacketParsedQuery, 'status' | 'gap' | 'channel'>;
type Facet = 'status' | 'gap' | 'channel';

/** Does `packet` pass every filter except `skip` (the facet being counted)? */
function passes(packet: OrderPacket, gaps: Set<OrderPacketGap>, filter: QueueFilter, skip: Facet | null): boolean {
  if (skip !== 'status' && filter.status && packet.status !== filter.status) return false;
  if (skip !== 'gap' && filter.gap?.length && !filter.gap.some((gap) => gaps.has(gap))) return false;
  if (skip !== 'channel' && filter.channel?.length && !filter.channel.includes(packet.accountSource ?? '')) return false;
  return true;
}

const STATUS_RANK: Readonly<Record<OrderPacketStatus, number>> = { missing: 0, ready: 1, printed: 2 };

/** ISO instants compare as text; nulls last in either direction. */
function byInstant(a: string | null, b: string | null, dir: 1 | -1): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -dir : dir;
}

export function comparePackets(sort: OrderPacketSort): (a: OrderPacket, b: OrderPacket) => number {
  const byId = (a: OrderPacket, b: OrderPacket) => a.orderId - b.orderId;
  switch (sort) {
    case 'priority':
      return (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || byInstant(a.shipByAt, b.shipByAt, 1) || byInstant(a.orderedAt, b.orderedAt, 1) || byId(a, b);
    case 'ship-by':
      return (a, b) => byInstant(a.shipByAt, b.shipByAt, 1) || byId(a, b);
    case 'newest':
      return (a, b) => byInstant(a.orderedAt, b.orderedAt, -1) || byId(b, a);
    case 'oldest':
      return (a, b) => byInstant(a.orderedAt, b.orderedAt, 1) || byId(a, b);
    case 'order':
      return (a, b) => (a.orderRef < b.orderRef ? -1 : a.orderRef > b.orderRef ? 1 : 0) || byId(a, b);
  }
}

/**
 * The queue over every candidate packet (Find already applied): rows under
 * every filter, sorted and paged; each facet's counts under every OTHER filter.
 */
export function orderPacketQueue(packets: readonly OrderPacket[], query: OrderPacketParsedQuery): OrderPacketQueue {
  const counts: OrderPacketQueue['counts'] = { all: 0, missing: 0, ready: 0, printed: 0 };
  const gapCounts: OrderPacketQueue['gapCounts'] = { label: 0, slip: 0, paperwork: 0 };
  const channelCounts: Record<string, number> = {};
  const rows: OrderPacket[] = [];
  for (const packet of packets) {
    const gaps = packetGaps(packet);
    if (passes(packet, gaps, query, 'status')) {
      counts.all += 1;
      counts[packet.status] += 1;
    }
    if (passes(packet, gaps, query, 'gap')) for (const gap of gaps) gapCounts[gap] += 1;
    if (packet.accountSource && passes(packet, gaps, query, 'channel')) channelCounts[packet.accountSource] = (channelCounts[packet.accountSource] ?? 0) + 1;
    if (passes(packet, gaps, query, null)) rows.push(packet);
  }
  rows.sort(comparePackets(query.sort));
  return { rows: rows.slice(query.offset, query.offset + query.limit), total: rows.length, counts, gapCounts, channelCounts };
}
