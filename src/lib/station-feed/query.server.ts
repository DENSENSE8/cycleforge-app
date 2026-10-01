import 'server-only';

import type { QueryResultRow } from 'pg';
import { addDaysToDateKey, warehouseCivilTimeToInstant } from '@/utils/date';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { decodeStationFeedCursor, encodeStationFeedCursor, type StationFeedCursor } from './cursor';
import {
  compareStationFeedItems,
  mapMobileScanRow,
  mapOpsEventRow,
  mapStationActivityRow,
  STATION_FEED_ACTIVITY_JOB,
  STATION_FEED_ACTIVITY_TYPES,
  STATION_FEED_OPS_EVENT_JOB,
  STATION_FEED_OPS_EVENT_TYPES,
  type MobileScanFeedRow,
  type OpsEventFeedRow,
  type StationActivityFeedRow,
} from './event-map';
import {
  DEFAULT_STATION_FEED_FILTERS,
  STATION_FEED_DEFAULT_LIMIT,
  STATION_FEED_JOBS,
  STATION_FEED_MAX_LIMIT,
  STATION_FEED_OUTCOMES,
  STATION_FEED_SORTS,
  type StationFeedJob,
  type StationFeedOutcome,
  type StationFeedQuery,
  type StationFeedResponse,
  type StationFeedSort,
} from './types';

interface ParamReader {
  get(name: string): string | null;
  getAll?(name: string): string[];
}

export class StationFeedInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StationFeedInputError';
  }
}

function values(params: ParamReader, name: string): string[] {
  const raw = params.getAll?.(name) ?? [];
  const source = raw.length > 0 ? raw : [params.get(name) ?? ''];
  return [...new Set(source.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean))];
}

function positiveIds(params: ParamReader, name: string): number[] {
  const parsed = values(params, name).map(Number);
  if (parsed.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new StationFeedInputError(`${name} must contain positive integer ids`);
  }
  return parsed;
}

function enumValues<T extends string>(params: ParamReader, name: string, allowed: readonly T[]): T[] {
  const parsed = values(params, name);
  if (parsed.some((value) => !allowed.includes(value as T))) {
    throw new StationFeedInputError(`${name} contains an unsupported value`);
  }
  return parsed as T[];
}

function dateInstant(raw: string | null, end: boolean): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const dateKey = end ? addDaysToDateKey(value, 1) : value;
    const instant = warehouseCivilTimeToInstant(dateKey, '00:00');
    if (!instant) throw new StationFeedInputError(`${end ? 'to' : 'from'} is not a valid warehouse date`);
    return instant.toISOString();
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new StationFeedInputError(`${end ? 'to' : 'from'} must be an ISO timestamp or YYYY-MM-DD`);
  }
  return instant.toISOString();
}

function optionalPositiveInt(raw: string | null, name: string): number | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new StationFeedInputError(`${name} must be a non-negative integer`);
  return parsed;
}

export function parseStationFeedQuery(params: ParamReader): StationFeedQuery {
  const rawLimit = String(params.get('limit') ?? '').trim();
  const limit = rawLimit ? Number(rawLimit) : STATION_FEED_DEFAULT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > STATION_FEED_MAX_LIMIT) {
    throw new StationFeedInputError(`limit must be between 1 and ${STATION_FEED_MAX_LIMIT}`);
  }
  const sortRaw = String(params.get('sort') ?? DEFAULT_STATION_FEED_FILTERS.sort).trim();
  if (!STATION_FEED_SORTS.includes(sortRaw as StationFeedSort)) {
    throw new StationFeedInputError('sort must be newest or oldest');
  }
  const beforeRaw = String(params.get('before') ?? '').trim() || null;
  const before = beforeRaw ? decodeStationFeedCursor(beforeRaw) : null;
  if (beforeRaw && !before) throw new StationFeedInputError('before is not a valid station-feed cursor');
  if (before && before.sort !== sortRaw) throw new StationFeedInputError('before cursor sort does not match sort');

  const afterSalId = optionalPositiveInt(params.get('afterSalId'), 'afterSalId');
  const afterOpsEventId = optionalPositiveInt(params.get('afterOpsEventId'), 'afterOpsEventId');
  const afterMobileScanId = optionalPositiveInt(params.get('afterMobileScanId'), 'afterMobileScanId');
  if (beforeRaw && (afterSalId != null || afterOpsEventId != null || afterMobileScanId != null)) {
    throw new StationFeedInputError('before cannot be combined with realtime watermarks');
  }

  const from = dateInstant(params.get('from'), false);
  const to = dateInstant(params.get('to'), true);
  if (from && to && Date.parse(from) >= Date.parse(to)) {
    throw new StationFeedInputError('from must be earlier than to');
  }

  return {
    limit,
    before: beforeRaw,
    afterSalId,
    afterOpsEventId,
    afterMobileScanId,
    staffIds: positiveIds(params, 'staff'),
    jobs: enumValues<StationFeedJob>(params, 'job', STATION_FEED_JOBS),
    outcomes: enumValues<StationFeedOutcome>(params, 'outcome', STATION_FEED_OUTCOMES),
    from,
    to,
    sort: sortRaw as StationFeedSort,
  };
}

