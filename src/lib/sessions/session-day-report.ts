/**
 * Org-wide staff × warehouse-day session report. Tenant-scoped.
 */

import type { PoolClient } from 'pg';
import { tenantQuery } from '@/lib/tenancy/db';
import { warehouseDayUtcBounds } from '@/utils/date';
import { sessionDayStatus, type SessionDayStatus } from './session-day-fold';

export interface SessionDayRow {
  staffId: number;
  staffName: string;
  activeMs: number;
  sessionCount: number;
  lastSurfaceKey: string | null;
  lastScanType: string | null;
  scanTypes: string[];
  status: SessionDayStatus;
  armed: boolean;
}

export interface SessionDayIntervalRow {
  id: number;
  sessionId: number;
  kind: 'active' | 'parked';
  startedAt: string;
  endedAt: string | null;
  staffId: number | null;
  scanType: string | null;
  surfaceKey: string | null;
  sessionStatus: string;
  armed: boolean;
}

function isUndefinedRelation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '42P01'
  );
}

function asScanTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export async function listSessionDayRows(
  orgId: string,
  dateKey: string,
  query?: PoolClient,
): Promise<SessionDayRow[]> {
  const bounds = warehouseDayUtcBounds(dateKey);
  if (!bounds) return [];

  const sql = `
    SELECT
      st.id AS staff_id,
      st.name AS staff_name,
      COALESCE(SUM(
        GREATEST(
          0,
          EXTRACT(EPOCH FROM (
            LEAST(COALESCE(i.ended_at, NOW()), $3::timestamptz)
            - GREATEST(i.started_at, $2::timestamptz)
          )) * 1000
        )
      ) FILTER (WHERE i.kind = 'active'), 0)::bigint AS active_ms,
      COUNT(DISTINCT s.id)::int AS session_count,
      BOOL_OR(s.armed) AS armed,
      BOOL_OR(s.status = 'open') AS has_open,
      BOOL_OR(s.status = 'parked') AS has_parked,
      (
        SELECT s2.surface_key
          FROM work_sessions s2
         WHERE s2.organization_id = $1
           AND s2.staff_id = st.id
           AND s2.started_at < $3::timestamptz
           AND (s2.ended_at IS NULL OR s2.ended_at > $2::timestamptz)
         ORDER BY s2.started_at DESC
         LIMIT 1
      ) AS last_surface_key,
      (
        SELECT s2.scan_type
          FROM work_sessions s2
         WHERE s2.organization_id = $1
           AND s2.staff_id = st.id
           AND s2.started_at < $3::timestamptz
           AND (s2.ended_at IS NULL OR s2.ended_at > $2::timestamptz)
         ORDER BY s2.started_at DESC
         LIMIT 1
      ) AS last_scan_type,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.scan_type), NULL) AS scan_types
    FROM staff st
    INNER JOIN work_sessions s
      ON s.staff_id = st.id AND s.organization_id = $1
    INNER JOIN work_session_intervals i
      ON i.session_id = s.id AND i.organization_id = $1
     AND i.started_at < $3::timestamptz
     AND COALESCE(i.ended_at, NOW()) > $2::timestamptz
    WHERE st.organization_id = $1
    GROUP BY st.id, st.name
    ORDER BY st.name ASC
  `;

  try {
    const run = query
      ? query.query(sql, [orgId, bounds.startIso, bounds.endIso])
      : tenantQuery(orgId, sql, [orgId, bounds.startIso, bounds.endIso]);
    const { rows } = await run;
    return rows.map((r) => ({
      staffId: Number(r.staff_id),
      staffName: String(r.staff_name ?? ''),
      activeMs: Number(r.active_ms ?? 0),
      sessionCount: Number(r.session_count ?? 0),
      lastSurfaceKey: r.last_surface_key == null ? null : String(r.last_surface_key),
      lastScanType: r.last_scan_type == null ? null : String(r.last_scan_type),
      scanTypes: asScanTypes(r.scan_types),
      armed: Boolean(r.armed),
      status: sessionDayStatus({
        armed: Boolean(r.armed),
        hasOpen: Boolean(r.has_open),
        hasParked: Boolean(r.has_parked),
      }),
    }));
  } catch (err) {
    if (isUndefinedRelation(err)) return [];
    throw err;
  }
}

export async function listSessionDayIntervals(
  orgId: string,
  dateKey: string,
  staffId: number,
  query?: PoolClient,
): Promise<SessionDayIntervalRow[]> {
  const bounds = warehouseDayUtcBounds(dateKey);
  if (!bounds) return [];

  const sql = `
    SELECT
      i.id,
      i.session_id,
      i.kind,
      i.started_at,
      i.ended_at,
      i.staff_id,
      s.scan_type,
      s.surface_key,
      s.status AS session_status,
      s.armed
    FROM work_session_intervals i
    INNER JOIN work_sessions s
      ON s.id = i.session_id AND s.organization_id = $1
    WHERE i.organization_id = $1
      AND s.staff_id = $4
      AND i.started_at < $3::timestamptz
      AND COALESCE(i.ended_at, NOW()) > $2::timestamptz
    ORDER BY i.started_at ASC
  `;

  try {
    const params = [orgId, bounds.startIso, bounds.endIso, staffId];
    const run = query ? query.query(sql, params) : tenantQuery(orgId, sql, params);
    const { rows } = await run;
    return rows.map((r) => ({
      id: Number(r.id),
      sessionId: Number(r.session_id),
      kind: r.kind === 'parked' ? 'parked' : 'active',
      startedAt: new Date(r.started_at).toISOString(),
      endedAt: r.ended_at == null ? null : new Date(r.ended_at).toISOString(),
      staffId: r.staff_id == null ? null : Number(r.staff_id),
      scanType: r.scan_type == null ? null : String(r.scan_type),
      surfaceKey: r.surface_key == null ? null : String(r.surface_key),
      sessionStatus: String(r.session_status ?? ''),
      armed: Boolean(r.armed),
    }));
  } catch (err) {
    if (isUndefinedRelation(err)) return [];
    throw err;
  }
}
