/** Manual paste → Zoho received check for Incoming / Unbox. */

import { trackingDigitsLast8Strict, trackingRawTail8 } from '@/lib/tracking-format';
import {
  canonicalizeTrackingKey,
  pickMirrorPoIdFromCandidates,
} from '@/lib/zoho/call-reduction';
import {
  INBOUND_SOURCE_SYSTEMS,
  SHIPMENT_SCAN_MATCH_CONDITION,
} from '@/lib/receiving/delivered-unscanned';
import {
  ZOHO_RECEIVED_LIKE_STATUSES,
  isZohoReceivedLikeStatus,
} from '@/lib/receiving/zoho-received-status';
import {
  CHECK_ZOHO_RECEIVED_MAX_INPUTS,
  parseTrackingPaste,
} from '@/lib/receiving/tracking-paste';
import {
  resolveWatchState,
  type CheckZohoReceivedWatchState,
} from '@/lib/receiving/watch-state';
import { resolveCheckRowCarrierTracking } from '@/lib/receiving/check-zoho-received-carrier';
import type { OrgId } from '@/lib/tenancy/constants';

/** Warehouse-membership mapping — re-exported from its leaf SoT. */
export { resolveWatchState };
export type { CheckZohoReceivedWatchState };

/** Carrier-tracking display helper — leaf SoT; re-exported for server callers. */
export { resolveCheckRowCarrierTracking };

/** Paste vocabulary — re-exported from the leaf SoT so this module's existing import path keeps working. */
export { CHECK_ZOHO_RECEIVED_MAX_INPUTS, parseTrackingPaste };

const CHECK_ZOHO_RECEIVED_MAX_ZOHO_LOOKUPS = 50;
const CHECK_ZOHO_RECEIVED_CONCURRENCY = 3;

/** Received-status vocabulary — re-exported from the leaf SoT so this module's existing import path keeps working. */
export { ZOHO_RECEIVED_LIKE_STATUSES, isZohoReceivedLikeStatus };

export type CheckZohoReceivedReason =
  | 'matched'
  | 'no_match'
  | 'ambiguous'
  | 'error'
  | 'zoho_cap';

/** The reasons that mean **we do not know** the answer, as opposed to knowing the answer is "no". */
const UNDETERMINED_REASONS: ReadonlySet<CheckZohoReceivedReason> = new Set([
  'no_match',
  'ambiguous',
  'error',
  'zoho_cap',
]);

export function isUndeterminedReason(reason: CheckZohoReceivedReason): boolean {
  return UNDETERMINED_REASONS.has(reason);
}

export interface CheckZohoReceivedLocal {
  /** An inbound shipment row exists in this org for the tracking. */
  known: boolean;
  delivered: boolean;
  delivered_at: string | null;
  /** An operator scanned it at the dock, in any receiving mode. */
  scanned: boolean;
  /** A linked carton has been unboxed, or a linked line has received qty. */
  unboxed: boolean;
  watch: CheckZohoReceivedWatchState;
}

export interface CheckZohoReceivedRow {
  /**
   * The paste key that produced this row — tracking **or** order/PO number.
   * Prefer {@link resolveCheckRowCarrierTracking} for the carrier TrackingChip;
   * do not paint this as tracking when it is a PO#.
   */
  tracking: string;
  po_number: string | null;
  /**
   * Zoho PO `reference_number` — in this org that IS the inbound tracking.
   * Never label it "ref" in the UI; show it with {@link TrackingChip}.
   */
  reference_number: string | null;
  /** Vendor display name — the PO "title" under the PO#. */
  vendor_name: string | null;
  status: string | null;
  reason: CheckZohoReceivedReason;
  source: 'mirror' | 'zoho' | null;
  /**
   * When the mirror row was last refreshed from Zoho — a `mirror`-sourced answer
   * is a cached claim, and an operator deciding whether to chase a vendor needs
   * to know it might be a day old. NULL on live-Zoho and unresolved rows.
   */
  synced_at: string | null;
  /** Local warehouse state for the same tracking; null when not looked up. */
  local: CheckZohoReceivedLocal | null;
}