export interface StationFeedQueryDeps {
  run<T extends QueryResultRow>(orgId: OrgId, sql: string, params: readonly unknown[]): Promise<T[]>;
}

const defaultDeps: StationFeedQueryDeps = {
  run: async <T extends QueryResultRow>(orgId: OrgId, sql: string, params: readonly unknown[]) =>
    (await tenantQuery<T>(orgId, sql, [...params])).rows,
};

class SqlWhere {
  readonly clauses: string[] = [];
  readonly params: unknown[];

  constructor(orgId: OrgId) {
    this.params = [orgId];
  }

  bind(value: unknown, cast = ''): string {
    this.params.push(value);
    return `$${this.params.length}${cast}`;
  }

  add(clause: string): void {
    this.clauses.push(clause);
  }

  sql(): string {
    return this.clauses.length > 0 ? ` AND ${this.clauses.join(' AND ')}` : '';
  }
}

function addCommonPredicates(where: SqlWhere, query: StationFeedQuery, alias: string): void {
  if (query.staffIds.length > 0) where.add(`${alias}.staff_id = ANY(${where.bind(query.staffIds, '::int[]')})`);
  if (query.from) where.add(`${alias}.created_at >= ${where.bind(query.from, '::timestamptz')}`);
  if (query.to) where.add(`${alias}.created_at < ${where.bind(query.to, '::timestamptz')}`);
}

function addCursorPredicate(
  where: SqlWhere,
  query: StationFeedQuery,
  cursor: StationFeedCursor | null,
  alias: string,
  sourceRank: 0 | 1 | 2,
): void {
  if (!cursor) return;
  const at = where.bind(cursor.occurredAt, '::timestamptz');
  const id = where.bind(cursor.sourceId, '::bigint');
  if (query.sort === 'newest') {
    where.add(`(${alias}.created_at < ${at} OR (${alias}.created_at = ${at} AND (${sourceRank} > ${cursor.sourceRank} OR (${sourceRank} = ${cursor.sourceRank} AND ${alias}.id < ${id}))))`);
  } else {
    where.add(`(${alias}.created_at > ${at} OR (${alias}.created_at = ${at} AND (${sourceRank} > ${cursor.sourceRank} OR (${sourceRank} = ${cursor.sourceRank} AND ${alias}.id > ${id}))))`);
  }
}

function salActivityTypes(jobs: readonly StationFeedJob[]): string[] {
  if (jobs.length === 0) return [...STATION_FEED_ACTIVITY_TYPES];
  const wanted = new Set(jobs);
  return STATION_FEED_ACTIVITY_TYPES.filter((type) => wanted.has(STATION_FEED_ACTIVITY_JOB[type]));
}

function opsEventTypes(jobs: readonly StationFeedJob[]): string[] {
  if (jobs.length === 0) return [...STATION_FEED_OPS_EVENT_TYPES];
  const wanted = new Set(jobs);
  return STATION_FEED_OPS_EVENT_TYPES.filter((type) => wanted.has(STATION_FEED_OPS_EVENT_JOB[type]));
}

function addOpsCommonPredicates(where: SqlWhere, query: StationFeedQuery, alias: string): void {
  if (query.staffIds.length > 0) where.add(`${alias}.actor_staff_id = ANY(${where.bind(query.staffIds, '::int[]')})`);
  if (query.from) where.add(`${alias}.occurred_at >= ${where.bind(query.from, '::timestamptz')}`);
  if (query.to) where.add(`${alias}.occurred_at < ${where.bind(query.to, '::timestamptz')}`);
}

