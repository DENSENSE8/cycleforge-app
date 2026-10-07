/**
 * Arrival pairing — the package read, its two actions (urgency, place) and
 * the unbox queue. The wire shapes are `arrival-contract.ts`; this is the IO
 * plus the pure decisions they share (urgency precedence, which location a
 * scan names, the order Unbox takes packages).
 *
 * Operator rulings 2026-10-04: urgency lives on the package (Urgent writes
 * `receiving_carton.priority_tier = 0`, Not urgent writes 2, clearing writes
 * NULL); a package pairs to ANY active location with a barcode. Ruling
 * 2026-10-05: locations are urgency-agnostic — identification only.
 */

import 'server-only';

import type { PoolClient } from 'pg';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordOpsEvent, type RecordOpsEventInput } from '@/lib/ops-events';
import { findPendingOrderSkuMatches } from '@/lib/receiving/pending-order-match';
import { upsertReceivingTriage } from '@/lib/receiving/streets/carton-street-write';
import { CLAIM_EXCEPTION_CODES } from '@/lib/receiving/exception-codes';
import { RECEIVING_LINE_IMAGE_URL_SQL } from '@/lib/receiving/lines/sql-receiving-image';
import {
  SKU_CATALOG_JOIN_ON_SQL,
  UNFOUND_PO_TITLE_STUB,
  ZOHO_ITEM_TITLE_SQL,
  resolveSkuIdentityTitle,
} from '@/lib/sku/sku-identity-law';
import { sourcePlatformLabel } from '@/lib/source-platform';
import { arrivalTierLabel, resolveArrivalTier } from '@/lib/receiving/arrival-tier';
import { normalizeShelfCode } from '@/lib/barcode-routing';
import {
  NOT_URGENT_TIER,
  URGENT_TIER,
  tierIsUrgent,
  type ArrivalLocationRef,
  type ArrivalPackage,
  type ArrivalPackageItem,
  type ArrivalUrgency,
  type UnboxQueueItem,
} from '@/lib/receiving/arrival-contract';

/** The ops event a placement writes. */
export const ARRIVAL_PLACED_EVENT = 'RECEIVING_ARRIVAL_PLACED';

/**
 * Unpaired arrivals older than this are left off the unbox queue: prod carries
 * hundreds of legacy door scans that were never opened through this path. A
 * package paired to a location stays on the queue however old it is.
 */
const UNPAIRED_WINDOW_DAYS = 14;
const UNBOX_QUEUE_LIMIT = 200;

// ─── Urgency (pure) ──────────────────────────────────────────────────────────

export interface ArrivalUrgencyFacts {
  /** `receiving_carton.priority_tier` — set by hand. */
  cartonTier: number | null;
  /** The most urgent `inbound_order.priority_tier` on the package's lines. */
  orderTier: number | null;
  /** That order's number, for the reason line. */
  orderNumber: string | null;
  /** `is_priority`, or a pending order needs a SKU in the package. */
  stockoutDemand: boolean;
  isReturn: boolean;
  hasOpenClaim: boolean;
  sourcePlatform: string | null;
}

/**
 * Precedence: operator (hand-set tier) > inbound_order > derived (stock-out,
 * return, claim, platform) > default (Not urgent).
 */
export function resolveArrivalUrgency(facts: ArrivalUrgencyFacts): ArrivalUrgency {
  const resolved = resolveArrivalTier({
    cartonTier: facts.cartonTier,
    inboundOrderTiers: [facts.orderTier],
    stockoutDemand: facts.stockoutDemand,
    isReturn: facts.isReturn,
    hasOpenClaim: facts.hasOpenClaim,
    sourcePlatform: facts.sourcePlatform,
  });
  const urgent = tierIsUrgent(resolved.tier);
  const base = { urgent, tier: resolved.tier };
  switch (resolved.source) {
    case 'carton':
      return { ...base, source: 'operator', reason: urgent ? 'Marked urgent by hand' : 'Marked not urgent by hand' };
    case 'inbound_order':
      return {
        ...base,
        source: 'inbound_order',
        reason: facts.orderNumber
          ? `Order ${facts.orderNumber} is ${arrivalTierLabel(resolved.tier)}`
          : `Its order is ${arrivalTierLabel(resolved.tier)}`,
      };
    case 'stockout':
      return { ...base, source: 'derived', reason: 'A waiting order needs an item in it' };
    case 'return':
      return { ...base, source: 'derived', reason: 'It is a return' };
    case 'claim':
      return { ...base, source: 'derived', reason: 'It has an open claim' };
    case 'platform':
      return {
        ...base,
        source: 'derived',
        reason: `${sourcePlatformLabel(facts.sourcePlatform)} packages are ${urgent ? 'urgent' : 'not urgent'}`,
      };
    case 'default':
      return { ...base, source: 'default', reason: 'Nothing marks it urgent' };
  }
}

