/**
 * The session read model — "what happened inside this session" and "what did
 * this person's day look like".
 *
 * Tenant-scoped through `withTenantTransaction`; `orgId` is a required argument
 * that comes from `ctx.organizationId` at the route and NEVER from a request
 * body. Durations are not computed here — this module fetches rows and hands
 * them to ./session-metrics.ts, which is pure and therefore testable.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 *
 * `src/lib/operations/journey.ts` answers "who did what, when" by hand-unioning
 * thirteen spines across ~700 lines, because until now nothing tied a row to
 * the unit of work that produced it. Session attribution is the join key that
 * collapses that: `WHERE session_id = $2` on two indexed spines replaces the
 * union. This module is deliberately NOT a thirteenth branch of journey — it is
 * the shape journey is meant to become.
 *
 * ── EVERY READ IS CAPPED, AND SAYS SO ───────────────────────────────────────
 *
 * A busy unbox session produces thousands of events. An uncapped
 * `sessionContents` on a manager dashboard is an outage, and a SILENTLY capped
 * one is worse — it reads as "that's all that happened". So every result
 * carries `truncated` and the cap that produced it. A caller that ignores the
 * flag renders a wrong number; a caller that reads it can page or say "1000+".
 *
 * ── audit_logs IS NOT A SOURCE HERE ─────────────────────────────────────────
 *
 * It has no `organization_id` (2026-08-23c is only the NOT NULL prep), so every
 * read of it inherits a tenant-scoping workaround. `ops_events` and
 * `inventory_events` both carry the column and both now carry `session_id`;
 * those two are the whole source list.
 */

import 'server-only';

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { mapWorkSession, type SessionQueryable } from './work-sessions';
import {
  activeDuration,
  parkedDuration,
  sessionSeries,
  seriesTotals,
  type Duration,
  type SessionMetric,
  type SessionSeriesTotals,
  type TimePunchWindow,
} from './session-metrics';
import type {
  SessionIntervalKind,
  SessionStatus,
  WorkSession,
  WorkSessionInterval,
} from './types';
import type { SessionEventType } from './attribution';

// ── Caps ────────────────────────────────────────────────────────────────────

/**
 * How many event rows one `sessionContents` call will read.
 *
 * 2000 is roughly a full shift of one bench at a scan every ten seconds — big
 * enough that the flag is rare, small enough that the query is a bounded index
 * range scan rather than a table walk. Raise it by paging, never by editing
 * this number, or a single manager refresh becomes a table scan on the largest
 * table in the schema.
 */
export const SESSION_CONTENTS_EVENT_CAP = 2000;

/** How many distinct entities one contents read will resolve and return. */
export const SESSION_CONTENTS_ENTITY_CAP = 500;

/** How many sessions one summary/list call will read. */
export const SESSION_LIST_CAP = 200;

