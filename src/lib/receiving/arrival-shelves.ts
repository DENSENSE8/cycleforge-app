/**
 * Arrival urgency shelves — the IO half (reads, the placement write, the
 * unbox-next queue). Decisions live in `arrival-tier.ts` (which tier) and
 * `arrival-shelf-plan.ts` (which shelf, is this scan acceptable, what order).
 * Shelves are active `locations` rows with `arrival_priority_tier` set; none
 * set is the honest "no urgency shelves configured" state.
 */

import 'server-only';

import type { PoolClient } from 'pg';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { locationCodeFlat, parseLocationCodeFlat, unwrapScannedLocation } from '@/lib/barcode-routing';
import { findPendingOrderSkuMatches } from '@/lib/receiving/pending-order-match';
import { upsertReceivingTriage } from '@/lib/receiving/streets/carton-street-write';
import { CLAIM_EXCEPTION_CODES } from '@/lib/receiving/exception-codes';
import { recordOpsEvent, type RecordOpsEventInput } from '@/lib/ops-events';
import {
  asArrivalTier,
  resolveArrivalTier,
  type ArrivalTier,
  type ArrivalTierResolution,
} from '@/lib/receiving/arrival-tier';
import {
  checkShelfConfirm,
  orderUnboxNext,
  suggestArrivalShelf,
  type ArrivalShelf,
  type ShelfConfirmVerdict,
  type ShelfSuggestion,
} from '@/lib/receiving/arrival-shelf-plan';

/** The ops event a confirmed placement writes. */
export const ARRIVAL_PLACED_EVENT = 'RECEIVING_ARRIVAL_PLACED';

/**
 * Unshelved arrivals older than this are left off the unbox-next queue: the
 * queue is the shelves, and prod carries hundreds of legacy door scans from
 * before shelves existed that were never opened through this path.
 */
const UNSHELVED_WINDOW_DAYS = 14;
const UNBOX_NEXT_LIMIT = 200;

/** One label, every spelling: dashed `A-01-01-1-01` and flat `A0101101` compare equal. */
export function normalizeShelfCode(raw: string): string {
  const upper = unwrapScannedLocation(raw).trim().toUpperCase();
  const segments = parseLocationCodeFlat(upper.replace(/-/g, ''));
  return segments ? locationCodeFlat(segments) : upper;
}

export interface ArrivalShelvesRead {
  shelves: ArrivalShelf[];
}

interface ShelfRow {
  id: number;
  barcode: string;
  face: string;
  tier: number;
  capacity: number | null;
  sort_order: number;
  occupied: number;
}

/** Active tiered shelves with their current carton count. */
export async function readArrivalShelves(
  orgId: OrgId,
  opts: { excludeReceivingId?: number | null } = {},
): Promise<ArrivalShelvesRead> {
  const res = await tenantQuery<ShelfRow>(
    orgId,
    `SELECT l.id, l.barcode,
            COALESCE(NULLIF(BTRIM(l.display_name), ''), l.name) AS face,
            l.arrival_priority_tier AS tier,
            l.capacity, l.sort_order,
            (SELECT COUNT(*)::int
               FROM receiving_triage rt
               LEFT JOIN receiving_unbox ru
                 ON ru.receiving_id = rt.receiving_id AND ru.organization_id = rt.organization_id
              WHERE rt.organization_id = l.organization_id
                AND rt.staging_location_id = l.id
                AND ru.opened_at IS NULL
                AND ru.unboxed_at IS NULL
                AND rt.receiving_id IS DISTINCT FROM $2::int) AS occupied
       FROM locations l
      WHERE l.organization_id = $1
        AND l.is_active = true
        AND l.arrival_priority_tier IS NOT NULL
        AND NULLIF(BTRIM(l.barcode), '') IS NOT NULL
      ORDER BY l.arrival_priority_tier, l.sort_order, l.id`,
    [orgId, opts.excludeReceivingId ?? null],
  );
  const shelves: ArrivalShelf[] = [];
  for (const row of res.rows) {
    const tier = asArrivalTier(row.tier);
    if (tier == null) continue;
    shelves.push({
      id: Number(row.id),
      barcode: row.barcode,
      face: row.face,
      tier,
      capacity: row.capacity == null ? null : Number(row.capacity),
      occupied: Number(row.occupied) || 0,
      sortOrder: Number(row.sort_order) || 0,
    });
  }
  return { shelves };
}