/** Stored tier an urgency action writes: Urgent 0, Not urgent 2, null clears. */
export function urgencyActionTier(urgent: boolean | null): number | null {
  if (urgent == null) return null;
  return urgent ? URGENT_TIER : NOT_URGENT_TIER;
}

// ─── Location a scan names (pure) ────────────────────────────────────────────

export interface LocationCandidate {
  id: number;
  barcode: string;
  face: string;
  isActive: boolean;
}

export type ScannedLocation =
  | { kind: 'found'; location: LocationCandidate }
  | { kind: 'inactive'; location: LocationCandidate }
  | { kind: 'unknown' };

/** Which org location a scanned label names: every spelling of one label compares equal; active wins. */
export function pickScannedLocation(scanned: string, candidates: readonly LocationCandidate[]): ScannedLocation {
  const code = normalizeShelfCode(scanned);
  if (!code) return { kind: 'unknown' };
  const matches = candidates
    .filter((c) => normalizeShelfCode(c.barcode) === code)
    .sort((a, b) => a.id - b.id);
  const active = matches.find((c) => c.isActive);
  if (active) return { kind: 'found', location: active };
  if (matches[0]) return { kind: 'inactive', location: matches[0] };
  return { kind: 'unknown' };
}

/** Spellings to pre-filter on in SQL (dash-insensitive); `pickScannedLocation` decides exactly. */
function locationCandidateKeys(scanned: string): string[] {
  const keys = new Set<string>();
  for (const v of [normalizeShelfCode(scanned), scanned.trim().toUpperCase()]) {
    const k = v.replace(/-/g, '');
    if (k) keys.add(k);
  }
  return [...keys];
}

// ─── SQL ─────────────────────────────────────────────────────────────────────

/** An OPEN claim-family exception on the carton or any of its lines (`$3` = claim codes text[]). */
const OPEN_CLAIM_SQL = `EXISTS (
    SELECT 1 FROM receiving_exceptions rx
     WHERE rx.organization_id = r.organization_id
       AND rx.status = 'OPEN'
       AND rx.exception_code = ANY($3::text[])
       AND (rx.receiving_id = r.id
            OR rx.receiving_line_id IN (
                 SELECT rl.id FROM receiving_line rl
                  WHERE rl.organization_id = r.organization_id AND rl.receiving_id = r.id)))`;

/** Per-carton line facts (alias `lines`). */
const LINE_FACTS_LATERAL = `LEFT JOIN LATERAL (
    SELECT COUNT(rl.id)::int AS line_count,
           COUNT(rl.id) FILTER (WHERE rl.item_name IS DISTINCT FROM '${UNFOUND_PO_TITLE_STUB}')::int AS real_line_count,
           COALESCE(bool_or(rl.workflow_status IN ('EXPECTED', 'ARRIVED', 'MATCHED')), false) AS has_open_line,
           array_agg(DISTINCT rl.sku) FILTER (WHERE NULLIF(BTRIM(rl.sku), '') IS NOT NULL) AS skus,
           MIN(io.priority_tier)::int AS order_tier,
           (array_agg(io.order_number ORDER BY io.priority_tier, io.id)
              FILTER (WHERE io.priority_tier IS NOT NULL AND io.order_number IS NOT NULL))[1] AS urgent_order_number,
           MIN(io.order_number) AS order_number,
           COALESCE(MIN(io.vendor_name), MIN(mirror.vendor_name)) AS vendor_name,
           MIN(rz.zoho_purchaseorder_number) AS line_po_number,
           MIN(io.source_platform) FILTER (WHERE io.source_platform IS NOT NULL AND io.source_platform <> 'none') AS order_platform
      FROM receiving_line rl
      LEFT JOIN inbound_order io
        ON io.id = rl.inbound_order_id AND io.organization_id = rl.organization_id
      LEFT JOIN receiving_line_zoho rz
        ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
      LEFT JOIN zoho_po_mirror mirror
        ON mirror.zoho_purchaseorder_id = rz.zoho_purchaseorder_id AND mirror.organization_id = rl.organization_id
     WHERE rl.receiving_id = r.id AND rl.organization_id = r.organization_id
  ) lines ON true`;