function clamp(value: number | undefined, fallback: number, max: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

// ── Classification vocabularies ─────────────────────────────────────────────
//
// Each of these is the set of event types actually written today, and each is
// greppable so the next writer that should join it can be found. They are code
// constants rather than DB CHECKs for the same reason `ops_events.session_type`
// has no CHECK: the surfaces that produce them widen with the roadmap, and a
// migration per new bench to protect a reporting label is not a trade worth
// making.

/**
 * ops_events event types that represent an operator putting a barcode in front
 * of the reader. Sources: record-scan.ts, unbox-scan-opened-sql.ts,
 * unbox-scan-kind.ts.
 */
export const SESSION_SCAN_EVENT_TYPES = [
  'TRACKING_SCANNED',
  'UNBOX_SCAN_OPENED',
  'RECEIVING_LOOKUP_SCAN',
] as const;

/**
 * How an exception reaches the spine: `recordEntitySignal` writes one
 * `signal_recorded` ops_event per signal, with the kind in the payload.
 * `exception_why` is the receiving-problem kind (SIGNAL_KINDS, registry.ts).
 *
 * Read from the spine rather than from `receiving_exceptions` directly, because
 * that table has no `session_id` and inferring one from timestamps is exactly
 * the manufactured history both session migrations refuse to create.
 */
export const SESSION_EXCEPTION_SIGNAL_KINDS = ['exception_why'] as const;

/**
 * How a photo capture reaches the spine: the serial-unit photos route writes a
 * NOTE inventory_event tagged `payload.source = 'serial-unit-photos'` with the
 * inserted ids in `payload.photo_ids`.
 */
export const SESSION_PHOTO_EVENT_SOURCE = 'serial-unit-photos';

// ── Contents ────────────────────────────────────────────────────────────────

/**
 * What kind of thing a session touched. Union of the explicit-FK subjects
 * `inventory_events` carries and the polymorphic `entity_type` values
 * `ops_events` carries — the two spines have different shapes (see the 08-23d
 * migration header) and this read does not pretend otherwise; it normalizes at
 * the edge instead.
 */
export type SessionEntityType =
  | 'serial_unit'
  | 'receiving_line'
  | 'receiving'
  | 'sku'
  | 'order'
  | 'shipment'
  | 'fba_shipment'
  | 'repair'
  | 'warranty_claim'
  | 'other';

export interface SessionEntityTouch {
  type: SessionEntityType;
  /** Numeric id for FK-backed entities; the sku string for `type: 'sku'`. */
  id: string;
  firstAt: string;
  lastAt: string;
  eventCount: number;
  /**
   * True when NO event for this entity predates this session's first event for
   * it — i.e. this session is where the thing first appears in the record.
   *
   * CREATED AND UPDATED ARE DIFFERENT FACTS and a UI must show them apart: "you
   * received 40 units" and "you moved 40 units" are the same row count and
   * completely different days. The test is a probe against the spine rather
   * than a guess from the event type, so a new creating event type does not
   * have to be added to a list before it counts.
   */
  created: boolean;
}

export interface SessionContents {
  sessionId: number;
  entities: SessionEntityTouch[];
  createdCount: number;
  updatedCount: number;
  /**
   * Scans by ops_event type, not by `SCAN_SESSION_TYPES` — a session has
   * exactly one scan type, so keying the breakdown by it would produce a
   * one-row histogram. The interesting split is WHICH scan.
   */
  scans: { total: number; byEventType: Record<string, number> };
  exceptionCount: number;
  photoCount: number;
  /** True when a cap stopped the read short. Render "1000+", never "1000". */
  truncated: boolean;
  caps: { events: number; entities: number };
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '');
}

/**
 * Everything one session touched.
 *
 * FOUR BOUNDED QUERIES, not one join. Each hits an index built for it
 * (`idx_ie_org_session_time`, `idx_ops_events_org_session_time`), and keeping
 * them separate is what lets each carry its own cap — a session with 5000
 * inventory events and 3 ops events should not lose the ops events to a shared
 * LIMIT.
 */
