/**
 * Client shape of `GET /api/picking/list` — the line-grained, location-directed
 * pick list that replaced `/m/pick`'s old read of the SHIPPING feed.
 *
 * The old queue rendered `/api/orders?excludePacked=true`, which is
 * label-scoped and order-grained: an order with no label was invisible and a
 * two-line order was one row. This payload is one row per live
 * `order_unit_allocations` record, so the picker sees the UNIT and its shelf.
 *
 * Narrowing lives here, away from the hook and the screen, because the phone
 * queue's worst failure mode is a silent blank page: an allocation missing its
 * serial or its allocation id cannot be pointed at a shelf or routed to a
 * session, so it is dropped rather than painted as a row of dashes. Everything
 * else degrades to an honest absence the row can label.
 */

export const PICK_LIST_SCOPES = ['mine', 'all', 'unpaired'] as const;

export type PickListScope = (typeof PICK_LIST_SCOPES)[number];

export interface PickListRow {
  /** bigint, serialised as a string by the API — never coerce it to a number. */
  allocationId: string;
  orderId: number;
  orderNumber: string;
  sku: string | null;
  productTitle: string | null;
  serialUnitId: number;
  serialNumber: string;
  grade: string | null;
  location: string | null;
  /** The location's flat barcode — the exact code its bin-label DataMatrix encodes. */
  locationBarcode: string | null;
  /* Card facts (operator 2026-09-15): the pick row paints the SAME
   * ItemCardRow as the to-ship row, so the payload carries the same values
   * that card needs. Raw, not pre-formatted — the row adapter formats the
   * price with the same formatter the to-ship card uses, so the two screens
   * can never disagree. Absent values degrade honestly: no photo shows the
   * package placeholder, absent price simply doesn't paint. */
  imageUrl: string | null;
  itemNumber: string | null;
  saleAmount: string | null;
  currency: string | null;
  /** Plain expected count, or null. */
  qty: number | null;
  /** ISO ship-by instant, or null when the order has no deadline row. */
  deadlineAt: string | null;
  /** Owning picker staff id; null is the unpaired bucket. */
  ownerStaffId: number | null;
}

export interface PickListGroup {
  /** `null` is the UNPAIRED bucket — an item number no picker owns yet. */
  staffId: number | null;
  staffName: string | null;
  rows: PickListRow[];
}

/**
 * Why a line is not pickable. Mirrors `PickListBlocker` on the server; the
 * screen turns it into the one sentence a picker can act on.
 */
export const PICK_LIST_BLOCKERS = ['no_catalog_link', 'ready_to_allocate', 'no_stock'] as const;

export type PickListBlocker = (typeof PICK_LIST_BLOCKERS)[number];

/**
 * An order line with no unit allocated — the half of the pick list that used
 * to be a single sentence.
 *
 * Order-grained, so there is no allocation id and no serial: the identity that
 * must survive narrowing is the ORDER. A row missing it is dropped, exactly as
 * an allocation row missing its serial is.
 */
export interface PickListShortfallRow {
  orderId: number;
  orderNumber: string;
  sku: string | null;
  productTitle: string | null;
  itemNumber: string | null;
  imageUrl: string | null;
  saleAmount: string | null;
  currency: string | null;
  qty: number | null;
  deadlineAt: string | null;
  blocker: PickListBlocker;
}

export interface PickListCounts {
  mine: number;
  all: number;
  unpaired: number;
  /** Orders with no live allocation — the shortfall the screen must announce. */
  unallocated: number;
}

export interface PickList {
  scope: PickListScope;
  staffId: number | null;
  counts: PickListCounts;
  groups: PickListGroup[];
  shortfall: PickListShortfallRow[];
}

const ZERO_COUNTS: PickListCounts = { mine: 0, all: 0, unpaired: 0, unallocated: 0 };