/** Matched to a purchase: a real line, a Zoho PO on the carton, or a linked order. */
const FOUND_SQL = `(lines.real_line_count > 0
    OR NULLIF(BTRIM(r.zoho_purchaseorder_id), '') IS NOT NULL
    OR NULLIF(BTRIM(r.zoho_purchaseorder_number), '') IS NOT NULL
    OR EXISTS (SELECT 1 FROM receiving_order_link ol
                WHERE ol.organization_id = r.organization_id AND ol.receiving_id = r.id))`;

/** Columns shared by the package read and the queue (needs `r`, `rt`, `loc`, `stn`, `lines`; `$3` = claim codes). */
const PACKAGE_COLUMNS_SQL = `
    r.id AS receiving_id, r.priority_tier, r.is_priority, r.is_return, r.intake_type,
    NULLIF(NULLIF(BTRIM(r.source_platform), ''), 'none') AS source_platform,
    r.zoho_purchaseorder_number,
    COALESCE(NULLIF(BTRIM(stn.carrier), ''), NULLIF(BTRIM(r.carrier), '')) AS carrier,
    stn.tracking_number_raw AS tracking,
    to_char(rt.door_received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS door_received_at,
    loc.id AS location_id,
    COALESCE(NULLIF(BTRIM(loc.barcode), ''), loc.name) AS location_code,
    COALESCE(NULLIF(BTRIM(loc.display_name), ''), loc.name) AS location_name,
    lines.line_count, lines.skus, lines.order_tier, lines.urgent_order_number,
    lines.order_number, lines.vendor_name, lines.line_po_number, lines.order_platform,
    ${FOUND_SQL} AS found,
    ${OPEN_CLAIM_SQL} AS has_open_claim`;

const PACKAGE_JOINS_SQL = `
      LEFT JOIN locations loc
        ON loc.id = rt.staging_location_id AND loc.organization_id = r.organization_id
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
      ${LINE_FACTS_LATERAL}`;

export interface PackageRow {
  receiving_id: number;
  priority_tier: number | null;
  is_priority: boolean | null;
  is_return: boolean | null;
  intake_type: string | null;
  source_platform: string | null;
  zoho_purchaseorder_number: string | null;
  carrier: string | null;
  tracking: string | null;
  door_received_at: string | null;
  location_id: number | null;
  location_code: string | null;
  location_name: string | null;
  line_count: number | null;
  skus: string[] | null;
  order_tier: number | null;
  urgent_order_number: string | null;
  order_number: string | null;
  vendor_name: string | null;
  line_po_number: string | null;
  order_platform: string | null;
  found: boolean;
  has_open_claim: boolean;
}

export interface UnboxQueueRow extends PackageRow {
  first_catalog_product_title: string | null;
  first_zoho_item_title: string | null;
  first_item_name: string | null;
  first_sku: string | null;
  first_zoho_item_id: string | null;
}

/** The package facts the read and the queue both project. */
export interface PackageFacts {
  receivingId: number;
  tracking: string | null;
  carrier: string | null;
  found: boolean;
  platform: string | null;
  orderNumber: string | null;
  vendor: string | null;
  doorReceivedAt: string | null;
  location: ArrivalLocationRef | null;
  lineCount: number;
  skus: string[];
  urgency: Omit<ArrivalUrgencyFacts, 'stockoutDemand'> & { isPriority: boolean };
}

