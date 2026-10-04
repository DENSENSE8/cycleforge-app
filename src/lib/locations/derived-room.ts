/**
 * The room a location stands in — DERIVED, never copied.
 *
 * A rack moves between rooms; its shelves point at the rack, the rack points
 * at its placement (a ROOM or a STAGING spot inside one). The room is the
 * nearest `location_kind = 'ROOM'` walking up `parent_id`, starting at the row
 * itself (a ROOM's room is itself). The legacy `locations.room` text column is
 * NOT read: it goes stale the moment a rack moves.
 *
 * Org-scoped at every hop; depth-capped so a corrupted cycle cannot spin.
 */

/** Hard stop for the parent walk (Room → Staging → Rack → Shelf → Position is 5). */
export const DERIVED_ROOM_MAX_DEPTH = 16;

/**
 * A `LEFT JOIN LATERAL … ON true` clause exposing `<as>.id`, `<as>.name`,
 * `<as>.barcode`, `<as>.label` — the nearest ROOM at or above `<locAlias>`.
 * Columns are NULL when the chain reaches no ROOM.
 *
 * `<as>.label` is the room's own key: the ROOM row's `room` text (how the
 * room has always been addressed, e.g. `?room=Zone 1 - New`), else its name.
 * Only the ROOM row's own column is read — never a copy on a child.
 *
 * `locAlias` and `as` are SQL identifiers chosen by the caller (never user
 * input).
 */
export function derivedRoomJoinSql(locAlias: string, as = 'room'): string {
  assertIdent(locAlias);
  assertIdent(as);
  return `LEFT JOIN LATERAL (
    WITH RECURSIVE up AS (
      SELECT p.id, p.parent_id, p.location_kind, p.name, p.barcode, p.room, 0 AS depth
        FROM locations p
       WHERE p.id = ${locAlias}.id AND p.organization_id = ${locAlias}.organization_id
      UNION ALL
      SELECT p.id, p.parent_id, p.location_kind, p.name, p.barcode, p.room, up.depth + 1
        FROM up
        JOIN locations p
          ON p.id = up.parent_id AND p.organization_id = ${locAlias}.organization_id
       WHERE up.location_kind <> 'ROOM' AND up.depth < ${DERIVED_ROOM_MAX_DEPTH}
    )
    SELECT up.id, up.name, up.barcode,
           COALESCE(NULLIF(BTRIM(up.room), ''), BTRIM(up.name)) AS label
      FROM up
     WHERE up.location_kind = 'ROOM'
     ORDER BY up.depth
     LIMIT 1
  ) ${as} ON true`;
}

/**
 * The set form of {@link derivedRoomJoinSql}, for readers that scan many
 * locations (pickers, walks, ledgers, facets, reports): ONE recursive pass
 * down from every ROOM instead of one walk up per row. A
 * `LEFT JOIN (…) <as> ON <as>.id = <locAlias>.id` exposing `<as>.room_id`
 * and `<as>.label` (same label as the lateral form; NULL when no ROOM is
 * reached). Each hop stays in the parent's organization; the descent stops
 * at a nested ROOM (that ROOM roots its own subtree), so every location gets
 * its NEAREST room. `orgParam` (`$1`) scopes the roots to one tenant; omit it
 * only for an unscoped legacy read.
 */
export function derivedRoomSetJoinSql(locAlias: string, as: string, orgParam?: string): string {
  assertIdent(locAlias);
  assertIdent(as);
  if (orgParam !== undefined && !/^\$\d+$/.test(orgParam)) {
    throw new Error(`derivedRoomSetJoinSql: bad org param ${orgParam}`);
  }
  const rootOrg = orgParam ? ` AND r.organization_id = ${orgParam}` : '';
  return `LEFT JOIN (
    WITH RECURSIVE down AS (
      SELECT r.id, r.organization_id, r.id AS room_id,
             COALESCE(NULLIF(BTRIM(r.room), ''), BTRIM(r.name)) AS label, 0 AS depth
        FROM locations r
       WHERE r.location_kind = 'ROOM'${rootOrg}
      UNION ALL
      SELECT c.id, c.organization_id, down.room_id, down.label, down.depth + 1
        FROM down
        JOIN locations c
          ON c.parent_id = down.id AND c.organization_id = down.organization_id
       WHERE c.location_kind <> 'ROOM' AND down.depth < ${DERIVED_ROOM_MAX_DEPTH}
    )
    SELECT id, room_id, label FROM down
  ) ${as} ON ${as}.id = ${locAlias}.id`;
}

/**
 * The room label of `<locAlias>` as a SQL expression, for readers that group,
 * filter or display by room text: the derived room's label (joined as `<as>`
 * by {@link derivedRoomSetJoinSql} or {@link derivedRoomJoinSql}), falling
 * back to the row's legacy `room` text ONLY when the chain reaches no ROOM
 * (pre-hierarchy bins with no `parent_id`). Rack-family rows always reach a
 * ROOM, so a moved rack's shelves report the room the rack stands in now.
 */
export function derivedRoomLabelSql(locAlias: string, as = 'room'): string {
  assertIdent(locAlias);
  assertIdent(as);
  return `COALESCE(${as}.label, NULLIF(BTRIM(${locAlias}.room), ''))`;
}

/**
 * ORDER BY keys walking rack-family rows physically within a room: rack, then
 * shelf, then position, numerically (`RK2` before `RK12`; a rack's own row
 * before its shelves, a shelf before its positions). Every key is NULL for a
 * non-`RK` barcode, so placed right after a room key it leaves the legacy bin
 * order untouched. `barcodeCol` is a caller-chosen column (`l.barcode`).
 */
export function rackWalkOrderSql(barcodeCol: string): string {
  if (!/^([a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*$/i.test(barcodeCol)) {
    throw new Error(`rackWalkOrderSql: bad column ${barcodeCol}`);
  }
  return [
    `substring(${barcodeCol} from '^RK([0-9]+)(?:-|$)')::int NULLS FIRST`,
    `substring(${barcodeCol} from '^RK[0-9]+-([0-9]+)(?:-|$)')::int NULLS FIRST`,
    `substring(${barcodeCol} from '^RK[0-9]+-[0-9]+-([0-9]+)$')::int NULLS FIRST`,
  ].join(', ');
}

/** One location's derived room: `$1` = organization_id, `$2` = location id. */
export const DERIVED_ROOM_BY_ID_SQL = `SELECT room.id, room.name, room.barcode
  FROM locations l
  ${derivedRoomJoinSql('l', 'room')}
 WHERE l.organization_id = $1 AND l.id = $2
 LIMIT 1`;

function assertIdent(s: string): void {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error(`derivedRoomJoinSql: bad identifier ${s}`);
}
