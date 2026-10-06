/**
 * Scan → carton / PO identification in ONE database round trip.
 *
 * The door / Unbox scan used to walk seven tiers one query at a time (STN
 * exact → STN last-8 → STN digit-prefix → Incoming mirror → receiving_scans
 * last-8 → PO Reference# exact → PO Reference# near-miss), each a
 * BEGIN / statement / COMMIT transaction. Against Neon that is ~20 serial
 * round trips before the operator learns found vs unfound. Every tier is a
 * read, so they now travel as one statement ({@link SCAN_MATCH_PROBE_SQL});
 * the precedence the tiers used to encode by early return lives in the pure
 * pickers below, unchanged.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { extractCanonicalTracking, last8FromStoredTracking, trackingDigitsLast8Strict } from '@/lib/tracking-format';
import { trackingDigits } from './digit-prefix-near-miss';


export interface ScanProbeKeys {
  /** STN / Incoming-mirror key: the SoT canonical tracking. */
  canonical: string;
  /** STN last-8 key (`last8FromStoredTracking(canonical)`), '' when too short. */
  stnLast8: string;
  /** STN digit-prefix key, '' when under 8 digits. */
  stnDigits: string;
  /** receiving_scans last-8 key (digits of the scanned value), '' when under 8 digits. */
  scanLast8: string;
  /** zoho_po_mirror Reference# key: upper alphanumerics of the scanned value. */
  poRef: string;
  /** zoho_po_mirror near-miss key, '' when under 8 digits. */
  poDigits: string;
}

export function buildScanProbeKeys(trackingNumber: string): ScanProbeKeys {
  const canonical = extractCanonicalTracking(trackingNumber) || '';
  const stnLast8 = canonical ? last8FromStoredTracking(canonical) : '';
  const stnDigits = canonical ? trackingDigits(canonical) : '';
  const scanDigits = trackingDigits(trackingNumber);
  const poRef = trackingNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const poDigits = poRef.replace(/\D/g, '');
  return {
    canonical,
    stnLast8: stnLast8.length >= 8 ? stnLast8 : '',
    stnDigits: stnDigits.length >= 8 ? stnDigits : '',
    scanLast8: trackingDigitsLast8Strict(scanDigits),
    poRef,
    poDigits: poDigits.length >= 8 ? poDigits : '',
  };
}

export interface ProbeCartonRow {
  shipment_id: number | null;
  receiving_id: number | null;
  receiving_source: string | null;
  /** The carton's own PO id — the first rung of {@link pickLocalPoId}. */
  po_id: string | null;
  line_count: number;
}

export interface ProbeScanRow {
  scan_id: number;
  receiving_id: number;
  po_id: string | null;
  line_count: number;
}

/** Raw probe result: every tier's candidates (LIMIT 2 where ambiguity matters). */
export interface ScanMatchProbe {
  keys: ScanProbeKeys;
  stnExact: ProbeCartonRow[];
  stnLast8: ProbeCartonRow[];
  stnPrefix: ProbeCartonRow[];
  inbound: ProbeCartonRow[];
  scanLast8: ProbeScanRow[];
  poRef: string[];
  poNear: string[];
}

/** Receiving STN predicate — same as resolveShipmentForScan's tenant-scoped join. */
const ORG_JOIN = `(r.organization_id = $7::uuid OR r.organization_id IS NULL)`;
const STN_DIGITS = `regexp_replace(COALESCE(stn.tracking_number_normalized, stn.tracking_number_raw, ''), '[^0-9]', '', 'g')`;
/**
 * Digit-prefix near-miss (truncated Reference# / STN): the stored digits and
 * the scanned digits differ by 1–2 trailing digits, either way round. Spelled
 * as two equalities + two fixed-length prefix patterns (not `abs(length …)`
 * + `LIKE key || '%'`) so the text_pattern_ops indexes in
 * 2026-09-29g_scan_match_prefix_indexes.sql can serve it. Both sides are
 * digits only, so `_` / `%` never appear in the data.
 */
const nearMissDigits = (digitsSql: string, key: string) =>
  `(${digitsSql} IN (left(${key}, -1), left(${key}, -2))
        OR ${digitsSql} LIKE ${key} || '_'
        OR ${digitsSql} LIKE ${key} || '__')`;

/** Lines on the carton — a carton with lines is a found order even without a PO id. */
const lineCount = (idSql: string) =>
  `(SELECT count(*)::int FROM receiving_line x WHERE x.receiving_id = ${idSql}) AS line_count`;
