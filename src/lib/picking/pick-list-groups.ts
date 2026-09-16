/**
 * Pick list shapes and the pure row → group fold.
 *
 * Kept in its own leaf module (same split as `pick-queue-scope.ts` vs
 * `queue.ts`): `pick-list.ts` pulls in the tenant pool, which drags
 * `server-only` along and cannot be loaded by `node:test`. Scope semantics and
 * group ordering are the parts worth testing, so they live where a test can
 * reach them without a database.
 */

export type PickListScope = 'mine' | 'all' | 'unpaired';

/** One allocation to walk: a serial unit at a location, promised to an order line. */
export interface PickListRow {
  /** bigint — serialised as a string so large ids survive JSON. */
  allocationId: string;
  orderId: number;
  orderNumber: string;
  sku: string | null;
  productTitle: string | null;
  serialUnitId: number;
  serialNumber: string;
  grade: string | null;
  location: string | null;
  /** The location's flat BARCODE — the exact code its bin-label DataMatrix encodes. */
  locationBarcode: string | null;
  /** Deadline pressure per row (work-assignment LATERAL) — ISO string or null. */
  deadlineAt: string | null;
  /* Card facts (operator 2026-09-15): the phone pick row renders the shared
   * ItemCardRow, so the wire row carries the same values that card paints. */
  imageUrl: string | null;
  itemNumber: string | null;
  saleAmount: string | null;
  currency: string | null;
  qty: number | null;
  ownerStaffId: number | null;
}

export interface PickListGroup {
  /** null = the UNPAIRED bucket: sku has no owning picker, anyone may claim it. */
  staffId: number | null;
  staffName: string | null;
  rows: PickListRow[];
}

/**
 * Why an order line has no unit to walk to — and therefore what would fix it.
 *
 * Derived from the allocator's own demand and supply expressions
 * (src/lib/allocation/auto-allocate.ts), so the phone can never contradict it:
 *
 * - `no_catalog_link` — the line names no catalog SKU at all. `orders.sku` is
 *   blank or unresolvable and `sku_catalog_id` is NULL, so the external item
 *   number the channel sent never became product identity. Allocation cannot
 *   even look for stock. This is the import blocker, seen from the floor.
 * - `ready_to_allocate` — the line names a SKU and matching supply is on a
 *   pickable shelf right now. Nothing is wrong except that nobody has run the
 *   allocator; the band's sweep fills it. This is the only blocker a button
 *   can clear, which is why it is worth distinguishing.
 * - `no_stock` — the line names a SKU and no stocked, binned, uncommitted unit
 *   exists for it. Real shortfall; no button helps.
 */
export type PickListBlocker = 'no_catalog_link' | 'ready_to_allocate' | 'no_stock';

/**
 * An order line with no live allocation — the pick list's OTHER half.
 *
 * Until 2026-09-15 these lines existed only as `counts.unallocated`, one
 * number in one sentence, so 70 of org 1's 73 open lines were invisible on
 * `/m/pick` (measured: 3 allocations, 70 unallocated). A picker could not see
 * which order was short, why, or that the list they were holding was 4% of the
 * day's demand. Operator 2026-09-15: the pick list must load FROM THE ORDERS.
 *
 * Order-grained, unlike {@link PickListRow}: there is no unit, so there is
 * nothing line-grained to point at. `blocker` is what makes the row worth a
 * line instead of a tally.
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

export interface PickListResult {
  scope: PickListScope;
  staffId: number | null;
  counts: { mine: number; all: number; unpaired: number; unallocated: number };
  groups: PickListGroup[];
  /**
   * The unallocated lines themselves, newest deadline pressure first. Capped
   * by the query's own valve; `counts.unallocated` stays exact, so a truncated
   * band is still an honest number.
   */
  shortfall: PickListShortfallRow[];
}

/**
 * A DB row: the wire row plus the owner's display name. The name belongs on the
 * group header, not on every row, so it is dropped during folding rather than
 * widening the public row shape.
 */
export interface PickListSourceRow extends PickListRow {
  ownerStaffName: string | null;
}

const SCOPES: readonly PickListScope[] = ['mine', 'all', 'unpaired'];

export function parsePickListScope(raw: string | null | undefined): PickListScope {
  const candidate = (raw ?? '').trim().toLowerCase();
  return SCOPES.find((s) => s === candidate) ?? 'mine';
}

function matchesScope(row: PickListSourceRow, scope: PickListScope, staffId: number | null): boolean {
  if (scope === 'all') return true;
  if (scope === 'unpaired') return row.ownerStaffId == null;
  return staffId != null && row.ownerStaffId === staffId;
}

/**
 * Fold location-ordered rows into owner groups.
 *
 * Group order is first-appearance in the incoming (location-ordered) row
 * sequence, so the first group is the one whose rack the picker reaches first.
 * The UNPAIRED bucket is always last: it is claimable work, not an assignment,
 * so it must not push a picker's own list below the fold.
 */
export function selectPickListGroups(
  rows: readonly PickListSourceRow[],
  opts: { scope: PickListScope; staffId: number | null },
): PickListGroup[] {
  const owned = new Map<number, PickListGroup>();
  const unpaired: PickListGroup = { staffId: null, staffName: null, rows: [] };

  for (const row of rows) {
    if (!matchesScope(row, opts.scope, opts.staffId)) continue;

    const wireRow: PickListRow = {
      allocationId: row.allocationId,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      sku: row.sku,
      productTitle: row.productTitle,
      serialUnitId: row.serialUnitId,
      serialNumber: row.serialNumber,
      grade: row.grade,
      location: row.location,
      locationBarcode: row.locationBarcode,
      deadlineAt: row.deadlineAt,
      imageUrl: row.imageUrl,
      itemNumber: row.itemNumber,
      saleAmount: row.saleAmount,
      currency: row.currency,
      qty: row.qty,
      ownerStaffId: row.ownerStaffId,
    };

    if (row.ownerStaffId == null) {
      unpaired.rows.push(wireRow);
      continue;
    }
    const existing = owned.get(row.ownerStaffId);
    if (existing) {
      existing.rows.push(wireRow);
    } else {
      owned.set(row.ownerStaffId, {
        staffId: row.ownerStaffId,
        staffName: row.ownerStaffName,
        rows: [wireRow],
      });
    }
  }

  const groups = [...owned.values()];
  if (unpaired.rows.length > 0) groups.push(unpaired);
  return groups;
}