export function parsePickListScope(raw: string | null | undefined): PickListScope {
  const candidate = String(raw ?? '').trim().toLowerCase();
  return PICK_LIST_SCOPES.find((scope) => scope === candidate) ?? 'mine';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Identity fields: a blank one means the row cannot be trusted, not "empty". */
function asRequiredId(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStaffId(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function normalizeRow(value: unknown): PickListRow | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const allocationId = asText(raw.allocationId);
  const orderId = asRequiredId(raw.orderId);
  const serialUnitId = asRequiredId(raw.serialUnitId);
  const serialNumber = asText(raw.serialNumber);
  if (!allocationId || orderId === null || serialUnitId === null || !serialNumber) return null;
  return {
    allocationId,
    orderId,
    orderNumber: asText(raw.orderNumber) ?? String(orderId),
    sku: asText(raw.sku),
    productTitle: asText(raw.productTitle),
    serialUnitId,
    serialNumber,
    grade: asText(raw.grade),
    location: asText(raw.location),
    locationBarcode: asText(raw.locationBarcode),
    deadlineAt: asText(raw.deadlineAt),
    ownerStaffId: asStaffId(raw.ownerStaffId),
    imageUrl: asText(raw.imageUrl),
    itemNumber: asText(raw.itemNumber),
    saleAmount: asText(raw.saleAmount),
    currency: asText(raw.currency),
    qty: asCount(raw.qty) || null,
  };
}

function normalizeGroup(value: unknown): PickListGroup | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const rows = Array.isArray(raw.rows)
    ? raw.rows.map(normalizeRow).filter((row): row is PickListRow => row !== null)
    : [];
  if (rows.length === 0) return null;
  return { staffId: asStaffId(raw.staffId), staffName: asText(raw.staffName), rows };
}

function normalizeBlocker(value: unknown): PickListBlocker {
  const candidate = String(value ?? '').trim();
  // Unknown → `no_stock`: the answer that promises the operator nothing, so a
  // future server blocker this build has never heard of cannot offer a sweep
  // that would not help.
  return PICK_LIST_BLOCKERS.find((blocker) => blocker === candidate) ?? 'no_stock';
}

function normalizeShortfallRow(value: unknown): PickListShortfallRow | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const orderId = asRequiredId(raw.orderId);
  if (orderId === null) return null;
  return {
    orderId,
    orderNumber: asText(raw.orderNumber) ?? String(orderId),
    sku: asText(raw.sku),
    productTitle: asText(raw.productTitle),
    itemNumber: asText(raw.itemNumber),
    imageUrl: asText(raw.imageUrl),
    saleAmount: asText(raw.saleAmount),
    currency: asText(raw.currency),
    qty: asCount(raw.qty) || null,
    deadlineAt: asText(raw.deadlineAt),
    blocker: normalizeBlocker(raw.blocker),
  };
}

export function normalizePickListPayload(payload: unknown, requestedScope: PickListScope): PickList {
  const raw = asRecord(payload);
  const counts = asRecord(raw?.counts);
  const groups = Array.isArray(raw?.groups)
    ? raw.groups.map(normalizeGroup).filter((group): group is PickListGroup => group !== null)
    : [];
  return {
    scope: parsePickListScope(typeof raw?.scope === 'string' ? raw.scope : requestedScope),
    staffId: asStaffId(raw?.staffId),
    counts: counts
      ? {
          mine: asCount(counts.mine),
          all: asCount(counts.all),
          unpaired: asCount(counts.unpaired),
          unallocated: asCount(counts.unallocated),
        }
      : ZERO_COUNTS,
    // UNPAIRED is work nobody owns, so it reads last: a picker scans for their
    // own name first and only then looks for something to claim.
    groups: [
      ...groups.filter((group) => group.staffId !== null),
      ...groups.filter((group) => group.staffId === null),
    ],
    shortfall: Array.isArray(raw?.shortfall)
      ? raw.shortfall
          .map(normalizeShortfallRow)
          .filter((row): row is PickListShortfallRow => row !== null)
      : [],
  };
}