export async function sessionContents(
  orgId: OrgId,
  sessionId: number,
  opts: { eventCap?: number; entityCap?: number } = {},
  deps: SessionRollupDeps = defaultSessionRollupDeps,
): Promise<SessionContents> {
  const eventCap = clamp(opts.eventCap, SESSION_CONTENTS_EVENT_CAP, SESSION_CONTENTS_EVENT_CAP);
  const entityCap = clamp(opts.entityCap, SESSION_CONTENTS_ENTITY_CAP, SESSION_CONTENTS_ENTITY_CAP);

  return deps.withTenantTransaction(orgId, async (db) => {
    // 1. Entities from the inventory spine. COALESCE picks the most specific
    //    subject the row carries — a row naming both a serial unit and its line
    //    is about the unit, and counting it twice would double every total.
    const inventory = await db.query(
      `WITH touched AS (
         SELECT
           CASE
             WHEN serial_unit_id    IS NOT NULL THEN 'serial_unit'
             WHEN receiving_line_id IS NOT NULL THEN 'receiving_line'
             WHEN receiving_id      IS NOT NULL THEN 'receiving'
             WHEN sku               IS NOT NULL THEN 'sku'
             ELSE 'other'
           END AS entity_type,
           COALESCE(
             serial_unit_id::text, receiving_line_id::text, receiving_id::text, sku, '?'
           ) AS entity_id,
           occurred_at
         FROM inventory_events
         WHERE organization_id = $1 AND session_id = $2
         ORDER BY occurred_at DESC, id DESC
         LIMIT $3
       )
       SELECT entity_type, entity_id,
              MIN(occurred_at) AS first_at,
              MAX(occurred_at) AS last_at,
              COUNT(*)::int    AS n
         FROM touched
        GROUP BY entity_type, entity_id
        ORDER BY MIN(occurred_at)
        LIMIT $4`,
      [orgId, sessionId, eventCap, entityCap],
    );

    // 2. Entities from the ops spine — already polymorphic, so no CASE.
    const ops = await db.query(
      `WITH touched AS (
         SELECT entity_type, entity_id::text AS entity_id, occurred_at
           FROM ops_events
          WHERE organization_id = $1 AND session_id = $2
          ORDER BY occurred_at DESC, id DESC
          LIMIT $3
       )
       SELECT entity_type, entity_id,
              MIN(occurred_at) AS first_at,
              MAX(occurred_at) AS last_at,
              COUNT(*)::int    AS n
         FROM touched
        GROUP BY entity_type, entity_id
        ORDER BY MIN(occurred_at)
        LIMIT $4`,
      [orgId, sessionId, eventCap, entityCap],
    );

    // 3. Scans, exceptions and photos — three counts, one round trip.
    //    Counted from the spines rather than from receiving_exceptions /
    //    photos, neither of which carries a session_id.
    const tallies = await db.query(
      `SELECT
         (SELECT COALESCE(jsonb_object_agg(t.event_type, t.n), '{}'::jsonb)
            FROM (SELECT event_type, COUNT(*)::int AS n
                    FROM ops_events
                   WHERE organization_id = $1 AND session_id = $2
                     AND event_type = ANY($3::text[])
                   GROUP BY event_type) t)                          AS scans_by_type,
         (SELECT COUNT(*)::int FROM ops_events
           WHERE organization_id = $1 AND session_id = $2
             AND event_type = 'signal_recorded'
             AND payload->>'signalKind' = ANY($4::text[]))          AS exception_count,
         (SELECT COALESCE(SUM(
                    CASE WHEN jsonb_typeof(payload->'photo_ids') = 'array'
                         THEN jsonb_array_length(payload->'photo_ids') ELSE 1 END
                  ), 0)::int
            FROM inventory_events
           WHERE organization_id = $1 AND session_id = $2
             AND payload->>'source' = $5)                           AS photo_count`,
      [
        orgId,
        sessionId,
        [...SESSION_SCAN_EVENT_TYPES],
        [...SESSION_EXCEPTION_SIGNAL_KINDS],
        SESSION_PHOTO_EVENT_SOURCE,
      ],
    );

    const merged = new Map<string, SessionEntityTouch>();
    const absorb = (rows: unknown[], normalize: (raw: string) => SessionEntityType) => {
      for (const raw of rows as Array<Record<string, unknown>>) {
        const type = normalize(String(raw.entity_type ?? 'other'));
        const id = String(raw.entity_id ?? '?');
        const key = `${type}:${id}`;
        const firstAt = iso(raw.first_at);
        const lastAt = iso(raw.last_at);
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, {
            type, id, firstAt, lastAt, eventCount: num(raw.n), created: false,
          });
          continue;
        }
        // The same entity touched on both spines is ONE entity. Widen the
        // window and sum the counts rather than emitting it twice.
        existing.eventCount += num(raw.n);
        if (firstAt && firstAt < existing.firstAt) existing.firstAt = firstAt;
        if (lastAt && lastAt > existing.lastAt) existing.lastAt = lastAt;
      }
    };

    absorb(inventory.rows, (raw) => raw as SessionEntityType);
    absorb(ops.rows, normalizeOpsEntityType);

    const entities = [...merged.values()]
      .sort((a, b) => (a.firstAt < b.firstAt ? -1 : a.firstAt > b.firstAt ? 1 : 0))
      .slice(0, entityCap);

    await markCreated(db, orgId, sessionId, entities);

    const tally = (tallies.rows[0] ?? {}) as Record<string, unknown>;
    const byEventType = (tally.scans_by_type ?? {}) as Record<string, number>;
    const scanTotal = Object.values(byEventType).reduce((sum, n) => sum + num(n), 0);

    return {
      sessionId,
      entities,
      createdCount: entities.filter((e) => e.created).length,
      updatedCount: entities.filter((e) => !e.created).length,
      scans: { total: scanTotal, byEventType },
      exceptionCount: num(tally.exception_count),
      photoCount: num(tally.photo_count),
      truncated:
        inventory.rows.length >= entityCap ||
        ops.rows.length >= entityCap ||
        merged.size > entityCap,
      caps: { events: eventCap, entities: entityCap },
    };
  });
}