function addSalOutcomePredicate(where: SqlWhere, outcomes: readonly StationFeedOutcome[], alias: string): void {
  if (outcomes.length === 0) return;
  const clauses: string[] = [];
  if (outcomes.includes('committed')) {
    clauses.push(`NOT (COALESCE(${alias}.metadata->>'outcome', '') = 'needs_attention' OR (${alias}.activity_type = 'QC_RESULT_RECORDED' AND ${alias}.metadata->>'passed' = 'false'))`);
  }
  if (outcomes.includes('needs_attention')) {
    clauses.push(`(COALESCE(${alias}.metadata->>'outcome', '') = 'needs_attention' OR (${alias}.activity_type = 'QC_RESULT_RECORDED' AND ${alias}.metadata->>'passed' = 'false'))`);
  }
  // `identified` is resolver-only; if it is the sole selection there are no SAL rows.
  where.add(clauses.length > 0 ? `(${clauses.join(' OR ')})` : 'FALSE');
}

function addMseOutcomePredicate(where: SqlWhere, outcomes: readonly StationFeedOutcome[], alias: string): void {
  if (outcomes.length === 0) return;
  const clauses: string[] = [];
  if (outcomes.includes('identified')) clauses.push(`${alias}.match_outcome = 'single'`);
  if (outcomes.includes('needs_attention')) clauses.push(`${alias}.match_outcome <> 'single'`);
  where.add(clauses.length > 0 ? `(${clauses.join(' OR ')})` : 'FALSE');
}

function buildSalQuery(orgId: OrgId, query: StationFeedQuery, cursor: StationFeedCursor | null) {
  const where = new SqlWhere(orgId);
  const types = salActivityTypes(query.jobs);
  where.add(types.length > 0 ? `sal.activity_type = ANY(${where.bind(types, '::text[]')})` : 'FALSE');
  where.add(`sal.metadata->>'origin' = 'phone'`);
  addCommonPredicates(where, query, 'sal');
  addSalOutcomePredicate(where, query.outcomes, 'sal');
  if (query.afterSalId != null) where.add(`sal.id > ${where.bind(query.afterSalId, '::bigint')}`);
  addCursorPredicate(where, query, cursor, 'sal', 0);
  const limit = where.bind(query.limit + 1, '::int');
  const direction = query.sort === 'newest' ? 'DESC' : 'ASC';

  return {
    params: where.params,
    sql: `WITH candidate AS MATERIALIZED (
      SELECT sal.id, sal.organization_id, sal.created_at, sal.station, sal.activity_type,
             sal.staff_id, sal.shipment_id, sal.scan_ref, sal.fnsku, sal.notes,
             sal.metadata, sal.order_row_id
        FROM station_activity_logs sal
       WHERE sal.organization_id = $1${where.sql()}
       ORDER BY sal.created_at ${direction}, sal.id ${direction}
       LIMIT ${limit}
    )
    SELECT c.id, c.created_at, c.station, c.activity_type, c.staff_id,
           s.name AS staff_name, s.avatar_photo_id, c.shipment_id, c.scan_ref,
           c.fnsku, c.notes, c.metadata, o.id AS order_row_id, o.order_id,
           o.status AS order_status, o.sku AS order_sku,
           sc.product_title AS catalog_product_title,
           cxi.external_name AS zoho_item_title, o.product_title AS order_product_title,
           sc.image_url AS catalog_image_url,
           NULL::bigint AS listing_cover_photo_id
      FROM candidate c
      LEFT JOIN staff s
        ON s.id = c.staff_id AND s.organization_id = c.organization_id
      LEFT JOIN LATERAL (
        SELECT ord.id, ord.order_id, ord.status, ord.sku, ord.product_title, ord.sku_catalog_id
          FROM orders ord
         WHERE ord.organization_id = c.organization_id
           AND (
             ord.id = c.order_row_id
             OR ord.id = CASE
               WHEN COALESCE(c.metadata->>'order_row_id', '') ~ '^[1-9][0-9]*$'
               THEN (c.metadata->>'order_row_id')::bigint
               ELSE NULL
             END
             OR (c.order_row_id IS NULL AND ord.shipment_id = c.shipment_id)
           )
         ORDER BY
           (ord.id = c.order_row_id) DESC,
           (ord.id = CASE
             WHEN COALESCE(c.metadata->>'order_row_id', '') ~ '^[1-9][0-9]*$'
             THEN (c.metadata->>'order_row_id')::bigint
             ELSE NULL
           END) DESC,
           ord.id DESC
         LIMIT 1
      ) o ON true
      LEFT JOIN sku_catalog sc
        ON sc.id = o.sku_catalog_id AND sc.organization_id = c.organization_id
      LEFT JOIN LATERAL (
        SELECT x.external_name
          FROM catalog_external_ids x
         WHERE x.sku_catalog_id = sc.id
           AND x.organization_id = c.organization_id
           AND x.provider = 'zoho'
         ORDER BY x.id
         LIMIT 1
      ) cxi ON true
     ORDER BY c.created_at ${direction}, c.id ${direction}`,
  };
}

