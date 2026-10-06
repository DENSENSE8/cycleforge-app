import pool from '../db';
import { tenantQuery, tenantQueryOneTrip, withTenantTransaction } from '../tenancy/db';
import type { OrgId } from '../tenancy/constants';
import { derivedRoomLabelSql, derivedRoomSetJoinSql, rackWalkOrderSql } from '../locations/derived-room';
import { writeLedgerDelta } from '../inventory/write-ledger-delta';
import { publishStockLedgerEvent } from '../realtime/publish';
import {
  locationCode,
  locationCodeFlat,
  noPad,
  pad2,
  type LocationSegments,
} from '../barcode-routing';
import {
  hasLocationDeleteScope,
  locationDeleteFace,
  locationHierarchy,
  locationMatchesDeleteScope,
  type LocationDeleteScope,
} from '../inventory/location-deletion';
import { nextAvailableRoomZoneLetter } from '../inventory/room-zone-letter';

/** Tenancy migration note ────────────────────── Every exported query here takes an OPTIONAL `orgId`. */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Location {
  id: number;
  name: string;
  /** Operator nickname (2026-08-10d); null = read {@link name}. Not unique. */
  display_name?: string | null;
  room: string | null;
  description: string | null;
  barcode: string | null;
  is_active: boolean;
  sort_order: number;
  row_label: string | null;
  col_label: string | null;
  bin_type: string | null;
  capacity: number | null;
  parent_id: number | null;
  /** A-Z, set on parent rows only. Drives the printed label and GS1 QR. */
  zone_letter: string | null;
  /** Typed hierarchy — ROOM / RACK / SHELF / POSITION / BIN / … Selected by the list reads. */
  location_kind?: string | null;
}

export interface LocationDeleteTarget {
  id: number;
  barcode: string | null;
  name: string;
  room: string | null;
  rowLabel: string | null;
  colLabel: string | null;
  face: string;
  zone: string | null;
  aisle: number | null;
  bay: number | null;
  level: number | null;
  position: number | null;
  quantity: number;
  skuCount: number;
  handlingUnitCount: number;
  orderPlacementCount: number;
  unitPlacementCount: number;
  lockedForCount: boolean;
  deletable: boolean;
  blockedReasons: string[];
}

interface BinContent {
  id: number;
  /** Joined `sku_stock.id`, used by the shared SKU_STOCK photo contract. */
  stock_id?: number | null;
  location_id: number;
  sku: string;
  qty: number;
  min_qty: number | null;
  max_qty: number | null;
  last_counted: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  location_name?: string;
  room?: string;
  row_label?: string;
  col_label?: string;
  barcode?: string;
  product_title?: string;
  is_provisional?: boolean;
  display_name_override?: string | null;
  cover_photo_id?: number | null;
  /** SKU_STOCK photo ids in display order; `[0]` is the cover. */
  photo_ids?: number[];
  catalog_image_url?: string | null;
}

interface LocationTransfer {
  id: number;
  entity_type: string;
  entity_id: number;
  sku: string;
  from_location: string | null;
  to_location: string;
  staff_id: number | null;
  notes: string | null;
  created_at: string;
}

// ─── Locations CRUD ─────────────────────────────────────────────────────────

export async function getActiveLocations(orgId?: OrgId): Promise<Location[]> {
  const sql = `SELECT id, name, room, description, barcode, is_active, sort_order,
            row_label, col_label, bin_type, capacity, parent_id, zone_letter, location_kind
     FROM locations
     WHERE is_active = true${orgId ? ' AND organization_id = $1' : ''}
     ORDER BY room, sort_order, row_label, col_label, name`;
  const result = orgId
    ? await tenantQuery<Location>(orgId, sql, [orgId])
    : await pool.query<Location>(sql);
  return result.rows;
}

/** Get only room-level parents (no row/col) for the room picker. Rack-family rows (no row/col either) are never rooms. */
export async function getRooms(orgId?: OrgId): Promise<Location[]> {
  const sql = `SELECT id, name, room, description, barcode, is_active, sort_order,
            row_label, col_label, bin_type, capacity, parent_id, zone_letter
     FROM locations
     WHERE is_active = true AND row_label IS NULL AND col_label IS NULL
       AND location_kind NOT IN ('RACK', 'SHELF', 'POSITION')${orgId ? ' AND organization_id = $1' : ''}
     ORDER BY sort_order, name`;
  const result = orgId
    ? await tenantQuery<Location>(orgId, sql, [orgId])
    : await pool.query<Location>(sql);
  return result.rows;
}

/**
 * Give every active room parent a stable A–Z zone letter. This is the repair
 * path for legacy rooms and the default for newly created rooms. One advisory
 * lock per organization makes two simultaneous label screens deterministic.
 */