const REF_DIGITS = `regexp_replace(COALESCE(reference_number, ''), '[^0-9]', '', 'g')`;

/**
 * $1 canonical · $2 stnLast8 · $3 stnDigits · $4 scanLast8 · $5 poRef · $6 poDigits · $7 orgId.
 * Each CTE mirrors one legacy tier query; an empty key skips its tier, and a
 * lossy tier (last-8, digit-prefix, near-miss) runs only when the tier that
 * outranks it found no carton. Last-8 is the package's identity (operator
 * 2026-10-04): a paste, a scan and a stored variant of one label disagree on
 * their envelopes (`420`+ZIP, FedEx `96…`) but never on their last 8 digits —
 * so an exact STN row that has no carton (a pasted variant) does not stop the
 * last-8 tier from finding the box, and every tier counts DISTINCT cartons, so
 * two variants of one label on one box are one hit, not an ambiguity. The
 * last-8 tier also counts each shipment as its NEWEST carton — what `stn_exact`
 * picks for the same row — so a box re-minted under one shipment is one hit.
 * Every tier is index-served (2026-09-29f / 2026-09-29g migrations).
 *
 * A carton owns a shipment through `receiving_carton.shipment_id` (its primary
 * box) OR a `shipment_links` RECEIVING row — every further box of a purchase
 * order that shipped in several boxes. Both STN tiers read both, so box 3 of
 * 10 opens its purchase order's carton like box 1 does.
 */
const CARTON_OWNS_SHIPMENT = `(r.shipment_id = stn.id OR r.id IN (
      SELECT sl.owner_id FROM shipment_links sl
       WHERE sl.shipment_id = stn.id AND sl.owner_type = 'RECEIVING' AND sl.organization_id = $7::uuid))`;