export interface CheckZohoReceivedStats {
  input_count: number;
  unique_count: number;
  mirror_hits: number;
  zoho_lookups: number;
  errors: number;
  /** Rows whose ERP answer could not be established. */
  undetermined: number;
}

interface CheckZohoReceivedResult {
  received_in_zoho: CheckZohoReceivedRow[];
  not_received_in_zoho: CheckZohoReceivedRow[];
  /** Neither received nor confirmed-open — the check could not tell. */
  undetermined: CheckZohoReceivedRow[];
  stats: CheckZohoReceivedStats;
}

/** Minimal Zoho PO shape needed for classification (avoids importing zoho.ts). */
interface CheckZohoPoHit {
  purchaseorder_id: string;
  purchaseorder_number?: string | null;
  reference_number?: string | null;
  vendor_name?: string | null;
  status?: string | null;
}


interface MirrorHit {
  zoho_purchaseorder_id: string;
  zoho_purchaseorder_number: string | null;
  reference_number: string | null;
  vendor_name: string | null;
  status: string | null;
  ref_canon: string | null;
  /** Upper-alnum PO# — same shape as {@link canonicalizeTrackingKey}. */
  po_canon: string | null;
  last_synced_at: string | null;
}

export type MirrorLookupFn = (
  orgId: OrgId,
  trackings: string[],
) => Promise<Map<string, MirrorHit | 'ambiguous' | null>>;

export type ZohoSearchFn = (tracking: string) => Promise<CheckZohoPoHit[]>;

/** Batch "what does the warehouse know about these trackings" lookup. */
export type LocalLookupFn = (
  orgId: OrgId,
  trackings: string[],
) => Promise<Map<string, CheckZohoReceivedLocal>>;

export interface CheckZohoReceivedDeps {
  lookupMirror?: MirrorLookupFn;
  searchZoho?: ZohoSearchFn;
  lookupLocal?: LocalLookupFn;
  maxZohoLookups?: number;
  concurrency?: number;
  /** Unique numbers one call answers; default the paste cap ({@link CHECK_ZOHO_RECEIVED_MAX_INPUTS}). */
  maxInputs?: number;
}

/**
 * Batch mirror lookup: exact Reference# or PO# first, unique last-8 Reference#
 * suffix fallback. Returns a map keyed by canonicalizeTrackingKey(key).
 * One statement, one round trip, scoped to the org (the owner role bypasses
 * RLS, so the predicate is the scope).
 */