export async function ensureRoomZoneLetters(
  orgId: OrgId,
): Promise<{ zoneMap: Record<string, string>; unassigned: string[] }> {
  return withTenantTransaction(orgId, async (client) => {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext('room-zone-letter'))`,
      [String(orgId)],
    );
    const result = await client.query<Location>(
      `SELECT id, name, room, description, barcode, is_active, sort_order,
              row_label, col_label, bin_type, capacity, parent_id, zone_letter
         FROM locations
        WHERE organization_id = $1
          AND is_active = true
          AND row_label IS NULL
          AND col_label IS NULL
          AND location_kind NOT IN ('RACK', 'SHELF', 'POSITION')
        ORDER BY sort_order, id
        FOR UPDATE`,
      [orgId],
    );

    const used = new Set(result.rows.map((row) => row.zone_letter).filter((letter): letter is string => !!letter));
    const zoneMap: Record<string, string> = {};
    const unassigned: string[] = [];

    for (const row of result.rows) {
      const room = (row.room || row.name).trim();
      if (!room || zoneMap[room]) continue;
      let letter = row.zone_letter?.trim().toUpperCase() || null;
      if (!letter) {
        letter = nextAvailableRoomZoneLetter(used);
        if (!letter) {
          unassigned.push(room);
          continue;
        }
        await client.query(
          `UPDATE locations
              SET zone_letter = $2, updated_at = NOW()
            WHERE id = $1 AND organization_id = $3`,
          [row.id, letter, orgId],
        );
        used.add(letter);
      }
      zoneMap[room] = letter;
    }

    return { zoneMap, unassigned };
  });
}

/** Upsert the zone-letter for a room. */
export async function setRoomZoneLetter(
  roomName: string,
  letter: string | null,
  orgId?: OrgId,
): Promise<{ ok: true } | { ok: false; reason: 'duplicate' | 'not_found' }> {
  const name = roomName.trim();
  if (!name) return { ok: false, reason: 'not_found' };
  const normalised = letter ? letter.trim().toUpperCase().charAt(0) : null;
  if (normalised !== null && !/^[A-Z]$/.test(normalised)) {
    return { ok: false, reason: 'duplicate' }; // bad letter; surface as 4xx
  }

  // Org-scoped UPDATE clauses: when orgId is provided we add an
  // `organization_id = $n` predicate so we never touch another tenant's rooms.
  const clearSql = `UPDATE locations
         SET zone_letter = NULL, updated_at = NOW()
       WHERE row_label IS NULL
         AND col_label IS NULL
         AND is_active = true
         AND (room = $1 OR name = $1)
         AND zone_letter IS NOT NULL${orgId ? ' AND organization_id = $2' : ''}`;
  const clearParams = orgId ? [name, orgId] : [name];

  const setSql = `UPDATE locations
          SET zone_letter = $2, updated_at = NOW()
        WHERE id = (
          SELECT id FROM locations
           WHERE row_label IS NULL
             AND col_label IS NULL
             AND is_active = true
             AND (room = $1 OR name = $1)${orgId ? ' AND organization_id = $3' : ''}
           ORDER BY sort_order, id
           LIMIT 1
        )${orgId ? ' AND organization_id = $3' : ''}
        RETURNING id`;
  const setParams = orgId ? [name, normalised, orgId] : [name, normalised];

  if (orgId) {
    try {
      return await withTenantTransaction(orgId, async (client) => {
        // Step 1 — clear letter on every parent row for this room.
        await client.query(clearSql, clearParams);
        // Step 2 — clearing only? done.
        if (normalised === null) {
          return { ok: true } as const;
        }
        const result = await client.query(setSql, setParams);
        if ((result.rowCount ?? 0) === 0) {
          // Throw to roll back the transaction, then surface not_found.
          throw Object.assign(new Error('zone_letter_not_found'), { __notFound: true });
        }
        return { ok: true } as const;
      });
    } catch (err: any) {
      if (err?.__notFound) return { ok: false, reason: 'not_found' };
      if (err?.code === '23505') return { ok: false, reason: 'duplicate' };
      throw err;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Step 1 — clear letter on every parent row for this room so we never
    // leave two active parents with the same letter (would violate the
    // partial unique index).
    await client.query(clearSql, clearParams);

    // Step 2 — when clearing (normalised == null) we're done; otherwise set
    // the letter on exactly one canonical parent row.
    if (normalised === null) {
      await client.query('COMMIT');
      return { ok: true };
    }

    const result = await client.query(setSql, setParams);
    if ((result.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'not_found' };
    }
    await client.query('COMMIT');
    return { ok: true };
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err?.code === '23505') return { ok: false, reason: 'duplicate' };
    throw err;
  } finally {
    client.release();
  }
}

// ─── Bins overview ──────────────────────────────────────────────────────────

export interface BinsOverviewRow {
  id: number;
  barcode: string | null;
  name: string;
  room: string | null;
  row_label: string | null;
  col_label: string | null;
  capacity: number | null;
  bin_type: string | null;
  zone_letter: string | null;
  /** Sum of qty across every SKU in this bin. */
  total_qty: number;
  /** Distinct SKUs in this bin. */
  sku_count: number;
  /** total_qty / capacity (0..1), null when capacity is null. */
  fill_pct: number | null;
  /** Newest last_counted across this bin's rows. */
  last_counted: string | null;
  is_empty: boolean;
  is_stale: boolean;          // last_counted older than 90d (or never counted with stock)
  has_low_stock: boolean;     // any bin_contents row with qty < min_qty
  is_over_capacity: boolean;  // total_qty > capacity
}

export interface BinsOverviewCounts {
  total: number;
  empty: number;
  stale: number;
  low_stock: number;
  over_capacity: number;
}

const STALE_DAYS = 90;

/**
 * Pure WHERE-clause builder for {@link getBinsOverview} — exported for unit
 * tests. Special bare-barcode bins (RETURNS-TEST / TECH-PARTS / UNSORTED) have
 * null row/col labels and must still appear via `specialBarcodes`. The room
 * filter and search read the DERIVED room, so the FROM must carry
 * `derivedRoomSetJoinSql('l', 'room', …)`.
 */
export function buildBinsOverviewWhere(args: {
  /** 1-based param indices already reserved ahead of this builder (stale days = 1). */
  params: unknown[];
  room?: string | null;
  q?: string | null;
  orgId?: OrgId;
  specialBarcodes?: string[] | null;
}): { where: string[]; orgParamIdx: number; specialParamIdx: number } {
  const room = args.room?.trim() || null;
  const q = args.q?.trim() || null;
  const orgId = args.orgId;
  const specials = (args.specialBarcodes ?? [])
    .map((b) => String(b ?? '').trim())
    .filter(Boolean);

  const where: string[] = ['l.is_active = true'];

  // A stock place is a legacy aisle-bay row (row+col), a movable-rack shelf or
  // position (no row/col; parented to a rack), or a named special bin.
  const stockPlace = `(l.row_label IS NOT NULL AND l.col_label IS NOT NULL) OR l.location_kind IN ('SHELF', 'POSITION')`;
  let specialParamIdx = 0;
  if (specials.length > 0) {
    args.params.push(specials);
    specialParamIdx = args.params.length;
    where.push(`(${stockPlace} OR l.barcode = ANY($${specialParamIdx}))`);
  } else {
    where.push(`(${stockPlace})`);
  }

  let orgParamIdx = 0;
  if (orgId) {
    args.params.push(orgId);
    orgParamIdx = args.params.length;
    where.push(`l.organization_id = $${orgParamIdx}`);
  }

  if (room) {
    args.params.push(room);
    where.push(`${derivedRoomLabelSql('l', 'room')} = $${args.params.length}`);
  }
  if (q) {
    args.params.push(`%${q}%`);
    const idx = args.params.length;
    where.push(
      `(
        l.barcode ILIKE $${idx}
        OR l.name ILIKE $${idx}
        OR ${derivedRoomLabelSql('l', 'room')} ILIKE $${idx}
        OR l.row_label ILIKE $${idx}
        OR l.col_label ILIKE $${idx}
        OR EXISTS (
          SELECT 1
          FROM bin_contents bc2
          LEFT JOIN sku_stock ss ON ss.sku = bc2.sku${orgId ? ` AND ss.organization_id = bc2.organization_id` : ''}
          WHERE bc2.location_id = l.id${orgId ? ` AND bc2.organization_id = $${orgParamIdx}` : ''}
            AND (bc2.sku ILIKE $${idx} OR ss.product_title ILIKE $${idx})
        )
      )`,
    );
  }

  return { where, orgParamIdx, specialParamIdx };
}

/** One-shot read for the inventory bins tab. */
export async function getBinsOverview(filter?: {
  room?: string | null;
  q?: string | null;
  orgId?: OrgId;
  /** Bare-barcode specials that must appear without row/col labels. */
  specialBarcodes?: string[] | null;
}): Promise<{ rows: BinsOverviewRow[]; counts: BinsOverviewCounts }> {
  const room = filter?.room?.trim() || null;
  const q = filter?.q?.trim() || null;
  const orgId = filter?.orgId;

  const params: unknown[] = [STALE_DAYS];
  const { where, orgParamIdx, specialParamIdx } = buildBinsOverviewWhere({
    params,
    room,
    q,
    orgId,
    specialBarcodes: filter?.specialBarcodes,
  });

  // The aggregate CTE is scoped to this org's bin_contents too, so totals/
  // counts can't bleed another tenant's stock through the location join.
  const aggWhere = orgId ? `WHERE bc.organization_id = $${orgParamIdx}` : '';

  // Special bins float to the top (sort_order near 997–999); structured bins
  // keep room → row → col walking order.
  const specialOrder =
    specialParamIdx > 0
      ? `CASE WHEN l.barcode = ANY($${specialParamIdx}) THEN 0 ELSE 1 END,`
      : '';

  const sql = `
    WITH agg AS (
      SELECT
        bc.location_id,
        COALESCE(SUM(bc.qty), 0)::int        AS total_qty,
        COUNT(DISTINCT bc.sku)::int          AS sku_count,
        MAX(bc.last_counted)                 AS last_counted,
        BOOL_OR(bc.qty < COALESCE(bc.min_qty, -1)) AS has_low_stock
      FROM bin_contents bc
      ${aggWhere}
      GROUP BY bc.location_id
    )
    SELECT
      l.id, l.barcode, l.name, ${derivedRoomLabelSql('l', 'room')} AS room, l.row_label, l.col_label,
      l.capacity, l.bin_type, l.zone_letter,
      COALESCE(agg.total_qty, 0)::int           AS total_qty,
      COALESCE(agg.sku_count, 0)::int           AS sku_count,
      CASE
        WHEN l.capacity IS NULL OR l.capacity <= 0 THEN NULL::float
        ELSE LEAST(COALESCE(agg.total_qty, 0)::float / l.capacity::float, 9.99)
      END                                       AS fill_pct,
      agg.last_counted                          AS last_counted,
      (COALESCE(agg.total_qty, 0) = 0)          AS is_empty,
      (
        agg.last_counted IS NULL
        OR agg.last_counted < NOW() - ($1 || ' days')::interval
      )                                         AS is_stale,
      COALESCE(agg.has_low_stock, false)        AS has_low_stock,
      (l.capacity IS NOT NULL AND COALESCE(agg.total_qty, 0) > l.capacity) AS is_over_capacity
    FROM locations l
    ${derivedRoomSetJoinSql('l', 'room', orgParamIdx > 0 ? `$${orgParamIdx}` : undefined)}
    LEFT JOIN agg ON agg.location_id = l.id
    WHERE ${where.join(' AND ')}
    ORDER BY ${specialOrder} l.sort_order ASC, ${derivedRoomLabelSql('l', 'room')} NULLS LAST, ${rackWalkOrderSql('l.barcode')}, l.row_label NULLS LAST, l.col_label NULLS LAST, l.id
  `;

  const result = orgId
    ? await tenantQuery(orgId, sql, params)
    : await pool.query(sql, params);
  const rows = result.rows as BinsOverviewRow[];

  const counts: BinsOverviewCounts = {
    total: rows.length,
    empty: rows.filter((r) => r.is_empty).length,
    stale: rows.filter((r) => r.is_stale).length,
    low_stock: rows.filter((r) => r.has_low_stock).length,
    over_capacity: rows.filter((r) => r.is_over_capacity).length,
  };

  return { rows, counts };
}

export async function getLocationByBarcode(barcode: string, orgId?: OrgId): Promise<Location | null> {
  // `barcode` is a tenant-scoped string key (collides across orgs), so when
  // an orgId is supplied we add an org predicate to avoid resolving another
  // tenant's bin from the same barcode.
  const sql = `SELECT * FROM locations WHERE barcode = $1 AND is_active = true${orgId ? ' AND organization_id = $2' : ''} LIMIT 1`;
  const params = orgId ? [barcode.trim(), orgId] : [barcode.trim()];
  const result = orgId
    ? await tenantQueryOneTrip<Location>(orgId, sql, params)
    : await pool.query<Location>(sql, params);
  return result.rows[0] ?? null;
}

/**
 * The barcode of the place a stock row key names (`<location_id|name>:<sku>:<source>`,
 * `locationStockRowId`) — one indexed point read instead of loading a room.
 */
export async function getLocationBarcodeForStockRowKey(key: string, orgId: OrgId): Promise<string | null> {
  const place = key.split(':', 1)[0]?.trim() ?? '';
  if (!place || place === '?') return null;
  const id = /^\d+$/.test(place) ? Number(place) : null;
  const result = await tenantQueryOneTrip<{ barcode: string | null }>(
    orgId,
    `SELECT barcode FROM locations
      WHERE organization_id = $1 AND is_active = true
        AND ${id != null ? 'id = $2' : 'name = $2'}
      LIMIT 1`,
    [orgId, id ?? place],
  );
  return result.rows[0]?.barcode?.trim() || null;
}

export async function createLocation(data: {
  name: string;
  room?: string | null;
  description?: string | null;
  barcode?: string | null;
  sortOrder?: number;
  rowLabel?: string | null;
  colLabel?: string | null;
  binType?: string | null;
  capacity?: number | null;
  parentId?: number | null;
  /** Only meaningful on parent room rows (no row/col). */
  zoneLetter?: string | null;
}, orgId?: OrgId): Promise<Location> {
  // Auto-generate barcode if not provided and we have room+row+col
  let barcode = data.barcode?.trim() || null;
  if (!barcode && data.room && data.rowLabel && data.colLabel) {
    const roomCode = data.room.trim().replace(/\s+/g, '').replace(/zone/i, 'Z');
    barcode = `${roomCode}-${data.rowLabel.trim()}-${data.colLabel.trim().padStart(2, '0')}`;
  }

  const zoneLetter = data.zoneLetter
    ? data.zoneLetter.trim().toUpperCase().charAt(0)
    : null;

  const baseParams = [
    data.name.trim(),
    data.room?.trim() || null,
    data.description?.trim() || null,
    barcode,
    data.sortOrder ?? 0,
    data.rowLabel?.trim() || null,
    data.colLabel?.trim() || null,
    data.binType?.trim() || null,
    data.capacity ?? null,
    data.parentId ?? null,
    zoneLetter && /^[A-Z]$/.test(zoneLetter) ? zoneLetter : null,
  ];

  // When orgId is supplied, stamp organization_id on the INSERT.
  const sql = `INSERT INTO locations (name, room, description, barcode, sort_order, row_label, col_label, bin_type, capacity, parent_id, zone_letter${orgId ? ', organization_id' : ''})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11${orgId ? ', $12' : ''})
     RETURNING *`;
  const params = orgId ? [...baseParams, orgId] : baseParams;
  const result = orgId
    ? await tenantQuery<Location>(orgId, sql, params)
    : await pool.query<Location>(sql, params);
  return result.rows[0];
}

export async function updateLocation(
  id: number,
  data: Partial<{ name: string; displayName: string | null; room: string | null; description: string | null; barcode: string | null; binType: string | null; capacity: number | null; isActive: boolean; sortOrder: number }>,
  orgId?: OrgId,
): Promise<Location | null> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name.trim()); }
  // Empty nickname === no nickname: store NULL so every display read falls back
  // to `name` instead of painting a blank chip.
  if (data.displayName !== undefined) { sets.push(`display_name = $${idx++}`); params.push(data.displayName?.trim() || null); }
  if (data.room !== undefined) { sets.push(`room = $${idx++}`); params.push(data.room?.trim() || null); }
  if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description?.trim() || null); }
  if (data.barcode !== undefined) { sets.push(`barcode = $${idx++}`); params.push(data.barcode?.trim() || null); }
  if (data.binType !== undefined) { sets.push(`bin_type = $${idx++}`); params.push(data.binType?.trim() || null); }
  if (data.capacity !== undefined) { sets.push(`capacity = $${idx++}`); params.push(data.capacity); }
  if (data.isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(data.isActive); }
  if (data.sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); params.push(data.sortOrder); }

  params.push(id);
  const idIdx = idx++;
  let orgClause = '';
  if (orgId) {
    params.push(orgId);
    orgClause = ` AND organization_id = $${idx++}`;
  }
  const sql = `UPDATE locations SET ${sets.join(', ')} WHERE id = $${idIdx}${orgClause} RETURNING *`;
  const result = orgId
    ? await tenantQuery<Location>(orgId, sql, params)
    : await pool.query<Location>(sql, params);
  return result.rows[0] ?? null;
}

// ─── Room-level helpers ─────────────────────────────────────────────────────

/**
 * Rename a room across every location that references it. Returns the count
 * of rows touched (room parent + all child bins).
 */
export async function renameRoom(
  oldName: string,
  newName: string,
  orgId?: OrgId,
): Promise<{ updated: number; barcodesRekeyed: number }> {
  const from = oldName.trim();
  const to = newName.trim();
  if (!from || !to || from === to) return { updated: 0, barcodesRekeyed: 0 };

  // db is either the org-scoped tenant transaction client or the raw pool client.
  const runRename = async (
    db: { query: typeof pool.query },
  ): Promise<{ updated: number; barcodesRekeyed: number }> => {
    // Find every parent row participating in this room — match on either `room` or legacy `name`.
    const parents = await db.query(
      `SELECT id, name FROM locations
        WHERE row_label IS NULL
          AND col_label IS NULL
          AND is_active = true
          AND (room = $1 OR name = $1)${orgId ? ' AND organization_id = $2' : ''}
        ORDER BY sort_order, id`,
      orgId ? [from, orgId] : [from],
    ) as { rows: { id: number; name: string }[] };

    let parentUpdates = 0;
    if (parents.rows.length > 0) {
      const canonicalId = parents.rows[0].id;
      const siblingIds = parents.rows.slice(1).map((r) => r.id);

      // Siblings: room-only rewrite.
      if (siblingIds.length > 0) {
        const sib = await db.query(
          `UPDATE locations
              SET room = $1, updated_at = NOW()
            WHERE id = ANY($2::int[])${orgId ? ' AND organization_id = $3' : ''}
          RETURNING id`,
          orgId ? [to, siblingIds, orgId] : [to, siblingIds],
        );
        parentUpdates += sib.rowCount ?? 0;
      }

      // Canonical parent: rewrite both name + room. Throws 23505 if some
      // OTHER row already owns this name — caller maps that to a 409.
      const can = await db.query(
        `UPDATE locations
            SET name = $1, room = $1, updated_at = NOW()
          WHERE id = $2${orgId ? ' AND organization_id = $3' : ''}
        RETURNING id`,
        orgId ? [to, canonicalId, orgId] : [to, canonicalId],
      );
      parentUpdates += can.rowCount ?? 0;
    }

    // Bin rows: only `room` gets rewritten. `name` on bins is a free-form
    // label and should not be globally swapped by a room rename.
    const binUpdate = await db.query(
      `UPDATE locations
         SET room = $2, updated_at = NOW()
       WHERE row_label IS NOT NULL
         AND col_label IS NOT NULL
         AND room = $1${orgId ? ' AND organization_id = $3' : ''}
       RETURNING id, row_label, col_label, barcode`,
      orgId ? [from, to, orgId] : [from, to],
    ) as { rowCount: number; rows: { id: number; row_label: string; col_label: string; barcode: string | null }[] };

    // Re-key barcodes for renamed bins so the room prefix matches the new name.
    let barcodesRekeyed = 0;
    const fromRoomCode = from.replace(/\s+/g, '').replace(/zone/i, 'Z');
    const toRoomCode = to.replace(/\s+/g, '').replace(/zone/i, 'Z');
    for (const r of binUpdate.rows) {
      if (!r.barcode) continue;
      if (!r.barcode.startsWith(`${fromRoomCode}-`)) continue;
      const rest = r.barcode.slice(fromRoomCode.length + 1);
      const next = `${toRoomCode}-${rest}`;
      await db.query(
        `UPDATE locations SET barcode = $1, updated_at = NOW() WHERE id = $2${orgId ? ' AND organization_id = $3' : ''}`,
        orgId ? [next, r.id, orgId] : [next, r.id],
      );
      barcodesRekeyed += 1;
    }

    const updated = parentUpdates + (binUpdate.rowCount ?? 0);

    // If neither parent nor any bin matched, the room exists only in client state (localStorage zoneMap from the legacy label printer).
    let parentCreated = 0;
    if (updated === 0) {
      const insert = await db.query(
        `INSERT INTO locations (name, room, is_active, sort_order${orgId ? ', organization_id' : ''})
         VALUES ($1, $1, true, COALESCE(
           (SELECT MAX(sort_order) + 1 FROM locations WHERE row_label IS NULL AND col_label IS NULL${orgId ? ' AND organization_id = $2' : ''}),
           0
         )${orgId ? ', $2' : ''})
         ON CONFLICT DO NOTHING
         RETURNING id`,
        orgId ? [to, orgId] : [to],
      );
      parentCreated = insert.rowCount ?? 0;
    }

    return { updated: updated + parentCreated, barcodesRekeyed };
  };

  if (orgId) {
    return withTenantTransaction(orgId, (client) => runRename(client));
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await runRename(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reorder rooms — apply `sort_order` to each room name in `order` by index.
 * Updates only the room-level parent row (no row/col) so child bins keep
 * their own ordering. Returns the count of rooms updated.
 */
export async function reorderRooms(order: string[], orgId?: OrgId): Promise<{ updated: number }> {
  const clean = order.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return { updated: 0 };

  // db = org-scoped tenant transaction client or the raw pool client.
  const runReorder = async (
    db: { query: typeof pool.query },
  ): Promise<{ updated: number }> => {
    let updated = 0;
    for (let i = 0; i < clean.length; i += 1) {
      const r = await db.query(
        `UPDATE locations
            SET sort_order = $2, updated_at = NOW()
          WHERE row_label IS NULL AND col_label IS NULL
            AND (name = $1 OR room = $1)${orgId ? ' AND organization_id = $3' : ''}`,
        orgId ? [clean[i], i, orgId] : [clean[i], i],
      );
      updated += r.rowCount ?? 0;
    }
    return { updated };
  };

  if (orgId) {
    return withTenantTransaction(orgId, (client) => runReorder(client));
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await runReorder(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Soft-delete a single bin/location by id (is_active = false). Bin contents,
 * inventory_events and audit rows reference it by id, so we never hard-delete.
 * Returns true if a row was deactivated (false if not found / already inactive).
 */
export async function softDeleteLocation(id: number, orgId?: OrgId): Promise<boolean> {
  const sql = `UPDATE locations
        SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND is_active = true${orgId ? ' AND organization_id = $2' : ''}`;
  const params = orgId ? [id, orgId] : [id];
  const r = orgId
    ? await tenantQuery(orgId, sql, params)
    : await pool.query(sql, params);
  return (r.rowCount ?? 0) > 0;
}

type LocationDeleteBaseRow = {
  id: number;
  barcode: string | null;
  name: string;
  room: string | null;
  row_label: string | null;
  col_label: string | null;
  locked_for_count: boolean | null;
};

type LocationDeleteOccupancyRow = {
  location_id: number;
  quantity: number;
  sku_count: number;
  handling_unit_count: number;
  order_placement_count: number;
  unit_placement_count: number;
};

async function locationDeleteTargetsWith(
  db: { query: typeof pool.query },
  scope: LocationDeleteScope,
  orgId: OrgId,
  lock: boolean,
): Promise<LocationDeleteTarget[]> {
  if (!hasLocationDeleteScope(scope)) throw new Error('Choose at least one location or hierarchy scope.');

  const base = await db.query<LocationDeleteBaseRow>(
    `SELECT id, barcode, name, room, row_label, col_label, locked_for_count
       FROM locations
      WHERE organization_id = $1 AND is_active = true
      ORDER BY room, row_label, col_label, name, id${lock ? ' FOR UPDATE' : ''}`,
    [orgId],
  );
  const selected = base.rows.filter((row) => locationMatchesDeleteScope(row, scope));
  if (selected.length === 0) return [];
  if (selected.length > 2_000) throw new Error('Location deletion scope is too large (maximum 2,000 at once).');

  const ids = selected.map((row) => Number(row.id));
  const occupancy = await db.query<LocationDeleteOccupancyRow>(
    `SELECT target.id AS location_id,
            COALESCE(stock.quantity, 0)::int AS quantity,
            COALESCE(stock.sku_count, 0)::int AS sku_count,
            COALESCE(hu.n, 0)::int AS handling_unit_count,
            COALESCE(op.n, 0)::int AS order_placement_count,
            COALESCE(up.n, 0)::int AS unit_placement_count
       FROM unnest($2::int[]) AS target(id)
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(GREATEST(bc.qty, 0)), 0) AS quantity,
                COUNT(*) FILTER (WHERE bc.qty > 0) AS sku_count
           FROM bin_contents bc
          WHERE bc.organization_id = $1 AND bc.location_id = target.id
       ) stock ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS n FROM handling_units h
          WHERE h.organization_id = $1 AND h.location_id = target.id
       ) hu ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS n FROM order_pack_placements p
          WHERE p.organization_id = $1 AND p.location_id = target.id
       ) op ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS n FROM unit_pack_placements p
          WHERE p.organization_id = $1 AND p.location_id = target.id
       ) up ON true`,
    [orgId, ids],
  );
  const occupancyById = new Map(occupancy.rows.map((row) => [Number(row.location_id), row]));

  return selected.map((row) => {
    const counts = occupancyById.get(Number(row.id));
    const quantity = Number(counts?.quantity ?? 0);
    const skuCount = Number(counts?.sku_count ?? 0);
    const handlingUnitCount = Number(counts?.handling_unit_count ?? 0);
    const orderPlacementCount = Number(counts?.order_placement_count ?? 0);
    const unitPlacementCount = Number(counts?.unit_placement_count ?? 0);
    const blockedReasons: string[] = [];
    if (quantity > 0) blockedReasons.push(`${quantity} stock unit${quantity === 1 ? '' : 's'}`);
    if (handlingUnitCount > 0) blockedReasons.push(`${handlingUnitCount} parked LPN${handlingUnitCount === 1 ? '' : 's'}`);
    if (orderPlacementCount > 0) blockedReasons.push(`${orderPlacementCount} staged order${orderPlacementCount === 1 ? '' : 's'}`);
    if (unitPlacementCount > 0) blockedReasons.push(`${unitPlacementCount} staged unit${unitPlacementCount === 1 ? '' : 's'}`);
    if (row.locked_for_count) blockedReasons.push('locked for cycle count');
    const hierarchy = locationHierarchy(row);
    return {
      id: Number(row.id),
      barcode: row.barcode,
      name: row.name,
      room: row.room,
      rowLabel: row.row_label,
      colLabel: row.col_label,
      face: locationDeleteFace(row),
      ...hierarchy,
      quantity,
      skuCount,
      handlingUnitCount,
      orderPlacementCount,
      unitPlacementCount,
      lockedForCount: Boolean(row.locked_for_count),
      deletable: blockedReasons.length === 0,
      blockedReasons,
    };
  });
}

/** Resolve a hierarchy or explicit IDs into the exact physical locations and their blockers. */
export async function previewLocationDeletion(
  scope: LocationDeleteScope,
  orgId: OrgId,
): Promise<LocationDeleteTarget[]> {
  return withTenantTransaction(orgId, (db) => locationDeleteTargetsWith(db, scope, orgId, false));
}

/** Atomically soft-delete an explicit, already-previewed set. Any newly occupied row refuses the whole write. */
export async function bulkSoftDeleteLocations(
  locationIds: number[],
  orgId: OrgId,
): Promise<{ deactivated: number; targets: LocationDeleteTarget[] }> {
  const ids = Array.from(new Set(locationIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)));
  if (ids.length === 0) throw new Error('Choose at least one location to delete.');
  return withTenantTransaction(orgId, async (db) => {
    const targets = await locationDeleteTargetsWith(db, { locationIds: ids }, orgId, true);
    if (targets.length !== ids.length) throw new Error('One or more locations are missing or already inactive. Refresh the preview.');
    const blocked = targets.filter((target) => !target.deletable);
    if (blocked.length > 0) {
      const error = new Error('One or more locations became occupied. Refresh the preview.');
      Object.assign(error, { code: 'LOCATION_DELETE_BLOCKED', targets });
      throw error;
    }
    const result = await db.query(
      `UPDATE locations
          SET is_active = false, updated_at = NOW()
        WHERE organization_id = $1 AND id = ANY($2::int[]) AND is_active = true`,
      [orgId, ids],
    );
    return { deactivated: result.rowCount ?? 0, targets };
  });
}

/** Soft-delete a room and every bin under it (sets is_active = false). */
export async function softDeleteRoom(name: string, orgId?: OrgId): Promise<{ deactivated: number }> {
  const room = name.trim();
  if (!room) return { deactivated: 0 };
  // `room`/`name` are tenant-scoped string keys; when an orgId is supplied we
  // add an `organization_id = $n` predicate so we never deactivate another
  // tenant's room.
  const sql = `UPDATE locations
        SET is_active = false, updated_at = NOW()
      WHERE (room = $1 OR (row_label IS NULL AND col_label IS NULL AND name = $1))
        AND is_active = true${orgId ? ' AND organization_id = $2' : ''}`;
  const params = orgId ? [room, orgId] : [room];
  const r = orgId
    ? await tenantQuery(orgId, sql, params)
    : await pool.query(sql, params);
  return { deactivated: r.rowCount ?? 0 };
}

/**
 * Bulk-create bins for a row across a column range. Idempotent on barcode —
 * existing bins are returned untouched so the caller can simply re-print.
 */
export async function bulkCreateBinRange(data: {
  room: string;
  rowLabel: string;
  colStart: number;
  colEnd: number;
  binType?: string | null;
  capacity?: number | null;
}, orgId?: OrgId): Promise<{ created: number; bins: Location[] }> {
  const room = data.room.trim();
  const rowLabel = data.rowLabel.trim();
  const lo = Math.min(data.colStart, data.colEnd);
  const hi = Math.max(data.colStart, data.colEnd);
  const roomCode = room.replace(/\s+/g, '').replace(/zone/i, 'Z');

  // db is either the tenant transaction client (org-scoped) or the raw pool.
  const runBatch = async (db: { query: typeof pool.query }): Promise<{ created: number; bins: Location[] }> => {
    const bins: Location[] = [];
    let created = 0;

    for (let n = lo; n <= hi; n += 1) {
      const colLabel = String(n);
      const barcode = `${roomCode}-${rowLabel}-${colLabel.padStart(2, '0')}`;
      // `barcode` collides across tenants — org-scope the existence probe.
      const existing = await db.query<Location>(
        `SELECT * FROM locations WHERE barcode = $1${orgId ? ' AND organization_id = $2' : ''} LIMIT 1`,
        orgId ? [barcode, orgId] : [barcode],
      );
      if (existing.rows[0]) {
        // Re-activate if soft-deleted so re-prints work after a delete cycle.
        if (existing.rows[0].is_active === false) {
          const reactivated = await db.query<Location>(
            `UPDATE locations SET is_active = true, updated_at = NOW()
               WHERE id = $1${orgId ? ' AND organization_id = $2' : ''} RETURNING *`,
            orgId ? [existing.rows[0].id, orgId] : [existing.rows[0].id],
          );
          bins.push(reactivated.rows[0]);
        } else {
          bins.push(existing.rows[0]);
        }
        continue;
      }

      const insert = await db.query<Location>(
        `INSERT INTO locations
          (name, room, barcode, row_label, col_label, bin_type, capacity, sort_order${orgId ? ', organization_id' : ''})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8${orgId ? ', $9' : ''})
         RETURNING *`,
        orgId
          ? [
              `${roomCode} ${rowLabel}${colLabel}`,
              room,
              barcode,
              rowLabel,
              colLabel,
              data.binType?.trim() || null,
              data.capacity ?? null,
              n,
              orgId,
            ]
          : [
              `${roomCode} ${rowLabel}${colLabel}`,
              room,
              barcode,
              rowLabel,
              colLabel,
              data.binType?.trim() || null,
              data.capacity ?? null,
              n,
            ],
      );
      bins.push(insert.rows[0]);
      created += 1;
    }
    return { created, bins };
  };

  if (orgId) {
    return withTenantTransaction(orgId, (client) => runBatch(client));
  }
  return runBatch(pool);
}

/** Rows a printed-address registration inserted or reactivated, plus every bin it resolved. */
export type PrintedLocationsRegistration = { registered: number; bins: Location[] };

/** Upsert location rows for a batch of printer-format addresses ({zone, aisle, bay, level, position}). */
export async function registerPrintedLocations(input: {
  room: string;
  segments: LocationSegments[];
  binType?: string | null;
  capacity?: number | null;
}, orgId?: OrgId): Promise<PrintedLocationsRegistration> {
  const room = input.room.trim();
  if (!room) throw new Error('room is required');
  if (!Array.isArray(input.segments) || input.segments.length === 0) {
    return { registered: 0, bins: [] };
  }

  // db is the org-scoped tenant transaction client, or the raw pool when no
  // orgId is threaded (legacy callers).
  const runRegister = async (db: { query: typeof pool.query }): Promise<{ registered: number; bins: Location[] }> => {
    // Active parent room row (best-effort; null is acceptable). Org-scoped so
    // we never adopt another tenant's parent row for this org's bins.
    const parent = await db.query(
      `SELECT id FROM locations
        WHERE row_label IS NULL
          AND col_label IS NULL
          AND is_active = true
          AND (room = $1 OR name = $1)${orgId ? ' AND organization_id = $2' : ''}
        ORDER BY sort_order, id
        LIMIT 1`,
      orgId ? [room, orgId] : [room],
    ) as { rows: { id: number }[] };
    const parentId = parent.rows[0]?.id ?? null;

    const bins: Location[] = [];
    let registered = 0;

    for (const seg of input.segments) {
      const barcode = locationCodeFlat(seg);
      const dashedName = locationCode(seg);
      const rowLabel = `${pad2(seg.aisle)}-${pad2(seg.bay)}`;
      const colLabel = `${noPad(seg.level)}-${pad2(seg.position)}`;

      // 1. Existing row by barcode? Reactivate if soft-deleted, else return.
      //    `barcode` collides across tenants — org-scope the probe.
      const existing = await db.query(
        `SELECT * FROM locations WHERE barcode = $1${orgId ? ' AND organization_id = $2' : ''} LIMIT 1`,
        orgId ? [barcode, orgId] : [barcode],
      ) as { rows: Location[] };
      if (existing.rows[0]) {
        if (existing.rows[0].is_active === false) {
          const r = await db.query(
            `UPDATE locations
                SET is_active = true,
                    room = $2,
                    row_label = $3,
                    col_label = $4,
                    parent_id = COALESCE($5, parent_id),
                    bin_type = COALESCE($6, bin_type),
                    capacity = COALESCE($7, capacity),
                    updated_at = NOW()
              WHERE id = $1${orgId ? ' AND organization_id = $8' : ''}
            RETURNING *`,
            orgId
              ? [existing.rows[0].id, room, rowLabel, colLabel, parentId, input.binType ?? null, input.capacity ?? null, orgId]
              : [existing.rows[0].id, room, rowLabel, colLabel, parentId, input.binType ?? null, input.capacity ?? null],
          ) as { rows: Location[] };
          bins.push(r.rows[0]);
          registered += 1;
        } else {
          // Already live — keep row drift in sync (room rename safety).
          if (existing.rows[0].room !== room || existing.rows[0].parent_id !== parentId) {
            const r = await db.query(
              `UPDATE locations
                  SET room = $2, parent_id = COALESCE($3, parent_id), updated_at = NOW()
                WHERE id = $1${orgId ? ' AND organization_id = $4' : ''}
              RETURNING *`,
              orgId
                ? [existing.rows[0].id, room, parentId, orgId]
                : [existing.rows[0].id, room, parentId],
            ) as { rows: Location[] };
            bins.push(r.rows[0]);
          } else {
            bins.push(existing.rows[0]);
          }
        }
        continue;
      }

      // 2. Insert a fresh row. UNIQUE(organization_id, barcode) protects
      //    against manual dupes. Stamp organization_id when threaded (else
      //    the GUC default supplies it).
      const insert = await db.query(
        `INSERT INTO locations
           (name, room, barcode, row_label, col_label, bin_type, capacity, parent_id, sort_order${orgId ? ', organization_id' : ''})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0${orgId ? ', $9' : ''})
         ON CONFLICT (organization_id, barcode) DO UPDATE
            SET room = EXCLUDED.room,
                row_label = EXCLUDED.row_label,
                col_label = EXCLUDED.col_label,
                bin_type = COALESCE(EXCLUDED.bin_type, locations.bin_type),
                capacity = COALESCE(EXCLUDED.capacity, locations.capacity),
                parent_id = COALESCE(EXCLUDED.parent_id, locations.parent_id),
                is_active = true,
                updated_at = NOW()
         RETURNING *`,
        orgId
          ? [dashedName, room, barcode, rowLabel, colLabel, input.binType ?? null, input.capacity ?? null, parentId, orgId]
          : [dashedName, room, barcode, rowLabel, colLabel, input.binType ?? null, input.capacity ?? null, parentId],
      ) as { rows: Location[] };
      bins.push(insert.rows[0]);
      registered += 1;
    }

    return { registered, bins };
  };

  if (orgId) {
    return withTenantTransaction(orgId, (client) => runRegister(client));
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await runRegister(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Location Transfers ─────────────────────────────────────────────────────

export async function logLocationTransfer(data: {
  entityType: string;
  entityId: number;
  sku: string;
  fromLocation: string | null;
  toLocation: string;
  staffId?: number | null;
  notes?: string | null;
}, orgId: OrgId): Promise<LocationTransfer> {
  // location_transfers is RLS-bound: always run through the GUC-setting
  // tenant wrapper and stamp organization_id on the INSERT.
  const sql = `INSERT INTO location_transfers (entity_type, entity_id, sku, from_location, to_location, staff_id, notes, organization_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`;
  const params = [data.entityType, data.entityId, data.sku, data.fromLocation, data.toLocation, data.staffId || null, data.notes?.trim() || null, orgId];
  const result = await tenantQuery<LocationTransfer>(orgId, sql, params);
  return result.rows[0];
}

export async function getTransfersForSku(sku: string, limit = 25, orgId: OrgId): Promise<LocationTransfer[]> {
  // `sku` is a tenant-scoped string key — always org-scope the read and run
  // it through the GUC-setting tenant wrapper.
  const sql = `SELECT * FROM location_transfers
     WHERE sku = $1 AND organization_id = $3
     ORDER BY created_at DESC
     LIMIT $2`;
  const params = [sku.trim(), limit, orgId];
  const result = await tenantQuery<LocationTransfer>(orgId, sql, params);
  return result.rows;
}

// ─── Bin Contents ───────────────────────────────────────────────────────────

/**
 * Every SKU stored at one active location, keyed by its barcode so it runs in
 * parallel with the location read. `photo_ids` is the SKU_STOCK evidence in
 * display order (index 0 = cover); the phone's preview and viewer read it, so
 * opening a stock row costs no second request.
 */
async function getBinContentsAtBarcode(barcode: string, orgId: OrgId): Promise<BinContent[]> {
  const sql = `SELECT bc.*, l.name AS location_name, l.room, l.row_label, l.col_label, l.barcode,
            ss.id AS stock_id,
            COALESCE(
              NULLIF(ss.display_name_override, ''),
              NULLIF(ss.product_title, '')
            ) AS product_title,
            COALESCE(ss.is_provisional, false) AS is_provisional,
            ss.display_name_override,
            COALESCE(ph.photo_ids, '{}') AS photo_ids,
            ph.photo_ids[1] AS cover_photo_id,
            NULLIF(sc.image_url, '') AS catalog_image_url
     FROM locations l
     JOIN bin_contents bc ON bc.location_id = l.id AND bc.organization_id = l.organization_id
     LEFT JOIN sku_stock ss ON ss.sku = bc.sku AND ss.organization_id = bc.organization_id
     LEFT JOIN sku_catalog sc ON sc.sku = bc.sku AND sc.organization_id = bc.organization_id
     LEFT JOIN LATERAL (
       SELECT array_agg(pel.photo_id ORDER BY pel.sort_order ASC NULLS LAST, pel.photo_id ASC) AS photo_ids
         FROM photo_entity_links pel
        WHERE pel.organization_id = bc.organization_id
          AND pel.entity_type = 'SKU_STOCK'
          AND pel.entity_id = ss.id
          AND pel.link_role = 'primary'
     ) ph ON true
     WHERE l.barcode = $1 AND l.is_active = true AND l.organization_id = $2
     ORDER BY bc.sku`;
  const result = await tenantQueryOneTrip<BinContent>(orgId, sql, [barcode.trim(), orgId]);
  return result.rows;
}

/** Get all bin locations for a specific SKU (where is this product stored?). */
export async function getBinLocationsBySku(sku: string, orgId?: OrgId): Promise<BinContent[]> {
  // A zero-count row still names a PLACE when the SKU is a floor placeholder
  // (`Item at <face>` pairs an empty location for photos) — same placement
  // rule as the stock loader's `placed_bins`.
  const sql = `SELECT bc.*, l.name AS location_name, l.room, l.row_label, l.col_label, l.barcode,
            COALESCE(
              NULLIF(ss.display_name_override, ''),
              NULLIF(ss.product_title, '')
            ) AS product_title,
            ss.display_name_override
     FROM bin_contents bc
     JOIN locations l ON l.id = bc.location_id
     LEFT JOIN sku_stock ss ON ss.sku = bc.sku${orgId ? ' AND ss.organization_id = bc.organization_id' : ''}
     WHERE bc.sku = $1 AND (bc.qty > 0 OR COALESCE(ss.is_provisional, false))${orgId ? ' AND bc.organization_id = $2' : ''}
     ORDER BY l.room, l.row_label, l.col_label`;
  const params = orgId ? [sku.trim(), orgId] : [sku.trim()];
  const result = orgId
    ? await tenantQuery<BinContent>(orgId, sql, params)
    : await pool.query<BinContent>(sql, params);
  return result.rows;
}

/** Get bin contents by scanning a bin barcode: location and contents in one round trip of latency. */
export async function getBinContentsByBarcode(barcode: string, orgId: OrgId): Promise<{
  location: Location;
  contents: BinContent[];
} | null> {
  const [loc, contents] = await Promise.all([
    getLocationByBarcode(barcode, orgId),
    getBinContentsAtBarcode(barcode, orgId),
  ]);
  return loc ? { location: loc, contents } : null;
}

/** Add or update SKU quantity in a bin. */
export async function upsertBinContent(data: {
  locationId: number;
  sku: string;
  qty: number;
  minQty?: number | null;
  maxQty?: number | null;
}, orgId?: OrgId): Promise<BinContent> {
  const sql = `INSERT INTO bin_contents (location_id, sku, qty, min_qty, max_qty${orgId ? ', organization_id' : ''})
     VALUES ($1, $2, $3, $4, $5${orgId ? ', $6' : ''})
     ON CONFLICT (location_id, sku)
     DO UPDATE SET
       qty = EXCLUDED.qty,
       min_qty = COALESCE(EXCLUDED.min_qty, bin_contents.min_qty),
       max_qty = COALESCE(EXCLUDED.max_qty, bin_contents.max_qty),
       updated_at = NOW()
     RETURNING *`;
  const baseParams = [data.locationId, data.sku.trim(), data.qty, data.minQty ?? null, data.maxQty ?? null];
  const params = orgId ? [...baseParams, orgId] : baseParams;
  const result = orgId
    ? await tenantQuery<BinContent>(orgId, sql, params)
    : await pool.query<BinContent>(sql, params);
  return result.rows[0];
}

/** Versioned variant of {@link upsertBinContent} — UPDATE only succeeds when the caller-supplied `expectedUpdatedAt` matches the current row. */
export async function upsertBinContentIfVersion(data: {
  locationId: number;
  sku: string;
  qty: number;
  minQty?: number | null;
  maxQty?: number | null;
  expectedUpdatedAt: string;
}, orgId?: OrgId): Promise<
  | { ok: true; row: BinContent }
  | { ok: false; current: BinContent | null }
> {
  const run = async (db: { query: typeof pool.query }): Promise<
    { ok: true; row: BinContent } | { ok: false; current: BinContent | null }
  > => {
    // Try the conditional UPDATE first. We compare with millisecond-level
    // truncation on both sides because the API roundtrips timestamps as ISO
    // strings (millisecond precision) while Postgres stores microseconds.
    const updated = await db.query<BinContent>(
      `UPDATE bin_contents
         SET qty = $3,
             min_qty = COALESCE($4, min_qty),
             max_qty = COALESCE($5, max_qty),
             updated_at = NOW()
       WHERE location_id = $1
         AND sku = $2
         AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $6::timestamptz)${orgId ? ' AND organization_id = $7' : ''}
       RETURNING *`,
      orgId
        ? [data.locationId, data.sku.trim(), data.qty, data.minQty ?? null, data.maxQty ?? null, data.expectedUpdatedAt, orgId]
        : [data.locationId, data.sku.trim(), data.qty, data.minQty ?? null, data.maxQty ?? null, data.expectedUpdatedAt],
    );
    if (updated.rows[0]) return { ok: true, row: updated.rows[0] };

    // No row updated — either the version was stale, or the row never existed.
    const existing = await db.query<BinContent>(
      `SELECT * FROM bin_contents WHERE location_id = $1 AND sku = $2${orgId ? ' AND organization_id = $3' : ''} LIMIT 1`,
      orgId ? [data.locationId, data.sku.trim(), orgId] : [data.locationId, data.sku.trim()],
    );
    if (existing.rows[0]) {
      return { ok: false, current: existing.rows[0] };
    }

    // First-time insert — race-free because the UNIQUE (location_id, sku)
    // constraint serializes concurrent inserts. Stamp org when threaded.
    const inserted = await db.query<BinContent>(
      `INSERT INTO bin_contents (location_id, sku, qty, min_qty, max_qty${orgId ? ', organization_id' : ''})
       VALUES ($1, $2, $3, $4, $5${orgId ? ', $6' : ''})
       ON CONFLICT (location_id, sku) DO NOTHING
       RETURNING *`,
      orgId
        ? [data.locationId, data.sku.trim(), data.qty, data.minQty ?? null, data.maxQty ?? null, orgId]
        : [data.locationId, data.sku.trim(), data.qty, data.minQty ?? null, data.maxQty ?? null],
    );
    if (inserted.rows[0]) return { ok: true, row: inserted.rows[0] };

    // Someone else inserted between our checks — fetch and report stale.
    const after = await db.query<BinContent>(
      `SELECT * FROM bin_contents WHERE location_id = $1 AND sku = $2${orgId ? ' AND organization_id = $3' : ''} LIMIT 1`,
      orgId ? [data.locationId, data.sku.trim(), orgId] : [data.locationId, data.sku.trim()],
    );
    return { ok: false, current: after.rows[0] ?? null };
  };

  if (orgId) {
    return withTenantTransaction(orgId, (client) => run(client));
  }
  return run(pool);
}

/** Adjust bin quantity by delta (positive = put, negative = take). */
export async function adjustBinQty(data: {
  locationId: number;
  sku: string;
  delta: number;
  staffId?: number | null;
  reason?: string;
  /** FK into reason_codes — newer callers should send this so reports can group cleanly. */
  reasonCodeId?: number | null;
  /** Free-text note (used by reason codes like DAMAGED / FOUND that require explanation). */
  notes?: string | null;
  /** Feed provenance for the realtime event. The verb rides on `reason`. */
  source?: string;
}, orgId: OrgId): Promise<{ binContent: BinContent; newStockQty: number; ledgerId: number | null }> {
  const rawSku = data.sku.trim();
  const baseSku = rawSku.includes(':') ? rawSku.split(':')[0].trim() : rawSku;

  const result = await withTenantTransaction(orgId, async (db) => {
    const binResult = await db.query<BinContent>(
      `INSERT INTO bin_contents (location_id, sku, qty, organization_id)
       VALUES ($1, $2, GREATEST(0, $3), $4)
       ON CONFLICT (location_id, sku)
       DO UPDATE SET
         qty = GREATEST(0, bin_contents.qty + $3),
         updated_at = NOW()
       RETURNING *`,
      [data.locationId, baseSku, data.delta, orgId],
    );

    const ledgerRow = await writeLedgerDelta(db, {
      orgId,
      sku: baseSku,
      delta: data.delta,
      reason: data.reason || 'BIN_ADJUST',
      staffId: data.staffId ?? null,
      reasonCodeId: data.reasonCodeId ?? null,
      notes: data.notes ?? null,
    });

    const stockResult = await db.query<{ stock: number }>(
      `SELECT stock FROM sku_stock WHERE sku = $1 AND organization_id = $2`,
      [baseSku, orgId],
    );

    return {
      binContent: binResult.rows[0],
      newStockQty: Number(stockResult.rows[0]?.stock) || 0,
      ledgerId: ledgerRow?.id ?? null,
    };
  });

  if (result.ledgerId != null) {
    try {
      await publishStockLedgerEvent({
        organizationId: orgId,
        ledgerId: result.ledgerId,
        sku: baseSku,
        delta: data.delta,
        reason: data.reason || 'BIN_ADJUST',
        dimension: 'WAREHOUSE',
        staffId: data.staffId ?? null,
        source: data.source ?? 'bin.adjust',
      });
    } catch (err) {
      console.warn('[adjustBinQty] realtime publish failed', err);
    }
  }

  return result;
}

export interface BinTransferResult {
  fromBin: { id: number; name: string; barcode: string | null };
  toBin: { id: number; name: string; barcode: string | null };
  sku: string;
  qty: number;
  sourceQty: number;
  destinationQty: number;
  ledgerIds: number[];
}

/**
 * One atomic stock move: lock source, validate quantity, write both bin legs and both ledger legs.
 * Realtime fan-out is the caller's, after the response (`publishTransferLedgerEvents`).
 */
export async function transferBinQty(data: {
  fromBarcode: string;
  toBarcode: string;
  sku: string;
  qty: number;
  staffId?: number | null;
  reasonCodeId?: number | null;
  notes?: string | null;
}, orgId: OrgId): Promise<BinTransferResult> {
  const fromBarcode = data.fromBarcode.trim();
  const toBarcode = data.toBarcode.trim();
  const rawSku = data.sku.trim();
  const sku = rawSku.includes(':') ? rawSku.split(':')[0]!.trim() : rawSku;
  const qty = Math.floor(Number(data.qty));
  if (!fromBarcode || !toBarcode || !sku || !Number.isSafeInteger(qty) || qty <= 0) {
    throw new Error('A source, destination, SKU and positive quantity are required.');
  }
  if (fromBarcode.toUpperCase() === toBarcode.toUpperCase()) {
    throw new Error('Source and destination locations must differ.');
  }

  // ONE data-modifying statement inside the tenant transaction (3 round trips,
  // was 8): every sub-statement sees the same snapshot, and the source UPDATE's
  // `qty >= n` guard is re-checked under the row lock, so two concurrent moves
  // can never take the same unit. No `moved` row → nothing was written.
  const from = fromBarcode.toUpperCase();
  const to = toBarcode.toUpperCase();
  const row = await withTenantTransaction(orgId, async (db) => (await db.query<{
    from_bin: { id: number; name: string; barcode: string | null } | null;
    to_bin: { id: number; name: string; barcode: string | null } | null;
    available: number | null;
    source_qty: number | null;
    destination_qty: number | null;
    out_ledger_id: number | null;
    in_ledger_id: number | null;
  }>(
    `WITH bins AS (
       SELECT id, name, barcode, UPPER(barcode) AS code
         FROM locations
        WHERE organization_id = $1 AND is_active = true
          AND UPPER(barcode) IN ($2, $3)
        FOR UPDATE
     ),
     f AS (SELECT id, name, barcode FROM bins WHERE code = $2),
     t AS (SELECT id, name, barcode FROM bins WHERE code = $3),
     moved AS (
       UPDATE bin_contents bc
          SET qty = bc.qty - $5, updated_at = NOW()
         FROM f, t
        WHERE bc.organization_id = $1 AND bc.location_id = f.id AND bc.sku = $4 AND bc.qty >= $5
        RETURNING bc.qty AS source_qty
     ),
     landed AS (
       INSERT INTO bin_contents (organization_id, location_id, sku, qty)
       SELECT $1::uuid, t.id, $4::text, $5::int FROM t, moved
       ON CONFLICT (location_id, sku)
       DO UPDATE SET qty = bin_contents.qty + EXCLUDED.qty, updated_at = NOW()
       RETURNING qty AS destination_qty
     ),
     ledger AS (
       INSERT INTO sku_stock_ledger (organization_id, sku, delta, reason, dimension, staff_id, reason_code_id, notes)
       SELECT $1::uuid, $4::text, leg.delta, leg.reason, 'WAREHOUSE', $6::int, $7::int, $8::text
         FROM moved, (VALUES (-$5::int, 'TRANSFER_OUT'), ($5::int, 'TRANSFER_IN')) AS leg(delta, reason)
       RETURNING id, reason
     )
     SELECT (SELECT row_to_json(f) FROM f) AS from_bin,
            (SELECT row_to_json(t) FROM t) AS to_bin,
            (SELECT bc.qty FROM bin_contents bc, f
              WHERE bc.organization_id = $1 AND bc.location_id = f.id AND bc.sku = $4) AS available,
            (SELECT source_qty FROM moved) AS source_qty,
            (SELECT destination_qty FROM landed) AS destination_qty,
            (SELECT id FROM ledger WHERE reason = 'TRANSFER_OUT') AS out_ledger_id,
            (SELECT id FROM ledger WHERE reason = 'TRANSFER_IN') AS in_ledger_id`,
    [orgId, from, to, sku, qty, data.staffId ?? null, data.reasonCodeId ?? null, data.notes ?? null],
  )).rows[0]);

  if (!row?.from_bin) throw new Error(`From bin not found: ${fromBarcode}`);
  if (!row.to_bin) throw new Error(`To bin not found: ${toBarcode}`);
  if (row.source_qty == null) {
    const sourceQty = Number(row.available ?? 0);
    const error = new Error(`Source bin only has ${sourceQty}; cannot move ${qty}.`);
    Object.assign(error, { code: 'INSUFFICIENT_QTY', available: sourceQty, requested: qty });
    throw error;
  }
  return {
    fromBin: row.from_bin,
    toBin: row.to_bin,
    sku,
    qty,
    sourceQty: Number(row.source_qty),
    destinationQty: Number(row.destination_qty ?? 0),
    ledgerIds: [row.out_ledger_id, row.in_ledger_id].filter((id): id is number => id != null),
  };
}

/** Realtime fan-out for a committed {@link transferBinQty}; never blocks or fails the move. */
export async function publishTransferLedgerEvents(
  result: Pick<BinTransferResult, 'ledgerIds' | 'sku' | 'qty'>,
  { orgId, staffId }: { orgId: OrgId; staffId?: number | null },
): Promise<void> {
  await Promise.all(result.ledgerIds.map((ledgerId, index) => publishStockLedgerEvent({
    organizationId: orgId,
    ledgerId,
    sku: result.sku,
    delta: index === 0 ? -result.qty : result.qty,
    reason: index === 0 ? 'TRANSFER_OUT' : 'TRANSFER_IN',
    dimension: 'WAREHOUSE',
    staffId: staffId ?? null,
    source: 'wms.command.transfer',
  }).catch((error) => console.warn('[transferBinQty] realtime publish failed', error))));
}

/** Mark a bin as physically counted (cycle count). */
export async function markBinCounted(locationId: number, sku: string, orgId?: OrgId): Promise<void> {
  const sql = `UPDATE bin_contents SET last_counted = NOW() WHERE location_id = $1 AND sku = $2${orgId ? ' AND organization_id = $3' : ''}`;
  const params = orgId ? [locationId, sku.trim(), orgId] : [locationId, sku.trim()];
  if (orgId) {
    await tenantQuery(orgId, sql, params);
    return;
  }
  await pool.query(sql, params);
}

/** Get bins that are below their min_qty threshold (low stock alerts). */
export async function getLowStockBins(orgId?: OrgId): Promise<BinContent[]> {
  // The sku_stock join is on the `sku` string (collides across tenants); when
  // an orgId is supplied it is org-aligned and the bin_contents rows are
  // org-filtered.
  const sql = `SELECT bc.*, l.name AS location_name, l.room, l.row_label, l.col_label, l.barcode,
            ss.product_title
     FROM bin_contents bc
     JOIN locations l ON l.id = bc.location_id
     LEFT JOIN sku_stock ss ON ss.sku = bc.sku${orgId ? ' AND ss.organization_id = bc.organization_id' : ''}
     WHERE bc.min_qty IS NOT NULL AND bc.qty <= bc.min_qty${orgId ? ' AND bc.organization_id = $1' : ''}
     ORDER BY bc.qty ASC, l.room, l.row_label, l.col_label`;
  const result = orgId
    ? await tenantQuery<BinContent>(orgId, sql, [orgId])
    : await pool.query<BinContent>(sql);
  return result.rows;
}
