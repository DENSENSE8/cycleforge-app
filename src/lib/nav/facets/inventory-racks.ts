/**
 * Inventory › Locations › Racks sidebar facet: the room each movable rack
 * stands in, counted over the same rows `/api/racks` lists (active RACK rows
 * under a placement, room DERIVED by walking up — `derived-room.ts`). The
 * value is the room's location id, the `?room=` the Racks desk filters by.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import type { FacetSqlRunner } from '@/lib/nav/facets/outbound';
import { derivedRoomJoinSql } from '@/lib/locations/derived-room';
import type { OrgId } from '@/lib/tenancy/constants';

type ParamReader = Pick<URLSearchParams, 'get'>;

const LABEL_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export async function inventoryRackFacets(
  orgId: OrgId,
  params: ParamReader,
  run: FacetSqlRunner,
): Promise<NavFacetsResponse> {
  // ONE trip: racks per derived room (NULL room = the chain reaches no ROOM).
  const rows = (await run(
    `
      SELECT room.id AS room_id, room.name AS room_name, COUNT(*)::int AS n
        FROM locations r
        JOIN locations p ON p.id = r.parent_id AND p.organization_id = r.organization_id
        ${derivedRoomJoinSql('r', 'room')}
       WHERE r.organization_id = $1
         AND r.location_kind = 'RACK'
         AND r.is_active = true
       GROUP BY 1, 2
    `,
    [orgId],
  )).map((row) => ({
    roomId: row.room_id == null ? null : String(Number(row.room_id)),
    roomName: row.room_name == null ? '' : String(row.room_name),
    n: Number(row.n) || 0,
  }));

  const selected = params.get('room')?.trim() || null;
  const room = NAV_FACET_GROUPS['inventory.racks'].find((group) => group.id === 'room')!;

  return {
    context: 'inventory.racks',
    total: rows
      .filter((row) => selected == null || row.roomId === selected)
      .reduce((sum, row) => sum + row.n, 0),
    groups: [
      {
        id: room.id,
        label: room.label,
        param: room.param,
        // A rack with no derived room has no room to pick (the list's own cut).
        options: rows
          .filter((row): row is typeof row & { roomId: string } => row.roomId != null)
          .map((row) => ({ value: row.roomId, label: row.roomName || `Room ${row.roomId}`, count: row.n }))
          .sort((left, right) => LABEL_COLLATOR.compare(left.label, right.label)),
      },
    ],
  };
}