async function lookupMirrorByTrackings(
  orgId: OrgId,
  trackings: string[],
): Promise<Map<string, MirrorHit | 'ambiguous' | null>> {
  const { tenantQueryOneTrip } = await import('@/lib/tenancy/db');
  const out = new Map<string, MirrorHit | 'ambiguous' | null>();
  if (trackings.length === 0) return out;

  const canons = trackings.map((t) => canonicalizeTrackingKey(t)).filter(Boolean);
  const last8s = [
    ...new Set(
      trackings
        .map((t) => trackingDigitsLast8Strict(t))
        .filter((v): v is string => Boolean(v)),
    ),
  ];

  if (canons.length === 0) {
    for (const t of trackings) out.set(canonicalizeTrackingKey(t), null);
    return out;
  }

  const { rows } = await tenantQueryOneTrip<MirrorHit>(
    orgId,
    `SELECT zoho_purchaseorder_id,
            zoho_purchaseorder_number,
            reference_number,
            vendor_name,
            status,
            last_synced_at::text AS last_synced_at,
            NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), '')
              AS ref_canon,
            zoho_purchaseorder_number_norm AS po_canon
       FROM zoho_po_mirror
      WHERE organization_id = $3
        AND ((
          COALESCE(reference_number, '') <> ''
          AND (
            NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), '')
              = ANY($1::text[])
            OR (
              cardinality($2::text[]) > 0
              AND right(
                NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), ''),
                8
              ) = ANY($2::text[])
            )
          )
        )
         OR (
          zoho_purchaseorder_number_norm IS NOT NULL
          AND zoho_purchaseorder_number_norm = ANY($1::text[])
        ))
      ORDER BY last_synced_at DESC NULLS LAST
      LIMIT $4`,
    // Room for every exact hit plus suffix fan-out — a fixed 500 dropped hits
    // once a paste ran past a few hundred numbers.
    [canons, last8s, orgId, Math.max(500, trackings.length * 4)],
  );

  // The hits indexed once by each key a paste can name — a long paste must
  // not rescan every hit per number. Each list keeps the statement's order.
  type Hit = { id: string; ref: string; poCanon: string };
  const byId = new Map<string, MirrorHit>();
  const byRef = new Map<string, Hit[]>();
  const byPo = new Map<string, Hit[]>();
  const byTail8 = new Map<string, Hit[]>();
  const push = (map: Map<string, Hit[]>, key: string, hit: Hit) => {
    const list = map.get(key);
    if (list) list.push(hit);
    else map.set(key, [hit]);
  };
  for (const row of rows) {
    const id = String(row.zoho_purchaseorder_id || '').trim();
    if (!id) continue;
    byId.set(id, row);
    const hit = { id, ref: String(row.ref_canon || ''), poCanon: String(row.po_canon || '') };
    push(byRef, hit.ref, hit);
    push(byPo, hit.poCanon, hit);
    if (hit.ref.length >= 8) push(byTail8, trackingRawTail8(hit.ref), hit);
  }

  for (const tracking of trackings) {
    const canon = canonicalizeTrackingKey(tracking);
    const last8 = trackingDigitsLast8Strict(tracking) || null;
    // A hit counts once: as an exact Reference#, else an exact PO#, else a last-8 Reference#.
    const exactRefPoIds = canon ? (byRef.get(canon) ?? []).map((hit) => hit.id) : [];
    const exactNumberPoIds = canon
      ? (byPo.get(canon) ?? []).filter((hit) => hit.ref !== canon).map((hit) => hit.id)
      : [];
    const suffixPoIds = last8
      ? (byTail8.get(last8) ?? []).filter((hit) => hit.ref !== canon && hit.poCanon !== canon).map((hit) => hit.id)
      : [];

    // Exact Reference# wins, then exact PO#, then unique last-8 Reference#.
    const exactPoIds =
      exactRefPoIds.length > 0 ? exactRefPoIds : exactNumberPoIds;
    const picked = pickMirrorPoIdFromCandidates({ exactPoIds, suffixPoIds });
    if (!picked) {
      const exactUnique = [...new Set(exactPoIds)];
      const suffixUnique = [...new Set(suffixPoIds)];
      if (exactUnique.length > 1 || (exactUnique.length === 0 && suffixUnique.length > 1)) {
        out.set(canon, 'ambiguous');
      } else {
        out.set(canon, null);
      }
      continue;
    }
    out.set(canon, byId.get(picked) ?? null);
  }

  return out;
}