/**
 * `ops_events.entity_type` uses the surface registry's vocabulary
 * (OPS_EVENT_ENTITY_TYPES); the inventory spine uses column names. Map the
 * overlap onto one set so a serial unit touched by both spines is one entity.
 */
function normalizeOpsEntityType(raw: string): SessionEntityType {
  switch (raw) {
    case 'serial_unit':
    case 'receiving_line':
    case 'receiving':
    case 'order':
    case 'shipment':
    case 'fba_shipment':
    case 'repair':
    case 'warranty_claim':
      return raw;
    default:
      return 'other';
  }
}

/**
 * Decide created-vs-updated for each entity with one probe per entity.
 *
 * The probe asks: does any event for this entity predate the session's first
 * event for it? That is one index seek on `idx_ie_serial_time` /
 * `idx_ops_events_*` per entity — bounded by `entityCap`, which is why the cap
 * is not a nicety. Doing it as a single window function over the spine would
 * scan every event for every entity in the table.
 *
 * Only serial units, lines and receivings are probed. A `sku` is not created by
 * a session (it is a catalogue row that long predates any scan) and an `other`
 * has no id space to probe, so both stay `created: false` rather than being
 * guessed at.
 */
async function markCreated(
  db: SessionQueryable,
  orgId: OrgId,
  sessionId: number,
  entities: SessionEntityTouch[],
): Promise<void> {
  const COLUMN: Partial<Record<SessionEntityType, string>> = {
    serial_unit: 'serial_unit_id',
    receiving_line: 'receiving_line_id',
    receiving: 'receiving_id',
  };

  for (const entity of entities) {
    const column = COLUMN[entity.type];
    if (!column) continue;
    const id = Number(entity.id);
    if (!Number.isSafeInteger(id)) continue;

    // BOTH spines. An entity first seen on ops_events and only later touched
    // on the inventory spine would otherwise be reported as created by whichever
    // session happened to write the first inventory_event — a claim about a
    // thing's origin, made from half the record.
    const { rows } = await db.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM inventory_events
            WHERE organization_id = $1
              AND ${column} = $2
              AND occurred_at < $3::timestamptz
              AND session_id IS DISTINCT FROM $4
         )
         OR EXISTS (
           SELECT 1 FROM ops_events
            WHERE organization_id = $1
              AND entity_type = $5
              AND entity_id = $2::bigint
              AND occurred_at < $3::timestamptz
              AND session_id IS DISTINCT FROM $4
         ) AS earlier`,
      [orgId, id, entity.firstAt, sessionId, entity.type],
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    entity.created = row?.earlier === false;
  }
}

// ── Per-staff / per-org series ──────────────────────────────────────────────

export interface SessionRange {
  /** Inclusive ISO lower bound on `started_at`. */
  from: string;
  /** Exclusive ISO upper bound on `started_at`. */
  to: string;
}

export interface SessionListFilters {
  kind?: 'scan' | 'task';
  sessionType?: SessionEventType;
  status?: SessionStatus;
  surfaceKey?: string;
  purposeId?: number;
  /** Search title, notes, wrap_up, purpose label. Never groups by title. */
  q?: string;
  limit?: number;
}

export interface SessionPurposeRef {
  id: number;
  key: string;
  label: string;
}

export interface WorkSessionWithMetrics {
  session: WorkSession;
  purpose: SessionPurposeRef | null;
  staffName: string | null;
  metric: SessionMetric;
}

export interface SessionSeriesResult {
  sessions: WorkSessionWithMetrics[];
  totals: SessionSeriesTotals;
  /** Server clock at read time — what provisional durations were measured to. */
  dbNow: string;
  truncated: boolean;
  cap: number;
}

export interface SessionRollupDeps {
  withTenantTransaction: <T>(orgId: OrgId, fn: (db: SessionQueryable) => Promise<T>) => Promise<T>;
}

export const defaultSessionRollupDeps: SessionRollupDeps = {
  withTenantTransaction: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client)),
};

const SESSION_COLUMNS = `
  ws.id, ws.organization_id, ws.kind, ws.scan_type, ws.armed, ws.surface_key, ws.status, ws.version,
  ws.staff_id, ws.claimed_by_staff_id, ws.claim_expires_at, ws.device_id, ws.client_event_id,
  ws.started_at, ws.ended_at, ws.state, ws.title, ws.purpose_id, ws.notes, ws.wrap_up, ws.wrap_up_source
`;

function mapInterval(row: Record<string, unknown>): WorkSessionInterval {
  return {
    id: num(row.id),
    organizationId: String(row.organization_id),
    sessionId: num(row.session_id),
    kind: row.kind as SessionIntervalKind,
    startedAt: iso(row.started_at),
    endedAt: row.ended_at == null ? null : iso(row.ended_at),
    staffId: row.staff_id == null ? null : num(row.staff_id),
  };
}

/**
 * The shared read: sessions in a window, their intervals, the staff's payroll
 * punches, and the DB clock — all in ONE transaction so every timestamp is
 * consistent with every other and `dbNow` is the same instant that closed the
 * open intervals.
 *
 * PUNCHES ARE FETCHED ONLY WHEN A STAFF FILTER NARROWS THE READ. Gap
 * classification is per-person (rule 3 in session-metrics.ts) and an org-wide
 * read has no single person's shift to compare against — so it passes `null`,
 * and gaps come back 'unknown' rather than being called idle on someone's
 * behalf.
 */
async function readSeries(
  db: SessionQueryable,
  orgId: OrgId,
  range: SessionRange,
  staffId: number | null,
  filters: SessionListFilters,
): Promise<SessionSeriesResult> {
  const cap = clamp(filters.limit, SESSION_LIST_CAP, SESSION_LIST_CAP);

  const where: string[] = ['ws.organization_id = $1', 'ws.started_at >= $2::timestamptz', 'ws.started_at < $3::timestamptz'];
  const params: unknown[] = [orgId, range.from, range.to];
  const push = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('$?', `$${params.length}`));
  };

  if (staffId != null) {
    params.push(staffId);
    where.push(`(ws.staff_id = $${params.length} OR ws.claimed_by_staff_id = $${params.length})`);
  }
  if (filters.kind) push('ws.kind = $?', filters.kind);
  if (filters.status) push('ws.status = $?', filters.status);
  if (filters.surfaceKey) push('ws.surface_key = $?', filters.surfaceKey);
  if (filters.purposeId) push('ws.purpose_id = $?', filters.purposeId);
  if (filters.q?.trim()) {
    params.push(`%${filters.q.trim()}%`);
    const i = params.length;
    where.push(
      `(ws.title ILIKE $${i} OR ws.notes ILIKE $${i} OR ws.wrap_up ILIKE $${i} OR p.label ILIKE $${i})`,
    );
  }
  if (filters.sessionType === 'task') {
    where.push(`ws.kind = 'task'`);
  } else if (filters.sessionType) {
    push('ws.scan_type = $?', filters.sessionType);
  }

  params.push(cap);
  const sessionRows = await db.query(
    `SELECT ${SESSION_COLUMNS},
            p.key AS purpose_key, p.label AS purpose_label,
            st.name AS staff_name
       FROM work_sessions ws
       LEFT JOIN work_session_purposes p ON p.id = ws.purpose_id
       LEFT JOIN staff st ON st.id = ws.staff_id
      WHERE ${where.join(' AND ')}
      ORDER BY ws.started_at DESC, ws.id DESC
      LIMIT $${params.length}`,
    params,
  );

  const extras = new Map<number, { purpose: SessionPurposeRef | null; staffName: string | null }>();
  const sessions = (sessionRows.rows as Array<Record<string, unknown>>).map((row) => {
    const session = mapWorkSession(row);
    extras.set(session.id, {
      purpose:
        session.purposeId != null && row.purpose_key != null
          ? { id: session.purposeId, key: String(row.purpose_key), label: String(row.purpose_label ?? '') }
          : null,
      staffName: row.staff_name == null ? null : String(row.staff_name),
    });
    return session;
  });
  const ids = sessions.map((s) => s.id);

  const intervalRows = ids.length
    ? await db.query(
        `SELECT id, organization_id, session_id, kind, started_at, ended_at, staff_id
           FROM work_session_intervals
          WHERE organization_id = $1 AND session_id = ANY($2::bigint[])
          ORDER BY session_id, started_at`,
        [orgId, ids],
      )
    : { rows: [] as unknown[] };

  const punchRows =
    staffId == null
      ? null
      : await db.query(
          `SELECT punched_in_at, punched_out_at FROM time_punches
            WHERE staff_id = $1
              AND punched_in_at < $3::timestamptz
              AND (punched_out_at IS NULL OR punched_out_at > $2::timestamptz)
            ORDER BY punched_in_at`,
          [staffId, range.from, range.to],
        );

  const clockRow = await db.query('SELECT now() AS db_now', []);
  const dbNow = iso((clockRow.rows[0] as Record<string, unknown>).db_now);

  const intervals = (intervalRows.rows as Array<Record<string, unknown>>).map(mapInterval);
  const punches: TimePunchWindow[] | null =
    punchRows === null
      ? null
      : (punchRows.rows as Array<Record<string, unknown>>).map((r) => ({
          punchedInAt: iso(r.punched_in_at),
          punchedOutAt: r.punched_out_at == null ? null : iso(r.punched_out_at),
        }));

  const series = sessionSeries({ sessions, intervals, punches, dbNow });
  const byId = new Map(series.map((m) => [m.sessionId, m]));

  return {
    // Oldest-first, matching the series: a report reads down the day, and
    // `gapBefore` on the first row is null only if the order agrees.
    sessions: series.map((metric) => {
      const extra = extras.get(metric.sessionId);
      return {
        session: sessions.find((s) => s.id === metric.sessionId)!,
        purpose: extra?.purpose ?? null,
        staffName: extra?.staffName ?? null,
        metric: byId.get(metric.sessionId)!,
      };
    }),
    totals: seriesTotals(series),
    dbNow,
    truncated: sessions.length >= cap,
    cap,
  };
}

/** One staffer's sessions in a window, with durations and the gaps between. */
export async function listSessionsForStaff(
  orgId: OrgId,
  staffId: number,
  range: SessionRange,
  filters: SessionListFilters = {},
  deps: SessionRollupDeps = defaultSessionRollupDeps,
): Promise<SessionSeriesResult> {
  return deps.withTenantTransaction(orgId, (db) => readSeries(db, orgId, range, staffId, filters));
}

/**
 * Every session in the org for a window.
 *
 * Gaps come back 'unknown' here by design — see readSeries. An org-wide "idle
 * time" number computed across different people's shifts is not a measurement
 * of anything, and producing one would be the first step toward a dashboard
 * that ranks staff on an artifact of how the query was written.
 */
export async function listSessionsForOrg(
  orgId: OrgId,
  range: SessionRange,
  filters: SessionListFilters = {},
  deps: SessionRollupDeps = defaultSessionRollupDeps,
): Promise<SessionSeriesResult> {
  return deps.withTenantTransaction(orgId, (db) => readSeries(db, orgId, range, null, filters));
}

// ── Attribution health ──────────────────────────────────────────────────────

/**
 * How many events landed in this window with NO session.
 *
 * Async attribution is invisible when it works and dangerous when it silently
 * does not: a broken stamp produces a session that looks empty rather than an
 * error anyone sees. This is the number that makes that visible — it should be
 * flat, and a rising line means a writer lost its session.
 *
 * `NO_SESSION` call sites are the expected floor, not a bug. Compare the trend,
 * not the absolute.
 */
export interface UnattributedEventCounts {
  inventoryEvents: number;
  opsEvents: number;
  from: string;
  to: string;
}

export async function countUnattributedEvents(
  orgId: OrgId,
  range: SessionRange,
  deps: SessionRollupDeps = defaultSessionRollupDeps,
): Promise<UnattributedEventCounts> {
  return deps.withTenantTransaction(orgId, async (db) => {
    const { rows } = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM inventory_events
           WHERE organization_id = $1 AND session_id IS NULL
             AND occurred_at >= $2::timestamptz AND occurred_at < $3::timestamptz) AS inv,
         (SELECT COUNT(*)::int FROM ops_events
           WHERE organization_id = $1 AND session_id IS NULL
             AND occurred_at >= $2::timestamptz AND occurred_at < $3::timestamptz) AS ops`,
      [orgId, range.from, range.to],
    );
    const row = (rows[0] ?? {}) as Record<string, unknown>;
    return {
      inventoryEvents: num(row.inv),
      opsEvents: num(row.ops),
      from: range.from,
      to: range.to,
    };
  });
}

