/**
 * Exceptions hub — the ONE vocabulary every surface reads (owner 2026-09-28):
 * the global `/exceptions` desk and its phone twin `/m/exceptions`. Legacy
 * lane routes redirect to this hub; no other page paints an exception list.
 * Pure data — no React, no SQL.
 *
 * A row belongs to exactly ONE kind. Order SKU-mapping blockers (unpaired SKU,
 * no item number) are `pairs`, not `fbm`; `fbm` is every other held order.
 */

export const EXCEPTION_DOMAINS = ['fulfillment', 'inventory', 'receiving'] as const;
export type ExceptionDomain = (typeof EXCEPTION_DOMAINS)[number];

export const EXCEPTION_DOMAIN_LABEL: Readonly<Record<ExceptionDomain, string>> = {
  fulfillment: 'Fulfillment',
  inventory: 'Inventory',
  receiving: 'Receiving',
};

export const EXCEPTION_KINDS = [
  'fbm',
  'labels',
  'paperwork',
  'unmatched',
  'pairs',
  'bins',
  'tracking',
  'claim',
  'short',
  'unfound',
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export interface ExceptionKindSpec {
  domain: ExceptionDomain;
  /** Sidebar / chip label. Never equals its domain label (nav-name law). */
  label: string;
  /** What puts a row here — the membership rule, in one sentence. */
  membership: string;
}

export const EXCEPTION_KIND_SPEC: Readonly<Record<ExceptionKind, ExceptionKindSpec>> = {
  fbm: {
    domain: 'fulfillment',
    label: 'FBM',
    membership: 'A merchant-fulfilled order held by an order exception other than SKU mapping (address, buyer request, marketplace hold, testing, shipping, out of stock, other).',
  },
  labels: {
    domain: 'fulfillment',
    label: 'Labels & docs',
    membership: "The latest label ingestion for an order is quarantined or failed.",
  },
  paperwork: {
    domain: 'fulfillment',
    label: 'Paperwork',
    membership: 'An open (not scanned out) order fails release gate G2 Documents (no manual / document linked and not exempt) or G3 Shipping label (no label linked or bought).',
  },
  unmatched: {
    domain: 'fulfillment',
    label: 'Unmatched scans',
    membership: 'An open `orders_exceptions` pack or dock scan-out that matched no order (`sqlOpenUnmatchedScan`: status open, source station packer or outbound).',
  },
  pairs: {
    domain: 'inventory',
    label: 'Missing pairs',
    membership: 'A floor-minted placeholder SKU (`TMP-…`, on hold) not yet paired, or an open order whose SKU is unpaired / has no item number.',
  },
  bins: {
    domain: 'inventory',
    label: 'Bin errors',
    membership: 'An open inventory drift alert (counted vs expected at a location).',
  },
  tracking: {
    domain: 'inventory',
    label: 'Tracking',
    membership: 'An open row in `tracking_exceptions`.',
  },
  claim: {
    domain: 'receiving',
    label: 'Claim',
    membership: 'A received carton flagged for a carrier / supplier claim.',
  },
  short: {
    domain: 'receiving',
    label: 'Short',
    membership: 'A received carton whose PO lines arrived short.',
  },
  unfound: {
    domain: 'receiving',
    label: 'Unfound',
    membership: 'A carton that could not be matched to any PO.',
  },
};

export function exceptionKindsOf(domain: ExceptionDomain): ExceptionKind[] {
  return EXCEPTION_KINDS.filter((kind) => EXCEPTION_KIND_SPEC[kind].domain === domain);
}

export type ExceptionEntityType = 'order' | 'sku' | 'po' | 'carton' | 'label' | 'location' | 'tracking';

/** One exception, as every list and record paints it. */
export interface ExceptionRow {
  /** `${kind}:${sourceId}` — stable, URL-safe; the record param. */
  key: string;
  kind: ExceptionKind;
  domain: ExceptionDomain;
  /** Opaque id inside the source (order row id, alert id, carton id, …). */
  sourceId: string;
  /** The leftmost pill: WHY it is an exception ("Invalid address", "Missing manual"). */
  tag: { label: string; tone: 'danger' | 'warning' };
  /** The thing that is blocked — order number, SKU, PO, carton, bin. */
  entity: { type: ExceptionEntityType; id: string; label: string };
  /** Product / item title when there is one. */
  title: string | null;
  /** One line of evidence ("Expected 4 · counted 2 at A-3-2"). */
  detail: string | null;
  /**
   * The order behind an order-backed row (fbm · pairs · paperwork) — what the
   * Allocate card's line 1 paints beside the order number: its channel and its
   * notes (owner 2026-09-29). Null for every other entity.
   */
  order: { accountSource: string | null; buyerNote: string | null; staffNote: string | null } | null;
  /** The right-aligned direct resolution CTA ("Pair SKU", "Edit address", "Link manual"). */
  resolveVerb: string;
  /** When it became an exception (ISO), if the source knows. */
  raisedAt: string | null;
}

/** `GET /api/exceptions` query — every param optional. */
export interface ExceptionListParams {
  domain?: ExceptionDomain;
  kind?: ExceptionKind;
  /** Free-text over entity id / label / title / tag. */
  q?: string;
  limit?: number;
  cursor?: string;
}

/** `GET /api/exceptions` response. Counts cover only kinds the caller may see; a kind absent from `counts` is not visible to them. */
export interface ExceptionListResponse {
  rows: ExceptionRow[];
  counts: Partial<Record<ExceptionKind, number>>;
  nextCursor: string | null;
}

export function exceptionRowKey(kind: ExceptionKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

export function parseExceptionRowKey(key: string): { kind: ExceptionKind; sourceId: string } | null {
  const at = key.indexOf(':');
  if (at <= 0) return null;
  const kind = key.slice(0, at);
  const sourceId = key.slice(at + 1);
  if (!sourceId || !(EXCEPTION_KINDS as readonly string[]).includes(kind)) return null;
  return { kind: kind as ExceptionKind, sourceId };
}

export function parseExceptionDomain(raw: string | null | undefined): ExceptionDomain | null {
  return raw && (EXCEPTION_DOMAINS as readonly string[]).includes(raw) ? (raw as ExceptionDomain) : null;
}

export function parseExceptionKind(raw: string | null | undefined): ExceptionKind | null {
  return raw && (EXCEPTION_KINDS as readonly string[]).includes(raw) ? (raw as ExceptionKind) : null;
}

/** URL params the hub owns (desk and phone). */
export const EXCEPTIONS_PATH = '/exceptions';
export const MOBILE_EXCEPTIONS_PATH = '/m/exceptions';
export const EXCEPTION_DOMAIN_PARAM = 'domain';
export const EXCEPTION_KIND_PARAM = 'kind';
export const EXCEPTION_RECORD_PARAM = 'record';