function toFacts(row: PackageRow): PackageFacts {
  const platform = row.source_platform ?? row.order_platform ?? null;
  return {
    receivingId: Number(row.receiving_id),
    tracking: row.tracking ?? null,
    carrier: row.carrier ?? null,
    found: Boolean(row.found),
    platform,
    orderNumber: row.order_number ?? row.zoho_purchaseorder_number ?? row.line_po_number ?? null,
    vendor: row.vendor_name ?? null,
    doorReceivedAt: row.door_received_at ?? null,
    location:
      row.location_id == null
        ? null
        : { id: Number(row.location_id), code: row.location_code ?? '', name: row.location_name ?? row.location_code ?? '' },
    lineCount: Number(row.line_count) || 0,
    skus: row.skus ?? [],
    urgency: {
      cartonTier: row.priority_tier == null ? null : Number(row.priority_tier),
      orderTier: row.order_tier == null ? null : Number(row.order_tier),
      orderNumber: row.urgent_order_number ?? null,
      isPriority: Boolean(row.is_priority),
      isReturn: Boolean(row.is_return) || String(row.intake_type ?? '').toUpperCase() === 'RETURN',
      hasOpenClaim: Boolean(row.has_open_claim),
      sourcePlatform: platform,
    },
  };
}

/** Does stock-out demand need the pending-order read? Only when nothing more explicit answers. */
function needsPendingRead(f: PackageFacts): boolean {
  return f.urgency.cartonTier == null && f.urgency.orderTier == null && !f.urgency.isPriority && f.skus.length > 0;
}

function urgencyOf(f: PackageFacts, pendingSkus: ReadonlySet<string>): ArrivalUrgency {
  const { isPriority, ...rest } = f.urgency;
  return resolveArrivalUrgency({
    ...rest,
    stockoutDemand: isPriority || f.skus.some((s) => pendingSkus.has(s)),
  });
}

async function readPackageFacts(orgId: OrgId, receivingId: number): Promise<PackageFacts | null> {
  const { rows } = await tenantQuery<PackageRow>(
    orgId,
    `SELECT ${PACKAGE_COLUMNS_SQL}
       FROM receiving_carton r
       LEFT JOIN receiving_triage rt
         ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
       ${PACKAGE_JOINS_SQL}
      WHERE r.id = $1 AND r.organization_id = $2
      LIMIT 1`,
    [receivingId, orgId, [...CLAIM_EXCEPTION_CODES]],
  );
  return rows[0] ? toFacts(rows[0]) : null;
}

interface ItemRow {
  id: number;
  sku: string | null;
  item_name: string | null;
  quantity_expected: number | null;
  image_url: string | null;
  catalog_product_title: string | null;
  zoho_item_title: string | null;
  zoho_item_id: string | null;
}

async function readPackageItems(orgId: OrgId, receivingId: number): Promise<ArrivalPackageItem[]> {
  const { rows } = await tenantQuery<ItemRow>(
    orgId,
    `SELECT rl.id, rl.sku, rl.item_name, rl.quantity_expected,
            ${RECEIVING_LINE_IMAGE_URL_SQL},
            sc.product_title AS catalog_product_title,
            ${ZOHO_ITEM_TITLE_SQL} AS zoho_item_title,
            rz.zoho_item_id
       FROM receiving_line rl
       LEFT JOIN receiving_line_zoho rz
         ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
       LEFT JOIN sku_catalog sc
         ON ${SKU_CATALOG_JOIN_ON_SQL}
      WHERE rl.receiving_id = $1 AND rl.organization_id = $2
      ORDER BY rl.id ASC`,
    [receivingId, orgId],
  );
  return rows.map((row) => ({
    lineId: Number(row.id),
    title: resolveSkuIdentityTitle(row) || `Line L-${row.id}`,
    sku: row.sku?.trim() || null,
    quantity: row.quantity_expected == null ? null : Number(row.quantity_expected),
    imageUrl: row.image_url ?? null,
  }));
}

interface CandidateRow {
  id: number;
  barcode: string;
  face: string;
  is_active: boolean;
}

