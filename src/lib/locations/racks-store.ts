/**
 * Real `RackDb` over one tenant transaction client — the SQL half of
 * `racks.ts`. Every statement is org-filtered explicitly (defense in depth on
 * top of the `app.current_org` GUC set by `withTenantTransaction`).
 */

import 'server-only';

import type { PoolClient } from 'pg';
import { recordOpsEvent } from '@/lib/ops-events';
import { DERIVED_ROOM_BY_ID_SQL, DERIVED_ROOM_MAX_DEPTH, derivedRoomJoinSql } from '@/lib/locations/derived-room';
import type { RackRoomRef } from '@/lib/locations/rack-types';
import type {
  LocationPatch,
  LocationRow,
  NewLocationRow,
  RackChildRow,
  RackDb,
  RackListFilter,
  RackSummaryRow,
  StoredRackEvent,
} from '@/lib/locations/racks';
import { RACK_EVENT } from '@/lib/locations/rack-events';

type Db = Pick<PoolClient, 'query'>;

interface RawLocation {
  id: number | string;
  barcode: string | null;
  name: string;
  display_name: string | null;
  location_kind: string;
  parent_id: number | string | null;
  is_active: boolean;
  sort_order: number | string | null;
  arrival_priority_tier: number | string | null;
  capacity: number | string | null;
}

const LOCATION_COLUMNS = `id, barcode, name, display_name, location_kind, parent_id, is_active,
  sort_order, arrival_priority_tier, capacity`;

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toLocation(r: RawLocation): LocationRow {
  return {
    id: Number(r.id),
    barcode: r.barcode,
    name: r.name,
    displayName: r.display_name,
    kind: r.location_kind,
    parentId: num(r.parent_id),
    isActive: r.is_active !== false,
    sortOrder: num(r.sort_order) ?? 0,
    tier: num(r.arrival_priority_tier),
    capacity: num(r.capacity),
  };
}

