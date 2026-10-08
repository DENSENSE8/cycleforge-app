/** Inventory › Stock sidebar facets over physical warehouse locations. */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import type { FacetSqlRunner } from '@/lib/nav/facets/outbound';
import {
  locationStockInAddress,
  locationStockRoomId,
  parseLocationStockAddressScope,
  type LocationStockAddressScope,
} from '@/lib/inventory/location-stock-row';
import { getStockByLocation, type StockScopeCounts } from '@/lib/neon/location-stock-queries';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * The list's OWN scope counts (`getStockByLocation` → `counts`, room/address/q
 * scoped). Its FILTERs mirror the client health cut `stockHealth` in
 * StockLedger.tsx: in-stock qty > 0, low min_qty set and qty ≤ min_qty, out
 * qty ≤ 0 on a non-empty pair, on-hold provisional (TMP).
 */
export type StockScopeCountReader = (args: {
  orgId: OrgId;
  room: string | null;
  aisle: string | null;
  bay: string | null;
  level: string | null;
  position: string | null;
  query: string | null;
}) => Promise<StockScopeCounts>;

const readStockScopeCounts: StockScopeCountReader = async (args) =>
  (await getStockByLocation({ ...args, limit: 1 })).counts;

type ParamReader = Pick<URLSearchParams, 'get'>;

/** One address's in-stock pair count. Parts are null off the room-coded grid. */
interface LocationFacetRow {
  room: string | null;
  aisle: number | null;
  bay: number | null;
  level: number | null;
  position: number | null;
  n: number;
}

const LABEL_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

type AddressPart = keyof LocationStockAddressScope;

interface StockFacetOption {
  value: string;
  label: string;
  count: number;
}

/** One drill step's options: the part's values under the picked parents, counted, in number order. */
function partOptions(rows: readonly LocationFacetRow[], part: AddressPart, label: string): StockFacetOption[] {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const value = row[part];
    if (value == null) continue;
    counts.set(value, (counts.get(value) ?? 0) + row.n);
  }
  return [...counts]
    .sort(([left], [right]) => left - right)
    .map(([value, count]) => ({
      value: String(value),
      // Position 00 is the level's own label (the rack-level sentinel, `…-1-00`), not a slot.
      label: part === 'position' && value === 0 ? 'Whole level' : `${label} ${value}`,
      count,
    }));
}

export async function inventoryStockFacets(
  orgId: OrgId,
  params: ParamReader,
  run: FacetSqlRunner,
  scopeCounts: StockScopeCountReader = readStockScopeCounts,
): Promise<NavFacetsResponse> {
  // ONE trip: per address, the IN-STOCK pair count (bin rows with stock on
  // them) — the filter counts read as "pairs on the shelf", not "barcodes
  // that exist". Places with nothing in stock stay listed at 0 so the filter
  // never hides a real place to look.
  const [rawRows, counts] = await Promise.all([run(
    `
      SELECT
        NULLIF(TRIM(l.room), '') AS room,
        CASE WHEN l.row_label ~ '^[0-9]+-[0-9]+$' THEN split_part(l.row_label, '-', 1)::int END AS aisle,
        CASE WHEN l.row_label ~ '^[0-9]+-[0-9]+$' THEN split_part(l.row_label, '-', 2)::int END AS bay,
        CASE WHEN l.col_label ~ '^[0-9]+-[0-9]+$' THEN split_part(l.col_label, '-', 1)::int END AS level,
        CASE WHEN l.col_label ~ '^[0-9]+-[0-9]+$' THEN split_part(l.col_label, '-', 2)::int END AS position,
        COUNT(bc.location_id)::int AS n
      FROM locations l
      LEFT JOIN LATERAL (
        SELECT bc.location_id
          FROM bin_contents bc
         WHERE bc.organization_id = $1
           AND bc.location_id = l.id
           AND bc.qty <> 0
      ) bc ON true
      WHERE l.organization_id = $1
        AND l.is_active = true
        AND NULLIF(TRIM(l.barcode), '') IS NOT NULL
      GROUP BY 1, 2, 3, 4, 5
    `,
    [orgId],
  ), scopeCounts({
    orgId,
    room: params.get('room'),
    aisle: params.get('aisle'),
    bay: params.get('bay'),
    level: params.get('level'),
    position: params.get('position'),
    query: params.get('q'),
  })]);
  const rows = rawRows.map((row): LocationFacetRow => ({
    room: row.room == null ? null : String(row.room),
    aisle: row.aisle == null ? null : Number(row.aisle),
    bay: row.bay == null ? null : Number(row.bay),
    level: row.level == null ? null : Number(row.level),
    position: row.position == null ? null : Number(row.position),
    n: Number(row.n) || 0,
  }));

  // Room is single-pick; its wire id is `locationStockRoomId` (comma-safe).
  const pickedRoom = params.get('room')?.trim() || null;
  const address = parseLocationStockAddressScope(pickedRoom != null, {
    aisle: params.get('aisle'),
    bay: params.get('bay'),
    level: params.get('level'),
    position: params.get('position'),
  });
  const inRoom = rows.filter((row) => locationStockRoomId(row) === pickedRoom);
  // Each step lists the values under every picked parent; a step whose
  // parent is unpicked answers no options (the sidebar hides it).
  const under = (scope: Partial<LocationStockAddressScope>) =>
    inRoom.filter((row) => locationStockInAddress(row, { aisle: null, bay: null, level: null, position: null, ...scope }));
  const group = (id: string) => NAV_FACET_GROUPS['stock.all'].find((declared) => declared.id === id)!;
  const step = (id: AddressPart, options: StockFacetOption[]) => {
    const declared = group(id);
    return { id: declared.id, label: declared.label, param: declared.param, options };
  };

  const roomLabels = new Map<string, string>();
  for (const row of rows) roomLabels.set(locationStockRoomId(row), row.room ?? 'No room');
  const health = group('health');
  const room = group('room');

  return {
    context: 'stock.all',
    total: (pickedRoom != null ? inRoom.filter((row) => locationStockInAddress(row, address)) : rows)
      .reduce((sum, row) => sum + row.n, 0),
    groups: [
      {
        id: health.id,
        label: health.label,
        param: health.param,
        options: [
          { value: 'in-stock', label: 'In stock', count: counts.inStockPairs },
          { value: 'low-stock', label: 'Low stock', count: counts.lowStockPairs },
          { value: 'out-of-stock', label: 'Out of stock', count: counts.outPairs },
          { value: 'on-hold', label: 'On hold', count: counts.onHoldPairs },
        ],
      },
      {
        id: room.id,
        label: room.label,
        param: room.param,
        // A room counts all of itself: its own address picks never shrink it.
        options: [...roomLabels]
          .map(([value, label]) => ({
            value,
            label,
            count: rows
              .filter((row) => locationStockRoomId(row) === value)
              .reduce((sum, row) => sum + row.n, 0),
          }))
          .sort((left, right) => LABEL_COLLATOR.compare(left.label, right.label)),
      },
      step('aisle', pickedRoom != null ? partOptions(under({}), 'aisle', group('aisle').label) : []),
      step('bay', address.aisle != null ? partOptions(under({ aisle: address.aisle }), 'bay', group('bay').label) : []),
      step('level', address.bay != null
        ? partOptions(under({ aisle: address.aisle, bay: address.bay }), 'level', group('level').label)
        : []),
      step('position', address.level != null
        ? partOptions(under({ aisle: address.aisle, bay: address.bay, level: address.level }), 'position', group('position').label)
        : []),
    ],
  };
}