/** Local warehouse state for a paste list — the join that makes this check part of the same system as the Incoming watch surfaces instead… */
async function lookupLocalByTrackings(
  orgId: OrgId,
  trackings: string[],
): Promise<Map<string, CheckZohoReceivedLocal>> {
  const { tenantQueriesOneTrip } = await import('@/lib/tenancy/db');
  const out = new Map<string, CheckZohoReceivedLocal>();
  if (trackings.length === 0) return out;

  const canons = [
    ...new Set(trackings.map((t) => canonicalizeTrackingKey(t)).filter(Boolean)),
  ];
  if (canons.length === 0) return out;

  type LocalRow = {
    canon: string;
    /** A carrier shipment backs it — never just a PO's carton with no tracking. */
    known: boolean;
    delivered: boolean;
    delivered_at: string | null;
    scanned: boolean;
    unboxed: boolean;
  };

  const putRow = (row: LocalRow) => {
    if (out.has(row.canon)) return;
    const known = Boolean(row.known);
    out.set(row.canon, {
      known,
      delivered: Boolean(row.delivered),
      delivered_at: row.delivered_at ?? null,
      scanned: Boolean(row.scanned),
      unboxed: Boolean(row.unboxed),
      watch: resolveWatchState({
        known,
        delivered: Boolean(row.delivered),
        scanned: Boolean(row.scanned),
        unboxed: Boolean(row.unboxed),
      }),
    });
  };

  // The tracking read and the PO# read travel together (one round trip); a
  // tracking hit wins over a PO# hit for the same key (`putRow` keeps the first).
  const [{ rows }, { rows: poRows }] = await tenantQueriesOneTrip<LocalRow>(orgId, [
    {
      text: `WITH keys AS (SELECT DISTINCT unnest($1::text[]) AS canon)
     SELECT DISTINCT ON (k.canon)
            k.canon,
            true                                                 AS known,
            COALESCE(stn.is_delivered, false)                    AS delivered,
            stn.delivered_at::text                               AS delivered_at,
            EXISTS (
              SELECT 1
                FROM receiving_scans rs
                LEFT JOIN receiving_carton r2
                  ON r2.id = rs.receiving_id AND r2.organization_id = $2
               WHERE rs.organization_id = $2
                 AND ${SHIPMENT_SCAN_MATCH_CONDITION}
            )                                                    AS scanned,
            EXISTS (
              SELECT 1
                FROM receiving_carton r
                LEFT JOIN receiving_unbox ru
                  ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
                LEFT JOIN receiving_line rl
                  ON rl.receiving_id = r.id AND rl.organization_id = r.organization_id
               WHERE r.shipment_id = stn.id
                 AND r.organization_id = $2
                 AND (ru.unboxed_at IS NOT NULL OR COALESCE(rl.quantity_received, 0) > 0)
            )                                                    AS unboxed
       FROM keys k
       JOIN shipping_tracking_numbers stn
         ON stn.tracking_number_normalized = k.canon
      WHERE (
              EXISTS (
                SELECT 1 FROM receiving_carton r
                 WHERE r.shipment_id = stn.id AND r.organization_id = $2
              )
              OR stn.source_system IN (${INBOUND_SOURCE_SYSTEMS.map((s) => `'${s}'`).join(',')})
            )
      ORDER BY k.canon,
               COALESCE(stn.is_delivered, false) DESC,
               stn.delivered_at DESC NULLS LAST,
               stn.id DESC`,
      params: [canons, orgId],
    },
    {
      text: `WITH keys AS (SELECT DISTINCT unnest($1::text[]) AS canon),
          linked AS (
            SELECT k.canon,
                   r.id AS receiving_id,
                   stn.id AS shipment_id,
                   stn.is_delivered,
                   stn.delivered_at
              FROM keys k
              JOIN zoho_po_mirror m
                ON m.zoho_purchaseorder_number_norm = k.canon
              JOIN receiving_carton r
                ON r.zoho_purchaseorder_id = m.zoho_purchaseorder_id
               AND r.organization_id = $2
              LEFT JOIN shipping_tracking_numbers stn
                ON stn.id = r.shipment_id
          )
     SELECT l.canon,
            bool_or(l.shipment_id IS NOT NULL)                   AS known,
            COALESCE(bool_or(l.is_delivered), false)             AS delivered,
            MAX(l.delivered_at)::text                            AS delivered_at,
            bool_or(EXISTS (
              SELECT 1 FROM receiving_scans rs
               WHERE rs.organization_id = $2
                 AND rs.receiving_id = l.receiving_id
            ))                                                   AS scanned,
            bool_or(
              EXISTS (
                SELECT 1 FROM receiving_unbox ru
                 WHERE ru.receiving_id = l.receiving_id
                   AND ru.organization_id = $2
                   AND ru.unboxed_at IS NOT NULL
              )
              OR EXISTS (
                SELECT 1 FROM receiving_line rl
                 WHERE rl.receiving_id = l.receiving_id
                   AND rl.organization_id = $2
                   AND COALESCE(rl.quantity_received, 0) > 0
              )
            )                                                    AS unboxed
       FROM linked l
      GROUP BY l.canon`,
      params: [canons, orgId],
    },
  ]);

  for (const row of rows) putRow(row);
  for (const row of poRows) putRow(row);

  return out;
}