function buildOpsQuery(orgId: OrgId, query: StationFeedQuery, cursor: StationFeedCursor | null) {
  const where = new SqlWhere(orgId);
  const types = opsEventTypes(query.jobs);
  where.add(types.length > 0 ? `oe.event_type = ANY(${where.bind(types, '::text[]')})` : 'FALSE');
  where.add(`oe.payload->>'origin' = 'phone'`);
  addOpsCommonPredicates(where, query, 'oe');
  if (query.outcomes.length > 0 && !query.outcomes.includes('committed')) where.add('FALSE');
  if (query.afterOpsEventId != null) where.add(`oe.id > ${where.bind(query.afterOpsEventId, '::bigint')}`);
  addCursorPredicate(where, query, cursor, 'oe', 1);
  const limit = where.bind(query.limit + 1, '::int');
  const direction = query.sort === 'newest' ? 'DESC' : 'ASC';

  return {
    params: where.params,
    sql: `WITH candidate AS MATERIALIZED (
      SELECT oe.id, oe.organization_id, oe.occurred_at, oe.event_type,
             oe.entity_type, oe.entity_id, oe.actor_staff_id,
             oe.workflow_node_id, oe.payload
        FROM ops_events oe
       WHERE oe.organization_id = $1${where.sql()}
       ORDER BY oe.occurred_at ${direction}, oe.id ${direction}
       LIMIT ${limit}
    )
    SELECT c.id, c.occurred_at, c.event_type, c.entity_type, c.entity_id,
           c.actor_staff_id, s.name AS staff_name, s.avatar_photo_id,
           c.workflow_node_id, c.payload
      FROM candidate c
      LEFT JOIN staff s
        ON s.id = c.actor_staff_id AND s.organization_id = c.organization_id
     ORDER BY c.occurred_at ${direction}, c.id ${direction}`,
  };
}