export async function readLocationCandidates(orgId: OrgId, scanned: string): Promise<LocationCandidate[]> {
  const keys = locationCandidateKeys(scanned);
  if (keys.length === 0) return [];
  const { rows } = await tenantQuery<CandidateRow>(
    orgId,
    `SELECT id, BTRIM(barcode) AS barcode,
            COALESCE(NULLIF(BTRIM(display_name), ''), name) AS face,
            is_active
       FROM locations
      WHERE organization_id = $1
        AND NULLIF(BTRIM(barcode), '') IS NOT NULL
        AND UPPER(REPLACE(BTRIM(barcode), '-', '')) = ANY($2::text[])
      ORDER BY id`,
    [orgId, keys],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    barcode: r.barcode,
    face: r.face,
    isActive: Boolean(r.is_active),
  }));
}

// ─── Deps ────────────────────────────────────────────────────────────────────

type TxClient = Pick<PoolClient, 'query'>;

/** Injectable collaborators (house Deps pattern) — tests run with zero DB. */
export interface ArrivalPackageDeps {
  readFacts: (orgId: OrgId, receivingId: number) => Promise<PackageFacts | null>;
  readItems: (orgId: OrgId, receivingId: number) => Promise<ArrivalPackageItem[]>;
  pendingOrderSkus: (orgId: OrgId, skus: string[]) => Promise<string[]>;
  readLocationCandidates: (orgId: OrgId, scanned: string) => Promise<LocationCandidate[]>;
  transact: <T>(orgId: OrgId, fn: (client: TxClient) => Promise<T>) => Promise<T>;
  recordEvent: (input: RecordOpsEventInput) => Promise<number | null>;
}

const defaultDeps: ArrivalPackageDeps = {
  readFacts: readPackageFacts,
  readItems: readPackageItems,
  pendingOrderSkus: async (orgId, skus) => {
    try {
      return await findPendingOrderSkuMatches(orgId, skus);
    } catch (err) {
      // Stock-out demand sharpens urgency; it never blocks the door.
      console.warn('[arrival-package] pending-order match failed', err);
      return [];
    }
  },
  readLocationCandidates,
  transact: (orgId, fn) => withTenantTransaction(orgId, fn),
  recordEvent: (input) => recordOpsEvent(input),
};

// ─── Package read ────────────────────────────────────────────────────────────