/** Local state for a tracking the org has no inbound shipment row for. */
const UNKNOWN_LOCAL: CheckZohoReceivedLocal = {
  known: false,
  delivered: false,
  delivered_at: null,
  scanned: false,
  unboxed: false,
  watch: 'unknown',
};

function rowFromMirror(tracking: string, hit: MirrorHit): CheckZohoReceivedRow {
  return {
    tracking,
    po_number: hit.zoho_purchaseorder_number?.trim() || null,
    reference_number: hit.reference_number?.trim() || null,
    vendor_name: hit.vendor_name?.trim() || null,
    status: hit.status?.trim() || null,
    reason: 'matched',
    source: 'mirror',
    synced_at: hit.last_synced_at ?? null,
    local: null,
  };
}

function pickZohoPo(
  tracking: string,
  pos: CheckZohoPoHit[],
): { po: CheckZohoPoHit | null; reason: CheckZohoReceivedReason } {
  if (pos.length === 0) return { po: null, reason: 'no_match' };
  const canon = canonicalizeTrackingKey(tracking);
  if (!canon) return { po: null, reason: 'no_match' };
  const exactRef = pos.filter(
    (p) => canonicalizeTrackingKey(p.reference_number) === canon,
  );
  if (exactRef.length === 1) return { po: exactRef[0]!, reason: 'matched' };
  if (exactRef.length > 1) return { po: null, reason: 'ambiguous' };
  const exactPo = pos.filter(
    (p) => canonicalizeTrackingKey(p.purchaseorder_number) === canon,
  );
  if (exactPo.length === 1) return { po: exactPo[0]!, reason: 'matched' };
  if (exactPo.length > 1) return { po: null, reason: 'ambiguous' };
  if (pos.length === 1) return { po: pos[0]!, reason: 'matched' };
  return { po: null, reason: 'ambiguous' };
}

function rowFromZoho(tracking: string, po: CheckZohoPoHit): CheckZohoReceivedRow {
  return {
    tracking,
    po_number: po.purchaseorder_number?.trim() || null,
    reference_number: po.reference_number?.trim() || null,
    vendor_name: po.vendor_name?.trim() || null,
    status: po.status?.trim() || null,
    reason: 'matched',
    source: 'zoho',
    // A live Zoho answer is current by construction — no cache age to disclose.
    synced_at: null,
    local: null,
  };
}