function buildMseQuery(orgId: OrgId, query: StationFeedQuery, cursor: StationFeedCursor | null) {
  const where = new SqlWhere(orgId);
  where.add(`mse.organization_id = $1`);
  if (query.jobs.length > 0 && !query.jobs.includes('identify')) where.add('FALSE');
  addCommonPredicates(where, query, 'mse');
  addMseOutcomePredicate(where, query.outcomes, 'mse');
  if (query.afterMobileScanId != null) where.add(`mse.id > ${where.bind(query.afterMobileScanId, '::bigint')}`);
  addCursorPredicate(where, query, cursor, 'mse', 2);
  where.add(`NOT EXISTS (
    SELECT 1 FROM station_activity_logs committed
     WHERE committed.organization_id = mse.organization_id
       AND committed.metadata->>'origin' = 'phone'
       AND committed.metadata->>'mobile_scan_event_id' = mse.id::text
  )`);
  where.add(`NOT EXISTS (
    SELECT 1 FROM ops_events committed_ops
     WHERE committed_ops.organization_id = mse.organization_id
       AND committed_ops.payload->>'origin' = 'phone'
       AND committed_ops.payload->>'mobile_scan_event_id' = mse.id::text
  )`);
  const limit = where.bind(query.limit + 1, '::int');
  const direction = query.sort === 'newest' ? 'DESC' : 'ASC';

  return {
    params: where.params,
    sql: `WITH candidate AS MATERIALIZED (
      SELECT mse.id, mse.organization_id, mse.created_at, mse.staff_id,
             mse.raw_value, mse.normalized, mse.kind, mse.match_outcome,
             mse.routed_to, mse.matched_order_id
        FROM mobile_scan_events mse
       WHERE mse.organization_id = $1${where.sql()}
       ORDER BY mse.created_at ${direction}, mse.id ${direction}
       LIMIT ${limit}
    )
    SELECT c.id, c.created_at, c.staff_id, s.name AS staff_name,
           s.avatar_photo_id, c.raw_value, c.normalized, c.kind,
           c.match_outcome, c.routed_to, c.matched_order_id,
           o.id AS order_row_id, o.order_id, o.status AS order_status,
           o.sku AS order_sku, sc.product_title AS catalog_product_title,
           cxi.external_name AS zoho_item_title, o.product_title AS order_product_title,
           sc.image_url AS catalog_image_url,
           NULL::bigint AS listing_cover_photo_id
      FROM candidate c
      LEFT JOIN staff s ON s.id = c.staff_id AND s.organization_id = c.organization_id
      LEFT JOIN LATERAL (
        SELECT ord.id, ord.order_id, ord.status, ord.sku, ord.product_title, ord.sku_catalog_id
          FROM orders ord
         WHERE ord.organization_id = c.organization_id
           AND ord.order_id = c.matched_order_id
         ORDER BY ord.id DESC
         LIMIT 1
      ) o ON true
      LEFT JOIN sku_catalog sc
        ON sc.id = o.sku_catalog_id AND sc.organization_id = c.organization_id
      LEFT JOIN LATERAL (
        SELECT x.external_name
          FROM catalog_external_ids x
         WHERE x.sku_catalog_id = sc.id
           AND x.organization_id = c.organization_id
           AND x.provider = 'zoho'
         ORDER BY x.id
         LIMIT 1
      ) cxi ON true
     ORDER BY c.created_at ${direction}, c.id ${direction}`,
  };
}

interface WatermarkRow extends QueryResultRow {
  sal_id: number | string | null;
  ops_id: number | string | null;
  mse_id: number | string | null;
}

function numericId(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function queryStationLiveFeed(
  orgId: OrgId,
  query: StationFeedQuery,
  deps: StationFeedQueryDeps = defaultDeps,
): Promise<StationFeedResponse> {
  const cursor = query.before ? decodeStationFeedCursor(query.before) : null;
  const sal = buildSalQuery(orgId, query, cursor);
  const ops = buildOpsQuery(orgId, query, cursor);
  const mse = buildMseQuery(orgId, query, cursor);
  const [salRows, opsRows, mseRows, watermarkRows] = await Promise.all([
    deps.run<StationActivityFeedRow & QueryResultRow>(orgId, sal.sql, sal.params),
    deps.run<OpsEventFeedRow & QueryResultRow>(orgId, ops.sql, ops.params),
    deps.run<MobileScanFeedRow & QueryResultRow>(orgId, mse.sql, mse.params),
    deps.run<WatermarkRow>(orgId, `SELECT
      COALESCE((SELECT MAX(id) FROM station_activity_logs WHERE organization_id = $1), 0) AS sal_id,
      COALESCE((SELECT MAX(id) FROM ops_events WHERE organization_id = $1), 0) AS ops_id,
      COALESCE((SELECT MAX(id) FROM mobile_scan_events WHERE organization_id = $1), 0) AS mse_id`, [orgId]),
  ]);

  const items = [
    ...salRows.map(mapStationActivityRow),
    ...opsRows.map(mapOpsEventRow),
    ...mseRows.map(mapMobileScanRow),
  ].filter((item): item is NonNullable<typeof item> => item != null)
    .sort((a, b) => compareStationFeedItems(a, b, query.sort));
  const page = items.slice(0, query.limit);
  const last = page[page.length - 1];
  const watermark = watermarkRows[0];
  return {
    items: page,
    watermark: {
      stationActivityId: numericId(watermark?.sal_id),
      opsEventId: numericId(watermark?.ops_id),
      mobileScanEventId: numericId(watermark?.mse_id),
    },
    nextBefore: items.length > query.limit && last ? encodeStationFeedCursor(last, query.sort) : null,
  };
}