/** An OPEN claim-family exception on the carton or any of its lines. */
const OPEN_CLAIM_SQL = `EXISTS (
  SELECT 1 FROM receiving_exceptions rx
   WHERE rx.organization_id = r.organization_id
     AND rx.status = 'OPEN'
     AND rx.exception_code = ANY($CLAIM_CODES::text[])
     AND (rx.receiving_id = r.id
          OR rx.receiving_line_id IN (
               SELECT rl.id FROM receiving_line rl
                WHERE rl.organization_id = r.organization_id AND rl.receiving_id = r.id)))`;

interface CartonFactsRow {
  id: number;
  priority_tier: number | null;
  is_priority: boolean | null;
  is_return: boolean | null;
  intake_type: string | null;
  source_platform: string | null;
  staging_location_id: number | null;
  skus: string[] | null;
  order_tiers: number[] | null;
  order_platform: string | null;
  has_open_claim: boolean;
}

export interface CartonArrivalFacts {
  receivingId: number;
  cartonTier: number | null;
  isPriority: boolean;
  isReturn: boolean;
  sourcePlatform: string | null;
  stagingLocationId: number | null;
  skus: string[];
  inboundOrderTiers: number[];
  hasOpenClaim: boolean;
}

export async function readCartonArrivalFacts(
  orgId: OrgId,
  receivingId: number,
): Promise<CartonArrivalFacts | null> {
  const res = await tenantQuery<CartonFactsRow>(
    orgId,
    `SELECT r.id, r.priority_tier, r.is_priority, r.is_return, r.intake_type, r.source_platform,
            rt.staging_location_id,
            lines.skus, lines.order_tiers, lines.order_platform,
            ${OPEN_CLAIM_SQL.replace('$CLAIM_CODES', '$3')} AS has_open_claim
       FROM receiving_carton r
       LEFT JOIN receiving_triage rt
         ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
       LEFT JOIN LATERAL (
         SELECT array_agg(DISTINCT rl.sku) FILTER (WHERE NULLIF(BTRIM(rl.sku), '') IS NOT NULL) AS skus,
                array_agg(DISTINCT io.priority_tier) FILTER (WHERE io.priority_tier IS NOT NULL) AS order_tiers,
                MIN(io.source_platform) FILTER (WHERE io.source_platform IS NOT NULL AND io.source_platform <> 'none') AS order_platform
           FROM receiving_line rl
           LEFT JOIN inbound_order io
             ON io.id = rl.inbound_order_id AND io.organization_id = rl.organization_id
          WHERE rl.receiving_id = r.id AND rl.organization_id = r.organization_id
       ) lines ON true
      WHERE r.id = $1 AND r.organization_id = $2
      LIMIT 1`,
    [receivingId, orgId, [...CLAIM_EXCEPTION_CODES]],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    receivingId: Number(row.id),
    cartonTier: row.priority_tier,
    isPriority: Boolean(row.is_priority),
    isReturn: Boolean(row.is_return) || String(row.intake_type ?? '').toUpperCase() === 'RETURN',
    sourcePlatform: row.source_platform ?? row.order_platform ?? null,
    stagingLocationId: row.staging_location_id == null ? null : Number(row.staging_location_id),
    skus: row.skus ?? [],
    inboundOrderTiers: (row.order_tiers ?? []).map(Number),
    hasOpenClaim: Boolean(row.has_open_claim),
  };
}

/** Injectable collaborators (house Deps pattern) — tests run with zero DB. */
export interface ArrivalPlacementDeps {
  readShelves: typeof readArrivalShelves;
  readFacts: typeof readCartonArrivalFacts;
  pendingOrderSkus: (orgId: OrgId, skus: string[]) => Promise<string[]>;
  /** The placement write, in one tenant transaction. */
  transact: <T>(orgId: OrgId, fn: (client: Pick<PoolClient, 'query'>) => Promise<T>) => Promise<T>;
  recordEvent: (input: RecordOpsEventInput) => Promise<number | null>;
}