export async function readArrivalPackage(
  orgId: OrgId,
  receivingId: number,
  deps: ArrivalPackageDeps = defaultDeps,
): Promise<ArrivalPackage | null> {
  const facts = await deps.readFacts(orgId, receivingId);
  if (!facts) return null;
  const [items, pending] = await Promise.all([
    deps.readItems(orgId, receivingId),
    needsPendingRead(facts) ? deps.pendingOrderSkus(orgId, facts.skus) : Promise.resolve([]),
  ]);
  const urgency = urgencyOf(facts, new Set(pending));
  return {
    receivingId: facts.receivingId,
    tracking: facts.tracking,
    carrier: facts.carrier,
    found: facts.found,
    platform: facts.platform,
    platformLabel: facts.platform ? sourcePlatformLabel(facts.platform) : null,
    orderNumber: facts.orderNumber,
    vendor: facts.vendor,
    doorReceivedAt: facts.doorReceivedAt,
    items,
    urgency,
    location: facts.location,
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type SetUrgencyResult =
  | { kind: 'not_found' }
  | { kind: 'set'; before: number | null; after: number | null; changed: boolean };

/** Write the hand-set tier: Urgent 0, Not urgent 2, null clears. A replay is a no-op. */
export async function setArrivalUrgency(
  orgId: OrgId,
  input: { receivingId: number; urgent: boolean | null },
  deps: ArrivalPackageDeps = defaultDeps,
): Promise<SetUrgencyResult> {
  const next = urgencyActionTier(input.urgent);
  return deps.transact(orgId, async (client) => {
    const cur = await client.query<{ priority_tier: number | null }>(
      `SELECT priority_tier FROM receiving_carton
        WHERE id = $1 AND organization_id = $2
        FOR UPDATE`,
      [input.receivingId, orgId],
    );
    if (cur.rows.length === 0) return { kind: 'not_found' } as const;
    const before = cur.rows[0].priority_tier == null ? null : Number(cur.rows[0].priority_tier);
    if (before === next) return { kind: 'set', before, after: next, changed: false } as const;
    await client.query(
      `UPDATE receiving_carton
          SET priority_tier = $3, updated_at = NOW()
        WHERE id = $1 AND organization_id = $2`,
      [input.receivingId, orgId, next],
    );
    return { kind: 'set', before, after: next, changed: true } as const;
  });
}

export interface PlaceInput {
  receivingId: number;
  /** The raw scan of the location label. */
  scanned: string;
  staffId: number | null;
  phoneOrigin: boolean;
  clientEventId: string;
  surface: string | null;
}

export type PlaceResult =
  | { kind: 'not_found' }
  | { kind: 'unknown_location'; error: string }
  | { kind: 'inactive_location'; error: string }
  | {
      kind: 'placed';
      location: ArrivalLocationRef;
      before: ArrivalLocationRef | null;
      changed: boolean;
      eventId: number | null;
    };

/** Pair the package to any active location the scan names. A shelf's arrival tier never refuses. */
export async function placeArrivalPackage(
  orgId: OrgId,
  input: PlaceInput,
  deps: ArrivalPackageDeps = defaultDeps,
): Promise<PlaceResult> {
  const facts = await deps.readFacts(orgId, input.receivingId);
  if (!facts) return { kind: 'not_found' };
  const label = input.scanned.trim();
  const picked = pickScannedLocation(label, await deps.readLocationCandidates(orgId, label));
  if (picked.kind === 'unknown') {
    return { kind: 'unknown_location', error: `No location has the label ${label}` };
  }
  if (picked.kind === 'inactive') {
    return { kind: 'inactive_location', error: `${picked.location.face} is not an active location` };
  }
  const loc = picked.location;
  const changed = facts.location?.id !== loc.id;
  if (changed) {
    await deps.transact(orgId, (client) =>
      upsertReceivingTriage(client, orgId, input.receivingId, { stagingLocationId: loc.id }),
    );
  }

  const urgency = urgencyOf(facts, new Set());
  const correlation = input.clientEventId.trim();
  const eventId = await deps
    .recordEvent({
      organizationId: orgId,
      entityType: 'receiving',
      entityId: input.receivingId,
      eventType: ARRIVAL_PLACED_EVENT,
      actorStaffId: input.staffId,
      clientEventId: `arrival-placed:${correlation}`,
      payload: {
        receivingId: input.receivingId,
        locationId: loc.id,
        location: loc.barcode,
        previousLocationId: facts.location?.id ?? null,
        urgent: urgency.urgent,
        cartonTier: urgency.tier,
        urgencySource: urgency.source,
        origin: input.phoneOrigin ? 'phone' : 'desk',
        ...(input.phoneOrigin
          ? {
              surface: input.surface ?? `/m/r/${input.receivingId}/place`,
              client_event_id: correlation,
              subject_entity_type: 'receiving',
              subject_id: String(input.receivingId),
              subject_title: `Package ${input.receivingId}`,
              subject_identifier: loc.barcode,
            }
          : null),
      },
    })
    .catch((err: unknown) => {
      console.warn('[arrival-package] placement ops event skipped', err);
      return null;
    });

  return {
    kind: 'placed',
    location: { id: loc.id, code: loc.barcode, name: loc.face },
    before: facts.location,
    changed,
    eventId,
  };
}

// ─── Unbox queue ─────────────────────────────────────────────────────────────

export interface UnboxQueueSortKey {
  receivingId: number;
  urgency: { urgent: boolean };
  /** ISO time the package came through the door; null sorts last. */
  doorReceivedAt: string | null;
}

/** Unbox order: urgent first, then oldest door time first (the longest wait at the front). */
export function orderUnboxQueue<T extends UnboxQueueSortKey>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.urgency.urgent !== b.urgency.urgent) return a.urgency.urgent ? -1 : 1;
    const at = a.doorReceivedAt ? Date.parse(a.doorReceivedAt) : Number.POSITIVE_INFINITY;
    const bt = b.doorReceivedAt ? Date.parse(b.doorReceivedAt) : Number.POSITIVE_INFINITY;
    if (at !== bt) return at < bt ? -1 : 1;
    return a.receivingId - b.receivingId;
  });
}