export interface SessionReport {
  session: WorkSession;
  purpose: SessionPurposeRef | null;
  staffName: string | null;
  active: Duration;
  parked: Duration;
  intervals: WorkSessionInterval[];
  contents: SessionContents;
  dbNow: string;
}

/** One session as a timesheet row: title, purpose, Σ active, entities touched. */
export async function getSessionReport(
  orgId: OrgId,
  sessionId: number,
  deps: SessionRollupDeps = defaultSessionRollupDeps,
): Promise<SessionReport | null> {
  const header = await deps.withTenantTransaction(orgId, async (db) => {
    const { rows } = await db.query(
      `SELECT ${SESSION_COLUMNS},
              p.key AS purpose_key, p.label AS purpose_label,
              st.name AS staff_name
         FROM work_sessions ws
         LEFT JOIN work_session_purposes p ON p.id = ws.purpose_id
         LEFT JOIN staff st ON st.id = ws.staff_id
        WHERE ws.organization_id = $1 AND ws.id = $2`,
      [orgId, sessionId],
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const session = mapWorkSession(row);
    const intervalRows = await db.query(
      `SELECT id, organization_id, session_id, kind, started_at, ended_at, staff_id
         FROM work_session_intervals
        WHERE organization_id = $1 AND session_id = $2
        ORDER BY started_at`,
      [orgId, sessionId],
    );
    const intervals = (intervalRows.rows as Array<Record<string, unknown>>).map(mapInterval);
    const clockRow = await db.query('SELECT now() AS db_now', []);
    const dbNow = iso((clockRow.rows[0] as Record<string, unknown>).db_now);

    return {
      session,
      purpose:
        session.purposeId != null && row.purpose_key != null
          ? { id: session.purposeId, key: String(row.purpose_key), label: String(row.purpose_label ?? '') }
          : null,
      staffName: row.staff_name == null ? null : String(row.staff_name),
      active: activeDuration(session, intervals, dbNow),
      parked: parkedDuration(session, intervals, dbNow),
      intervals,
      dbNow,
    };
  });
  if (!header) return null;
  return { ...header, contents: await sessionContents(orgId, sessionId, {}, deps) };
}