const defaultDeps: ArrivalPlacementDeps = {
  readShelves: readArrivalShelves,
  readFacts: readCartonArrivalFacts,
  pendingOrderSkus: async (orgId, skus) => {
    try {
      return await findPendingOrderSkuMatches(orgId, skus);
    } catch (err) {
      // Stock-out demand sharpens the tier; it never blocks the door.
      console.warn('[arrival-shelves] pending-order match failed', err);
      return [];
    }
  },
  transact: (orgId, fn) => withTenantTransaction(orgId, fn),
  recordEvent: (input) => recordOpsEvent(input),
};

async function resolveFactsTier(
  orgId: OrgId,
  facts: CartonArrivalFacts,
  deps: ArrivalPlacementDeps,
): Promise<ArrivalTierResolution> {
  // Only pay for the pending-order read when nothing more explicit answers.
  const explicit = resolveArrivalTier({
    cartonTier: facts.cartonTier,
    inboundOrderTiers: facts.inboundOrderTiers,
  });
  if (explicit.source === 'carton' || explicit.source === 'inbound_order') return explicit;
  const pending = facts.isPriority ? [] : await deps.pendingOrderSkus(orgId, facts.skus);
  return resolveArrivalTier({
    cartonTier: null,
    inboundOrderTiers: [],
    stockoutDemand: facts.isPriority || pending.length > 0,
    isReturn: facts.isReturn,
    hasOpenClaim: facts.hasOpenClaim,
    sourcePlatform: facts.sourcePlatform,
  });
}

/**
 * Copy the resolved tier onto a carton that has none — the gap where an
 * `inbound_order.priority_tier` (or stock-out demand) never reached the box.
 * Only those FACT-backed tiers are stamped: `priority_tier` is the carton's
 * explicit urgency (NULL = Auto), and a derived default (platform, return,
 * fallback) written there would read as an operator's manual pick on every
 * desk and stop following the rules. Never overwrites.
 */
function tierIsStampable(tier: ArrivalTierResolution): boolean {
  return tier.source === 'inbound_order' || tier.source === 'stockout';
}

async function stampCartonTier(
  client: Pick<PoolClient, 'query'>,
  orgId: OrgId,
  receivingId: number,
  tier: ArrivalTier,
): Promise<boolean> {
  const res = await client.query(
    `UPDATE receiving_carton
        SET priority_tier = $3, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND priority_tier IS NULL`,
    [receivingId, orgId, tier],
  );
  return (res.rowCount ?? 0) > 0;
}

export type PlacementSuggestResult =
  | { kind: 'not_found' }
  | {
      kind: 'suggested';
      tier: ArrivalTierResolution;
      suggestion: ShelfSuggestion;
      /** The carton's current shelf, when it is already on an urgency shelf. */
      currentShelf: ArrivalShelf | null;
      tierStamped: boolean;
    };

export async function suggestPlacement(
  orgId: OrgId,
  receivingId: number,
  deps: ArrivalPlacementDeps = defaultDeps,
): Promise<PlacementSuggestResult> {
  const facts = await deps.readFacts(orgId, receivingId);
  if (!facts) return { kind: 'not_found' };
  const [tier, shelvesRead] = await Promise.all([
    resolveFactsTier(orgId, facts, deps),
    deps.readShelves(orgId, { excludeReceivingId: receivingId }),
  ]);
  const tierStamped = facts.cartonTier == null && tierIsStampable(tier)
    ? await deps.transact(orgId, (client) => stampCartonTier(client, orgId, receivingId, tier.tier))
    : false;
  return {
    kind: 'suggested',
    tier,
    suggestion: suggestArrivalShelf(shelvesRead.shelves, tier.tier),
    currentShelf: shelvesRead.shelves.find((s) => s.id === facts.stagingLocationId) ?? null,
    tierStamped,
  };
}

export interface PlacementConfirmInput {
  receivingId: number;
  /** The raw scan of the shelf label. */
  scanned: string;
  staffId: number | null;
  phoneOrigin: boolean;
  clientEventId: string | null;
  mobileScanEventId: number | null;
  surface: string | null;
}

export type PlacementConfirmResult =
  | { kind: 'not_found' }
  | { kind: 'refused'; verdict: Extract<ShelfConfirmVerdict, { ok: false }>; suggestion: ShelfSuggestion }
  | { kind: 'placed'; shelf: ArrivalShelf; tier: ArrivalTierResolution; eventId: number | null };