const UNBOX_QUEUE_SQL = `
    SELECT ${PACKAGE_COLUMNS_SQL},
           first_line.catalog_product_title AS first_catalog_product_title,
           first_line.zoho_item_title AS first_zoho_item_title,
           first_line.item_name AS first_item_name,
           first_line.sku AS first_sku,
           first_line.zoho_item_id AS first_zoho_item_id
      FROM receiving_carton r
      JOIN receiving_triage rt
        ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
      LEFT JOIN receiving_unbox ru
        ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
      ${PACKAGE_JOINS_SQL}
      LEFT JOIN LATERAL (
        SELECT sc.product_title AS catalog_product_title,
               ${ZOHO_ITEM_TITLE_SQL} AS zoho_item_title,
               rl.item_name, rl.sku, rz.zoho_item_id
          FROM receiving_line rl
          LEFT JOIN receiving_line_zoho rz
            ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
          LEFT JOIN sku_catalog sc
            ON ${SKU_CATALOG_JOIN_ON_SQL}
         WHERE rl.receiving_id = r.id AND rl.organization_id = r.organization_id
         ORDER BY rl.id ASC
         LIMIT 1
      ) first_line ON true
     WHERE r.organization_id = $1
       AND rt.door_received_at IS NOT NULL
       AND ru.opened_at IS NULL
       AND ru.unboxed_at IS NULL
       AND (lines.line_count = 0 OR lines.has_open_line)
       AND (rt.staging_location_id IS NOT NULL
            OR rt.door_received_at >= NOW() - ($2::int * INTERVAL '1 day'))
     ORDER BY rt.door_received_at ASC, r.id ASC
     LIMIT ${UNBOX_QUEUE_LIMIT}`;

export interface UnboxQueueDeps {
  readRows: (orgId: OrgId) => Promise<UnboxQueueRow[]>;
  pendingOrderSkus: ArrivalPackageDeps['pendingOrderSkus'];
}

const defaultQueueDeps: UnboxQueueDeps = {
  readRows: async (orgId) =>
    (
      await tenantQuery<UnboxQueueRow>(orgId, UNBOX_QUEUE_SQL, [
        orgId,
        UNPAIRED_WINDOW_DAYS,
        [...CLAIM_EXCEPTION_CODES],
      ])
    ).rows,
  pendingOrderSkus: defaultDeps.pendingOrderSkus,
};

/** Arrived, not-yet-opened packages: urgent first, then oldest door time first. */
export async function readUnboxQueue(
  orgId: OrgId,
  deps: UnboxQueueDeps = defaultQueueDeps,
): Promise<UnboxQueueItem[]> {
  const rows = await deps.readRows(orgId);
  const facts = rows.map(toFacts);
  // One pending-order read for every package that needs it.
  const skus = [...new Set(facts.filter(needsPendingRead).flatMap((f) => f.skus))];
  const pending = new Set(skus.length > 0 ? await deps.pendingOrderSkus(orgId, skus) : []);
  const items = rows.map((row, i): UnboxQueueItem => {
    const f = facts[i];
    const title = resolveSkuIdentityTitle({
      catalog_product_title: row.first_catalog_product_title,
      zoho_item_title: row.first_zoho_item_title,
      item_name: row.first_item_name,
      sku: row.first_sku,
      zoho_item_id: row.first_zoho_item_id,
    });
    return {
      receivingId: f.receivingId,
      urgency: urgencyOf(f, pending),
      location: f.location,
      tracking: f.tracking,
      found: f.found,
      platform: f.platform,
      platformLabel: f.platform ? sourcePlatformLabel(f.platform) : null,
      orderNumber: f.orderNumber,
      vendor: f.vendor,
      title: title || null,
      lineCount: f.lineCount,
      doorReceivedAt: f.doorReceivedAt,
    };
  });
  return orderUnboxQueue(items);
}