export const SCAN_MATCH_PROBE_SQL = `
WITH stn_exact AS (
  SELECT stn.id AS shipment_id, r.id AS receiving_id, r.source AS receiving_source,
         r.zoho_purchaseorder_id AS po_id, ${lineCount('r.id')}
    FROM shipping_tracking_numbers stn
    LEFT JOIN receiving_carton r ON ${CARTON_OWNS_SHIPMENT} AND ${ORG_JOIN}
   WHERE $1 <> '' AND stn.tracking_number_normalized = $1
   ORDER BY r.id DESC NULLS LAST
   LIMIT 1
), stn_last8 AS (
  SELECT DISTINCT ON (receiving_id) * FROM (
    SELECT DISTINCT ON (stn.id) stn.id AS shipment_id, r.id AS receiving_id, r.source AS receiving_source,
           r.zoho_purchaseorder_id AS po_id, ${lineCount('r.id')}
      FROM (
        SELECT stn.id FROM shipping_tracking_numbers stn
         WHERE $2 <> ''
           AND NOT EXISTS (SELECT 1 FROM stn_exact WHERE receiving_id IS NOT NULL)
           AND (RIGHT(regexp_replace(stn.tracking_number_normalized, '\\D', '', 'g'), 8) = $2
             OR RIGHT(regexp_replace(stn.tracking_number_raw, '\\D', '', 'g'), 8) = $2)
        OFFSET 0
      ) stn
      JOIN receiving_carton r ON ${CARTON_OWNS_SHIPMENT}
     WHERE ${ORG_JOIN}
     ORDER BY stn.id, r.id DESC
  ) newest
  ORDER BY receiving_id DESC
  LIMIT 2
), stn_prefix AS (
  SELECT * FROM (
    SELECT DISTINCT ON (r.id) stn.id AS shipment_id, r.id AS receiving_id, r.source AS receiving_source,
           r.zoho_purchaseorder_id AS po_id, ${lineCount('r.id')}
      FROM (
        SELECT stn.id FROM shipping_tracking_numbers stn
         WHERE $3 <> ''
           AND NOT EXISTS (SELECT 1 FROM stn_exact WHERE receiving_id IS NOT NULL)
           AND (SELECT count(*) FROM stn_last8) <> 1
           AND ${nearMissDigits(STN_DIGITS, '$3')}
        OFFSET 0
      ) stn
      JOIN receiving_carton r ON r.shipment_id = stn.id
     WHERE ${ORG_JOIN}
     ORDER BY r.id DESC, stn.id
  ) cartons
  ORDER BY receiving_id DESC
  LIMIT 2
), inbound AS (
  SELECT * FROM (
    SELECT DISTINCT ON (rl.receiving_id) NULL::int AS shipment_id, rl.receiving_id, 'unmatched'::text AS receiving_source,
           rc.zoho_purchaseorder_id AS po_id, ${lineCount('rl.receiving_id')}
      FROM inbound_purchase_order_mirror m
      JOIN inbound_purchase_order_links l
        ON l.organization_id = m.organization_id
       AND l.source_type = m.source_type
       AND l.source_order_id = m.source_order_id
      JOIN receiving_line rl
        ON rl.id = l.receiving_line_id
       AND rl.organization_id = m.organization_id
      LEFT JOIN receiving_carton rc ON rc.id = rl.receiving_id
     WHERE m.organization_id = $7::uuid
       AND (($1 <> '' AND NULLIF(upper(regexp_replace(COALESCE(m.tracking_number, ''), '[^A-Za-z0-9]', '', 'g')), '') = $1)
         OR ($2 <> '' AND RIGHT(regexp_replace(COALESCE(m.tracking_number, ''), '\\D', '', 'g'), 8) = $2))
     ORDER BY rl.receiving_id DESC, rl.id DESC
  ) cartons
  ORDER BY receiving_id DESC
  LIMIT 2
), scan_last8 AS (
  SELECT * FROM (
    SELECT DISTINCT ON (s.receiving_id) s.id AS scan_id, s.receiving_id, rc.zoho_purchaseorder_id AS po_id, ${lineCount('s.receiving_id')}
      FROM (
        SELECT id, receiving_id FROM receiving_scans
         WHERE $4 <> ''
           AND RIGHT(regexp_replace(tracking_number, '\\D', '', 'g'), 8) = $4
        OFFSET 0
      ) s
      LEFT JOIN receiving_carton rc ON rc.id = s.receiving_id
     ORDER BY s.receiving_id, s.id DESC
  ) cartons
  ORDER BY scan_id DESC
  LIMIT 2
), po_ref AS (
  SELECT zoho_purchaseorder_id
    FROM zoho_po_mirror
   WHERE $5 <> ''
     AND NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), '') = $5
   ORDER BY last_synced_at DESC NULLS LAST
   LIMIT 1
), po_near AS (
  SELECT zoho_purchaseorder_id
    FROM zoho_po_mirror
   WHERE $6 <> ''
     AND NOT EXISTS (SELECT 1 FROM po_ref)
     AND organization_id = $7::uuid
     AND NULLIF(${REF_DIGITS}, '') IS NOT NULL
     AND ${nearMissDigits(REF_DIGITS, '$6')}
   ORDER BY last_synced_at DESC NULLS LAST
   LIMIT 2
)
SELECT
  COALESCE((SELECT json_agg(t) FROM stn_exact t), '[]'::json)  AS stn_exact,
  COALESCE((SELECT json_agg(t) FROM stn_last8 t), '[]'::json)  AS stn_last8,
  COALESCE((SELECT json_agg(t) FROM stn_prefix t), '[]'::json) AS stn_prefix,
  COALESCE((SELECT json_agg(t) FROM inbound t), '[]'::json)    AS inbound,
  COALESCE((SELECT json_agg(t) FROM scan_last8 t), '[]'::json) AS scan_last8,
  COALESCE((SELECT json_agg(t.zoho_purchaseorder_id) FROM po_ref t), '[]'::json)  AS po_ref,
  COALESCE((SELECT json_agg(t.zoho_purchaseorder_id) FROM po_near t), '[]'::json) AS po_near
`;

interface ProbeSqlRow {
  stn_exact: ProbeCartonRow[];
  stn_last8: ProbeCartonRow[];
  stn_prefix: ProbeCartonRow[];
  inbound: ProbeCartonRow[];
  scan_last8: ProbeScanRow[];
  po_ref: Array<string | number>;
  po_near: Array<string | number>;
}

export type ProbeQuery = (orgId: OrgId, sql: string, params: unknown[]) => Promise<{ rows: ProbeSqlRow[] }>;

const defaultQuery: ProbeQuery = async (orgId, sql, params) => {
  const { tenantQueryOneTrip } = await import('@/lib/tenancy/db');
  return tenantQueryOneTrip<ProbeSqlRow & Record<string, unknown>>(orgId, sql, params);
};