export async function confirmPlacement(
  orgId: OrgId,
  input: PlacementConfirmInput,
  deps: ArrivalPlacementDeps = defaultDeps,
): Promise<PlacementConfirmResult> {
  const facts = await deps.readFacts(orgId, input.receivingId);
  if (!facts) return { kind: 'not_found' };
  const [tier, shelvesRead] = await Promise.all([
    resolveFactsTier(orgId, facts, deps),
    deps.readShelves(orgId, { excludeReceivingId: input.receivingId }),
  ]);
  const suggestion = suggestArrivalShelf(shelvesRead.shelves, tier.tier);
  const code = normalizeShelfCode(input.scanned);
  const scanned = shelvesRead.shelves.find((s) => normalizeShelfCode(s.barcode) === code) ?? null;
  const verdict = checkShelfConfirm(scanned, suggestion);
  if (!verdict.ok) return { kind: 'refused', verdict, suggestion };

  const shelf = verdict.shelf;
  await deps.transact(orgId, async (client) => {
    await upsertReceivingTriage(client, orgId, input.receivingId, { stagingLocationId: shelf.id });
    if (facts.cartonTier == null && tierIsStampable(tier)) {
      await stampCartonTier(client, orgId, input.receivingId, tier.tier);
    }
  });

  const correlation = input.clientEventId?.trim() || null;
  const eventId = await deps.recordEvent({
    organizationId: orgId,
    entityType: 'receiving',
    entityId: input.receivingId,
    eventType: ARRIVAL_PLACED_EVENT,
    actorStaffId: input.staffId,
    clientEventId: correlation ? `arrival-placed:${correlation}` : null,
    payload: {
      receivingId: input.receivingId,
      locationId: shelf.id,
      shelf: shelf.barcode,
      shelfTier: shelf.tier,
      cartonTier: tier.tier,
      tierSource: tier.source,
      overflow: suggestion.kind === 'shelf' ? suggestion.overflow : true,
      origin: input.phoneOrigin ? 'phone' : 'desk',
      ...(input.phoneOrigin
        ? {
            surface: input.surface ?? `/m/r/${input.receivingId}/place`,
            client_event_id: correlation,
            mobile_scan_event_id: input.mobileScanEventId,
            subject_entity_type: 'receiving',
            subject_id: String(input.receivingId),
            subject_title: `Carton ${input.receivingId}`,
            subject_identifier: shelf.barcode,
          }
        : null),
    },
  }).catch((err: unknown) => {
    console.warn('[arrival-shelves] placement ops event skipped', err);
    return null;
  });

  return { kind: 'placed', shelf, tier, eventId };
}

interface UnboxNextRow {
  receiving_id: number;
  priority_tier: number | null;
  is_priority: boolean | null;
  is_return: boolean | null;
  intake_type: string | null;
  source_platform: string | null;
  zoho_purchaseorder_number: string | null;
  door_received_at: string | null;
  shelf_id: number | null;
  shelf_barcode: string | null;
  shelf_face: string | null;
  shelf_sort_order: number | null;
  shelf_tier: number | null;
  tracking: string | null;
  line_count: number;
  order_number: string | null;
  vendor_name: string | null;
  order_tiers: number[] | null;
  order_platform: string | null;
  has_open_claim: boolean;
}

export interface UnboxNextItem {
  receivingId: number;
  tier: ArrivalTier;
  tierSource: ArrivalTierResolution['source'] | 'shelf';
  shelfId: number | null;
  shelfCode: string | null;
  shelfFace: string | null;
  shelfSortOrder: number | null;
  doorReceivedAt: string | null;
  poNumber: string | null;
  vendor: string | null;
  sourcePlatform: string | null;
  tracking: string | null;
  lineCount: number;
}

