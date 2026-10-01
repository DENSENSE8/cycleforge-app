/** Inventory › Stock sidebar facets over physical warehouse locations. */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import type { FacetSqlRunner } from '@/lib/nav/facets/outbound';
import { locationStockRoomId } from '@/lib/inventory/location-stock-row';
import type { OrgId } from '@/lib/tenancy/constants';

type ParamReader = Pick<URLSearchParams, 'get'>;

interface LocationFacetRow {
  room: string | null;
  aisle: number | null;
  n: number;
}

const LABEL_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function commaValues(raw: string | null): string[] {
  return [...new Set((raw ?? '').split(',').map((value) => value.trim()).filter(Boolean))];
}

function parseAisles(raw: string | null): number[] {
  return [...new Set(
    commaValues(raw)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0),
  )];
}

export async function inventoryStockFacets(
  orgId: OrgId,
  params: ParamReader,
  run: FacetSqlRunner,
): Promise<NavFacetsResponse> {
  // ONE trip: per room × aisle, the IN-STOCK pair count (bin rows with stock
  // on them) — the room display's filter counts read as "pairs on the shelf",
  // not "barcodes that exist". Rooms and aisles with nothing in stock stay
  // listed at 0 so the filter never hides a real place to look.
  const rows = (await run(
    `
      SELECT
        NULLIF(TRIM(l.room), '') AS room,
        CASE
          WHEN l.row_label ~ '^[0-9]+-[0-9]+$' THEN split_part(l.row_label, '-', 1)::int
          ELSE NULL
        END AS aisle,
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
      GROUP BY 1, 2
      ORDER BY 1 NULLS LAST, 2 NULLS LAST
    `,
    [orgId],
  )).map((row): LocationFacetRow => ({
    room: row.room == null ? null : String(row.room),
    aisle: row.aisle == null ? null : Number(row.aisle),
    n: Number(row.n) || 0,
  }));

  const selectedRooms = new Set(commaValues(params.get('room')));
  const selectedAisles = new Set(parseAisles(params.get('aisle')));
  const roomId = (row: Pick<LocationFacetRow, 'room'>) => locationStockRoomId(row);
  const matchesRoom = (row: LocationFacetRow) => selectedRooms.size === 0 || selectedRooms.has(roomId(row));
  const matchesAisle = (row: LocationFacetRow) => selectedAisles.size === 0 || (row.aisle != null && selectedAisles.has(row.aisle));
  const declarations = NAV_FACET_GROUPS['inventory.stock'];
  const roomDeclaration = declarations.find((group) => group.id === 'room')!;
  const aisleDeclaration = declarations.find((group) => group.id === 'aisle')!;

  const roomLabels = new Map<string, string>();
  for (const row of rows) roomLabels.set(roomId(row), row.room ?? 'No room');
  const aisleValues = [...new Set(rows.map((row) => row.aisle).filter((value): value is number => value != null))]
    .sort((left, right) => left - right);

  return {
    context: 'inventory.stock',
    total: rows
      .filter((row) => matchesRoom(row) && matchesAisle(row))
      .reduce((sum, row) => sum + row.n, 0),
    groups: [
      {
        id: roomDeclaration.id,
        label: roomDeclaration.label,
        param: roomDeclaration.param,
        options: [...roomLabels]
          .map(([value, label]) => ({
            value,
            label,
            count: rows
              .filter((row) => roomId(row) === value && matchesAisle(row))
              .reduce((sum, row) => sum + row.n, 0),
          }))
          .sort((left, right) => LABEL_COLLATOR.compare(left.label, right.label)),
      },
      {
        id: aisleDeclaration.id,
        label: aisleDeclaration.label,
        param: aisleDeclaration.param,
        options: aisleValues.map((value) => ({
          value: String(value),
          label: `Aisle ${value}`,
          count: rows
            .filter((row) => row.aisle === value && matchesRoom(row))
            .reduce((sum, row) => sum + row.n, 0),
        })),
      },
    ],
  };
}