/** Unresolved row (ambiguous / capped / errored / no match). */
function unresolvedRow(
  tracking: string,
  reason: CheckZohoReceivedReason,
  source: CheckZohoReceivedRow['source'],
): CheckZohoReceivedRow {
  return {
    tracking,
    po_number: null,
    reference_number: null,
    vendor_name: null,
    status: null,
    reason,
    source,
    synced_at: null,
    local: null,
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

async function defaultSearchZoho(orgId: OrgId, tracking: string): Promise<CheckZohoPoHit[]> {
  const { findPurchaseOrderByNumber, searchPurchaseOrdersByTracking } = await import(
    '@/lib/zoho'
  );
  const { withZohoOrg } = await import('@/lib/zoho/tenant-context');
  return withZohoOrg(orgId, async () => {
    // Exact PO# / order number first — never let a fuzzy tracking search adopt
    // a near-miss PO when the operator pasted a purchase-order number.
    const byNumber = await findPurchaseOrderByNumber(tracking);
    if (byNumber) return [byNumber];
    return searchPurchaseOrdersByTracking(tracking);
  });
}

/**
 * Resolve a paste list of trackings against Zoho received status.
 * Mirror-first; live Zoho only for misses (capped).
 */
export async function checkZohoReceived(
  orgId: OrgId,
  input: string | string[],
  deps: CheckZohoReceivedDeps = {},
): Promise<CheckZohoReceivedResult | { error: string }> {
  const parsed = parseTrackingPaste(input, deps.maxInputs);
  if (!parsed.ok) return { error: parsed.error };

  const lookupMirror = deps.lookupMirror ?? lookupMirrorByTrackings;
  const searchZoho =
    deps.searchZoho ?? ((tracking: string) => defaultSearchZoho(orgId, tracking));
  const maxZoho = deps.maxZohoLookups ?? CHECK_ZOHO_RECEIVED_MAX_ZOHO_LOOKUPS;
  const concurrency = deps.concurrency ?? CHECK_ZOHO_RECEIVED_CONCURRENCY;

  const lookupLocal = deps.lookupLocal ?? lookupLocalByTrackings;

  // The ERP probe and the local-state join are independent, so they run together:
  const [mirrorMap, localMap] = await Promise.all([
    lookupMirror(orgId, parsed.trackings),
    lookupLocal(orgId, parsed.trackings).catch(() => null),
  ]);

  const rows: CheckZohoReceivedRow[] = [];
  let mirror_hits = 0;
  let zoho_lookups = 0;
  let errors = 0;

  const needZoho: string[] = [];

  for (const tracking of parsed.trackings) {
    const canon = canonicalizeTrackingKey(tracking);
    const hit = mirrorMap.get(canon);
    if (hit === 'ambiguous') {
      rows.push(unresolvedRow(tracking, 'ambiguous', 'mirror'));
      continue;
    }
    if (hit) {
      mirror_hits += 1;
      rows.push(rowFromMirror(tracking, hit));
      continue;
    }
    needZoho.push(tracking);
  }

  const capped = needZoho.slice(0, maxZoho);
  const overCap = needZoho.slice(maxZoho);

  for (const tracking of overCap) {
    rows.push(unresolvedRow(tracking, 'zoho_cap', null));
  }

  if (capped.length > 0) {
    const zohoRows = await mapPool(capped, concurrency, async (tracking) => {
      try {
        const pos = await searchZoho(tracking);
        zoho_lookups += 1;
        const { po, reason } = pickZohoPo(tracking, pos);
        if (!po) return unresolvedRow(tracking, reason, 'zoho');
        return rowFromZoho(tracking, po);
      } catch {
        errors += 1;
        zoho_lookups += 1;
        return unresolvedRow(tracking, 'error', 'zoho');
      }
    });
    rows.push(...zohoRows);
  }

  const received_in_zoho: CheckZohoReceivedRow[] = [];
  const not_received_in_zoho: CheckZohoReceivedRow[] = [];
  const undetermined: CheckZohoReceivedRow[] = [];

  for (const row of rows) {
    if (localMap) {
      const byKey = localMap.get(canonicalizeTrackingKey(row.tracking));
      const byPo = row.po_number
        ? localMap.get(canonicalizeTrackingKey(row.po_number))
        : undefined;
      // Prefer a tracking hit; fall back to PO# local when the paste was an order number.
      row.local = byKey ?? byPo ?? UNKNOWN_LOCAL;
    } else {
      row.local = null;
    }
    if (isUndeterminedReason(row.reason)) undetermined.push(row);
    else if (isZohoReceivedLikeStatus(row.status)) received_in_zoho.push(row);
    else not_received_in_zoho.push(row);
  }

  return {
    received_in_zoho,
    not_received_in_zoho,
    undetermined,
    stats: {
      input_count: parsed.input_count,
      unique_count: parsed.unique_count,
      mirror_hits,
      zoho_lookups,
      errors,
      undetermined: undetermined.length,
    },
  };
}