const UNBOX_NEXT_SQL = `
    SELECT r.id AS receiving_id, r.priority_tier, r.is_priority, r.is_return, r.intake_type,
           r.source_platform, r.zoho_purchaseorder_number,
           to_char(rt.door_received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS door_received_at,
           CASE WHEN loc.arrival_priority_tier IS NOT NULL THEN loc.id END AS shelf_id,
           CASE WHEN loc.arrival_priority_tier IS NOT NULL THEN loc.barcode END AS shelf_barcode,
           CASE WHEN loc.arrival_priority_tier IS NOT NULL THEN COALESCE(NULLIF(BTRIM(loc.display_name), ''), loc.name) END AS shelf_face,
           CASE WHEN loc.arrival_priority_tier IS NOT NULL THEN loc.sort_order END AS shelf_sort_order,
           loc.arrival_priority_tier AS shelf_tier,
           stn.tracking_number_raw AS tracking,
           lines.line_count, lines.order_number, lines.vendor_name, lines.order_tiers, lines.order_platform,
           ${OPEN_CLAIM_SQL.replace('$CLAIM_CODES', '$3')} AS has_open_claim
      FROM receiving_carton r
      JOIN receiving_triage rt
        ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
      LEFT JOIN receiving_unbox ru
        ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
      LEFT JOIN locations loc
        ON loc.id = rt.staging_location_id AND loc.organization_id = r.organization_id
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
      LEFT JOIN LATERAL (
        SELECT COUNT(rl.id)::int AS line_count,
               COALESCE(bool_or(rl.workflow_status IN ('EXPECTED', 'ARRIVED', 'MATCHED')), false) AS has_open_line,
               MIN(io.order_number) AS order_number,
               MIN(io.vendor_name) AS vendor_name,
               array_agg(DISTINCT io.priority_tier) FILTER (WHERE io.priority_tier IS NOT NULL) AS order_tiers,
               MIN(io.source_platform) FILTER (WHERE io.source_platform IS NOT NULL AND io.source_platform <> 'none') AS order_platform
          FROM receiving_line rl
          LEFT JOIN inbound_order io
            ON io.id = rl.inbound_order_id AND io.organization_id = rl.organization_id
         WHERE rl.receiving_id = r.id AND rl.organization_id = r.organization_id
      ) lines ON true
     WHERE r.organization_id = $1
       AND rt.door_received_at IS NOT NULL
       AND ru.opened_at IS NULL
       AND ru.unboxed_at IS NULL
       AND (lines.line_count = 0 OR lines.has_open_line)
       AND (loc.arrival_priority_tier IS NOT NULL
            OR rt.door_received_at >= NOW() - ($2::int * INTERVAL '1 day'))
     ORDER BY rt.door_received_at ASC, r.id ASC
     LIMIT ${UNBOX_NEXT_LIMIT}`;

/** Arrived, not-yet-opened cartons in the order Unbox should take them. */
export async function readUnboxNext(orgId: OrgId): Promise<{ items: UnboxNextItem[] }> {
  const { rows } = await tenantQuery<UnboxNextRow>(orgId, UNBOX_NEXT_SQL, [
    orgId,
    UNSHELVED_WINDOW_DAYS,
    [...CLAIM_EXCEPTION_CODES],
  ]);

  const items = rows.map((row): UnboxNextItem => {
    const shelfTier = asArrivalTier(row.shelf_tier);
    const platform = row.source_platform ?? row.order_platform ?? null;
    const resolved = resolveArrivalTier({
      cartonTier: row.priority_tier,
      inboundOrderTiers: (row.order_tiers ?? []).map(Number),
      stockoutDemand: Boolean(row.is_priority),
      isReturn: Boolean(row.is_return) || String(row.intake_type ?? '').toUpperCase() === 'RETURN',
      hasOpenClaim: Boolean(row.has_open_claim),
      sourcePlatform: platform,
    });
    return {
      receivingId: Number(row.receiving_id),
      tier: shelfTier ?? resolved.tier,
      tierSource: shelfTier != null ? 'shelf' : resolved.source,
      shelfId: row.shelf_id == null ? null : Number(row.shelf_id),
      shelfCode: row.shelf_barcode,
      shelfFace: row.shelf_face,
      shelfSortOrder: row.shelf_sort_order == null ? null : Number(row.shelf_sort_order),
      doorReceivedAt: row.door_received_at,
      poNumber: row.order_number ?? row.zoho_purchaseorder_number ?? null,
      vendor: row.vendor_name ?? null,
      sourcePlatform: platform,
      tracking: row.tracking,
      lineCount: Number(row.line_count) || 0,
    };
  });
  return { items: orderUnboxNext(items) };
}