function iso(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function createRackDb(db: Db): RackDb {
  return {
    async lockRackNumbers(orgId) {
      await db.query(`SELECT pg_advisory_xact_lock(hashtext('location.rack.number'), hashtext($1::text))`, [orgId]);
    },

    async rackFamilyBarcodes(orgId) {
      const res = await db.query<{ barcode: string }>(
        `SELECT barcode FROM locations
          WHERE organization_id = $1 AND barcode IS NOT NULL AND UPPER(barcode) LIKE 'RK%'`,
        [orgId],
      );
      return res.rows.map((r) => r.barcode);
    },

    async findLocation(orgId, ref, opts) {
      const active = opts?.includeInactive ? '' : ' AND is_active = true';
      const res = 'id' in ref
        ? await db.query<RawLocation>(
            `SELECT ${LOCATION_COLUMNS} FROM locations
              WHERE organization_id = $1 AND id = $2${active} LIMIT 1`,
            [orgId, ref.id],
          )
        : await db.query<RawLocation>(
            `SELECT ${LOCATION_COLUMNS} FROM locations
              WHERE organization_id = $1 AND (barcode = $2 OR UPPER(barcode) = UPPER($2))${active}
              ORDER BY (barcode = $2) DESC, id LIMIT 1`,
            [orgId, ref.code],
          );
      return res.rows[0] ? toLocation(res.rows[0]) : null;
    },

    async childrenOf(orgId, parentIds, opts) {
      if (parentIds.length === 0) return [];
      const active = opts?.includeInactive ? '' : ' AND is_active = true';
      const res = await db.query<RawLocation>(
        `SELECT ${LOCATION_COLUMNS} FROM locations
          WHERE organization_id = $1 AND parent_id = ANY($2::int[])${active}
          ORDER BY sort_order, id`,
        [orgId, parentIds],
      );
      return res.rows.map(toLocation);
    },

    async ancestorIds(orgId, id) {
      const res = await db.query<{ id: number | string }>(
        `WITH RECURSIVE up AS (
           SELECT l.id, l.parent_id, 0 AS depth FROM locations l
            WHERE l.organization_id = $1 AND l.id = $2
           UNION ALL
           SELECT p.id, p.parent_id, up.depth + 1 FROM up
             JOIN locations p ON p.id = up.parent_id AND p.organization_id = $1
            WHERE up.depth < ${DERIVED_ROOM_MAX_DEPTH}
         )
         SELECT id FROM up WHERE depth > 0 ORDER BY depth`,
        [orgId, id],
      );
      return res.rows.map((r) => Number(r.id));
    },

    async derivedRoom(orgId, id): Promise<RackRoomRef | null> {
      const res = await db.query<{ id: number | string | null; name: string | null; barcode: string | null }>(
        DERIVED_ROOM_BY_ID_SQL,
        [orgId, id],
      );
      const r = res.rows[0];
      return r && r.id != null ? { id: Number(r.id), name: r.name ?? '', code: r.barcode } : null;
    },

    async eventByClientId(orgId, clientEventId): Promise<StoredRackEvent | null> {
      const res = await db.query<{ event_type: string; entity_id: number | string; payload: unknown }>(
        `SELECT event_type, entity_id, payload FROM ops_events
          WHERE organization_id = $1 AND client_event_id = $2 LIMIT 1`,
        [orgId, clientEventId],
      );
      const r = res.rows[0];
      if (!r) return null;
      return {
        eventType: r.event_type,
        entityId: Number(r.entity_id),
        payload: (r.payload && typeof r.payload === 'object' ? r.payload : {}) as Record<string, unknown>,
      };
    },

    async bayAdopted(orgId, bayKey) {
      const res = await db.query(
        `SELECT 1 FROM ops_events
          WHERE organization_id = $1 AND entity_type = 'location'
            AND event_type = $2 AND payload->>'bay' = $3
          LIMIT 1`,
        [orgId, RACK_EVENT.adopted, bayKey],
      );
      return res.rows.length > 0;
    },

    async bayRows(orgId, prefix) {
      const res = await db.query<RawLocation>(
        `SELECT ${LOCATION_COLUMNS} FROM locations
          WHERE organization_id = $1 AND is_active = true
            AND barcode ~ ('^' || $2::text || '[0-9]{3,4}$')
          ORDER BY barcode`,
        [orgId, prefix],
      );
      return res.rows.map(toLocation);
    },

    async insertLocation(orgId, row: NewLocationRow) {
      const res = await db.query<{ id: number | string }>(
        `INSERT INTO locations
           (organization_id, name, barcode, location_kind, parent_id, sort_order,
            arrival_priority_tier, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         RETURNING id`,
        [orgId, row.name, row.barcode, row.kind, row.parentId, row.sortOrder, row.tier ?? null],
      );
      return Number(res.rows[0]!.id);
    },

    async updateLocation(orgId, id, patch: LocationPatch) {
      const sets: string[] = [];
      const params: unknown[] = [orgId, id];
      const set = (col: string, v: unknown) => {
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      };
      if (patch.parentId !== undefined) set('parent_id', patch.parentId);
      if (patch.kind !== undefined) set('location_kind', patch.kind);
      if (patch.barcode !== undefined) set('barcode', patch.barcode);
      if (patch.name !== undefined) set('name', patch.name);
      if (patch.displayName !== undefined) set('display_name', patch.displayName);
      if (patch.sortOrder !== undefined) set('sort_order', patch.sortOrder);
      if (patch.isActive !== undefined) set('is_active', patch.isActive);
      if (patch.clearLegacyRoom) sets.push('room = NULL');
      if (sets.length === 0) return;
      await db.query(
        `UPDATE locations SET ${sets.join(', ')}, updated_at = NOW()
          WHERE organization_id = $1 AND id = $2`,
        params,
      );
    },

    async setActive(orgId, ids, active) {
      if (ids.length === 0) return;
      await db.query(
        `UPDATE locations SET is_active = $3, updated_at = NOW()
          WHERE organization_id = $1 AND id = ANY($2::int[])`,
        [orgId, ids, active],
      );
    },

    async occupiedIds(orgId, ids) {
      if (ids.length === 0) return [];
      // Stock (bin_contents), open arrival cartons (receiving_triage staging),
      // staged-not-put-away lines, open totes and placed serial units.
      const res = await db.query<{ id: number | string }>(
        `SELECT x.id FROM unnest($2::int[]) AS x(id)
          WHERE EXISTS (SELECT 1 FROM bin_contents bc
                         WHERE bc.organization_id = $1 AND bc.location_id = x.id AND bc.qty > 0)
             OR EXISTS (SELECT 1 FROM receiving_triage rt
                          LEFT JOIN receiving_unbox ru
                            ON ru.receiving_id = rt.receiving_id AND ru.organization_id = rt.organization_id
                         WHERE rt.organization_id = $1 AND rt.staging_location_id = x.id
                           AND ru.unboxed_at IS NULL)
             OR EXISTS (SELECT 1 FROM receiving_line_putaway lp
                         WHERE lp.organization_id = $1 AND lp.staged_location_id = x.id
                           AND lp.put_away_at IS NULL)
             OR EXISTS (SELECT 1 FROM handling_units hu
                         WHERE hu.organization_id = $1 AND hu.location_id = x.id AND hu.status <> 'CLOSED')
             OR EXISTS (SELECT 1 FROM serial_units su
                         WHERE su.organization_id = $1 AND su.location_id = x.id)`,
        [orgId, ids],
      );
      return res.rows.map((r) => Number(r.id));
    },

    async readRacks(orgId, filter: RackListFilter): Promise<RackSummaryRow[]> {
      const params: unknown[] = [orgId];
      const where: string[] = [`r.organization_id = $1`, `r.location_kind = 'RACK'`, `r.is_active = true`];
      if (filter.rackId != null) {
        params.push(filter.rackId);
        where.push(`r.id = $${params.length}`);
      }
      if (filter.placementId != null) {
        params.push(filter.placementId);
        where.push(`p.id = $${params.length}`);
      }
      if (filter.roomId != null) {
        params.push(filter.roomId);
        where.push(`room.id = $${params.length}`);
      }
      params.push([RACK_EVENT.created, RACK_EVENT.moved, RACK_EVENT.adopted]);
      const eventTypesParam = `$${params.length}`;
      const res = await db.query<{
        id: number | string;
        barcode: string;
        name: string;
        created_at: unknown;
        p_id: number | string;
        p_barcode: string | null;
        p_name: string;
        p_kind: string;
        room_id: number | string | null;
        room_name: string | null;
        room_barcode: string | null;
        last_event_at: unknown;
      }>(
        `SELECT r.id, r.barcode, r.name, r.created_at,
                p.id AS p_id, p.barcode AS p_barcode, p.name AS p_name, p.location_kind AS p_kind,
                room.id AS room_id, room.name AS room_name, room.barcode AS room_barcode,
                (SELECT MAX(e.occurred_at) FROM ops_events e
                  WHERE e.organization_id = r.organization_id AND e.entity_type = 'location'
                    AND e.entity_id = r.id AND e.event_type = ANY(${eventTypesParam}::text[])) AS last_event_at
           FROM locations r
           JOIN locations p ON p.id = r.parent_id AND p.organization_id = r.organization_id
           ${derivedRoomJoinSql('r', 'room')}
          WHERE ${where.join(' AND ')}`,
        params,
      );
      return res.rows.map((r) => ({
        id: Number(r.id),
        barcode: r.barcode,
        name: r.name,
        createdAt: iso(r.created_at) ?? new Date(0).toISOString(),
        placement: { id: Number(r.p_id), code: r.p_barcode, name: r.p_name, kind: r.p_kind },
        room: r.room_id != null ? { id: Number(r.room_id), name: r.room_name ?? '', code: r.room_barcode } : null,
        lastEventAt: iso(r.last_event_at),
      }));
    },

    async readRackChildren(orgId, rackIds): Promise<RackChildRow[]> {
      if (rackIds.length === 0) return [];
      const res = await db.query<RawLocation & { rack_id: number | string; stock_qty: number | string }>(
        `WITH shelves AS (
           SELECT s.*, s.parent_id AS rack_id FROM locations s
            WHERE s.organization_id = $1 AND s.parent_id = ANY($2::int[])
              AND s.location_kind = 'SHELF' AND s.is_active = true
         ), positions AS (
           SELECT p.*, sh.rack_id FROM locations p
             JOIN shelves sh ON sh.id = p.parent_id
            WHERE p.organization_id = $1 AND p.location_kind = 'POSITION' AND p.is_active = true
         ), fam AS (
           SELECT * FROM shelves UNION ALL SELECT * FROM positions
         )
         SELECT f.id, f.barcode, f.name, f.display_name, f.location_kind, f.parent_id, f.is_active,
                f.sort_order, f.arrival_priority_tier, f.capacity, f.rack_id,
                COALESCE((SELECT SUM(bc.qty) FROM bin_contents bc
                           WHERE bc.organization_id = $1 AND bc.location_id = f.id AND bc.qty > 0), 0) AS stock_qty
           FROM fam f
          ORDER BY f.sort_order, f.id`,
        [orgId, rackIds],
      );
      return res.rows.map((r) => ({ ...toLocation(r), rackId: Number(r.rack_id), stockQty: Number(r.stock_qty) || 0 }));
    },

    async repointSerialText(orgId, from, to) {
      const olds = [...new Set(from.filter((s): s is string => !!s && s !== to))];
      if (olds.length === 0) return;
      await db.query(
        `UPDATE serial_units SET current_location = $3, updated_at = NOW()
          WHERE organization_id = $1 AND current_location = ANY($2::text[])`,
        [orgId, olds, to],
      );
    },

    async recordEvent(input) {
      return recordOpsEvent(input, { query: (text, params) => db.query(text, params) });
    },
  };
}