/** Run every identification tier for a scanned tracking value in one round trip. */
export async function probeScanMatch(
  orgId: OrgId,
  trackingNumber: string,
  query: ProbeQuery = defaultQuery,
): Promise<ScanMatchProbe> {
  const keys = buildScanProbeKeys(trackingNumber);
  const { rows } = await query(orgId, SCAN_MATCH_PROBE_SQL, [
    keys.canonical,
    keys.stnLast8,
    keys.stnDigits,
    keys.scanLast8,
    keys.poRef,
    keys.poDigits,
    orgId,
  ]);
  const row = rows[0];
  return {
    keys,
    stnExact: row?.stn_exact ?? [],
    stnLast8: row?.stn_last8 ?? [],
    stnPrefix: row?.stn_prefix ?? [],
    inbound: row?.inbound ?? [],
    scanLast8: row?.scan_last8 ?? [],
    poRef: (row?.po_ref ?? []).map(String),
    poNear: (row?.po_near ?? []).map(String),
  };
}

export type CartonMatchTier = 'stn_exact' | 'stn_last8' | 'stn_prefix' | 'inbound' | 'scan_last8';

export interface CartonMatch {
  tier: CartonMatchTier;
  receivingId: number;
  receivingSource: string;
  /** Set only for the receiving_scans tier: the existing scan row IS the hit (no memoize). */
  scanId: number | null;
  poId: string | null;
  lineCount: number;
}

/**
 * The carton a tracking scan lands on, by the legacy tier order:
 * STN exact (a carton-less exact STN hit skips the lossy STN tiers) →
 * single STN last-8 → single STN digit-prefix → single Incoming-mirror carton →
 * single receiving_scans last-8. Ambiguity (≥2) at a lossy tier is a miss.
 */
export function pickCartonMatch(probe: ScanMatchProbe): CartonMatch | null {
  const fromCarton = (tier: CartonMatchTier, row: ProbeCartonRow): CartonMatch | null =>
    row.receiving_id == null
      ? null
      : {
          tier,
          receivingId: Number(row.receiving_id),
          receivingSource: row.receiving_source ?? 'unmatched',
          scanId: null,
          poId: row.po_id != null ? String(row.po_id) : null,
          lineCount: Number(row.line_count) || 0,
        };

  // An exact STN row that carries no carton (a pasted variant, an outbound
  // label) is not the box: the last-8 tiers still look for it.
  const exact = probe.stnExact[0];
  const stnHit = exact?.receiving_id != null
    ? fromCarton('stn_exact', exact)
    : probe.stnLast8.length === 1
      ? fromCarton('stn_last8', probe.stnLast8[0])
      : probe.stnPrefix.length === 1
        ? fromCarton('stn_prefix', probe.stnPrefix[0])
        : null;
  if (stnHit) return stnHit;

  if (probe.inbound.length === 1) {
    const hit = fromCarton('inbound', probe.inbound[0]);
    if (hit) return { ...hit, receivingSource: 'unmatched' };
  }

  if (probe.scanLast8.length === 1) {
    const s = probe.scanLast8[0];
    return {
      tier: 'scan_last8',
      receivingId: Number(s.receiving_id),
      receivingSource: 'unmatched',
      scanId: Number(s.scan_id),
      poId: s.po_id != null ? String(s.po_id) : null,
      lineCount: Number(s.line_count) || 0,
    };
  }
  return null;
}

/**
 * Tracking → PO id, LOCAL only: the matched carton's own PO id, else the PO
 * whose Reference# is this tracking, else an unambiguous digit-prefix near-miss.
 */
export function pickLocalPoId(probe: ScanMatchProbe, cartonPoId: string | null): string | null {
  if (cartonPoId) return cartonPoId;
  if (probe.poRef[0]) return probe.poRef[0];
  return probe.poNear.length === 1 ? probe.poNear[0] : null;
}

export type ScanVerdict = 'found' | 'unfound';

export interface ScanVerdictResult {
  verdict: ScanVerdict;
  /** The carton this tracking already landed on, if any. */
  receivingId: number | null;
  /** The PO the tracking resolves to locally, if any. */
  poId: string | null;
  lineCount: number;
}

/**
 * Found vs unfound, the way lookup-po will decide it — a local PO for the
 * tracking, an Incoming-mirror order, or a carton that already carries lines.
 * Anything else lands as an unfound carton.
 */
export function scanVerdictFromProbe(probe: ScanMatchProbe): ScanVerdictResult {
  const carton = pickCartonMatch(probe);
  const poId = pickLocalPoId(probe, carton?.poId ?? null);
  const lineCount = carton?.lineCount ?? 0;
  const found = poId != null || carton?.tier === 'inbound' || lineCount > 0;
  return {
    verdict: found ? 'found' : 'unfound',
    receivingId: carton?.receivingId ?? null,
    poId,
    lineCount,
  };
}
