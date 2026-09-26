/** resolve-shipment-for-scan.ts ───────────────────────────────────────────────────────────────── Single helper that maps a raw carrier… */
import { extractCanonicalTracking, last8FromStoredTracking } from '@/lib/tracking-format';
import type { OrgId } from '@/lib/tenancy/constants';
import { trackingDigits } from './digit-prefix-near-miss';

/** How the shipment was resolved — exact, last-8, digit-prefix near-miss, or none. */
export type ScanMatchKind = 'exact' | 'last8' | 'digit_prefix' | 'none';

export interface ShipmentScanResolution {
  /** STN id of the matched physical package, or null when nothing matched. */
  shipmentId: number | null;
  /** Linked receiving carton id (newest), or null when no carton is linked yet. */
  receivingId: number | null;
  /** `receiving_carton.source` of the linked carton ('zoho_po' | 'unmatched' | …). */
  receivingSource: string | null;
  matchKind: ScanMatchKind;
}

interface ResolverRow {
  shipment_id: number;
  receiving_id: number | null;
  receiving_source: string | null;
}

export interface ResolveShipmentDeps {
  /**
   * Org-aware query. When `orgId` is present the default routes through
   * `tenantQuery` (sets `app.current_org` for RLS); otherwise it uses the raw
   * pool. Tests inject a fake that returns canned rows by inspecting the SQL.
   */
  query: <T>(orgId: OrgId | undefined, sql: string, params: unknown[]) => Promise<{ rows: T[] }>;
  /** Structured log emitted when a lossy fallback (last-8 / digit-prefix) is used. */
  warn: (msg: string, meta?: Record<string, unknown>) => void;
}

const DIGIT_PREFIX_MAX_DELTA = 2;

const defaultDeps: ResolveShipmentDeps = {
  // Lazy db imports — keep unit tests free of `server-only` / Neon pool load.
  query: async <T>(orgId: OrgId | undefined, sql: string, params: unknown[]) => {
    if (orgId) {
      const { tenantQuery } = await import('@/lib/tenancy/db');
      return (await tenantQuery(orgId, sql, params)) as unknown as { rows: T[] };
    }
    const { default: pool } = await import('@/lib/db');
    return (await pool.query(sql, params)) as unknown as { rows: T[] };
  },
  warn: (msg, meta) => console.warn(msg, meta ?? ''),
};

const NONE: ShipmentScanResolution = {
  shipmentId: null,
  receivingId: null,
  receivingSource: null,
  matchKind: 'none',
};

/** `receiving` is org-owned, so the STN→receiving join is tenant-scoped. */
function orgPredicate(orgId: OrgId | undefined, param: string): string {
  return orgId ? `AND (r.organization_id = ${param} OR r.organization_id IS NULL)` : '';
}

/**
 * Resolve a raw scanned/pasted tracking value to its STN shipment + receiving
 * carton. Canonicalizes the input through the SoT normalizer first so a scanned
 * GS1/"96" FedEx barcode and the pasted human number converge before matching.
 */
export async function resolveShipmentForScan(
  raw: string,
  orgId?: OrgId,
  deps: ResolveShipmentDeps = defaultDeps,
): Promise<ShipmentScanResolution> {
  const canonical = extractCanonicalTracking(raw) || '';
  if (!canonical) return NONE;

  // ── 1. EXACT normalized join (preferred — STN normalized key is UNIQUE) ────
  // LEFT JOIN so an STN row with no carton still resolves the shipment; the org
  // predicate lives in the JOIN (not WHERE) so it can't nullify the left side.
  const exact = await deps.query<ResolverRow>(
    orgId,
    `SELECT stn.id AS shipment_id, r.id AS receiving_id, r.source AS receiving_source
       FROM shipping_tracking_numbers stn
       LEFT JOIN receiving_carton r
         ON r.shipment_id = stn.id
         ${orgPredicate(orgId, '$2')}
      WHERE stn.tracking_number_normalized = $1
      ORDER BY r.id DESC NULLS LAST
      LIMIT 1`,
    orgId ? [canonical, orgId] : [canonical],
  );
  if (exact.rows.length > 0) {
    const row = exact.rows[0];
    return {
      shipmentId: Number(row.shipment_id),
      receivingId: row.receiving_id != null ? Number(row.receiving_id) : null,
      receivingSource: row.receiving_source ?? null,
      matchKind: 'exact',
    };
  }

  // ── 2. LAST-8 fallback (lossy — require a single carton, and log) ──────────
  const last8 = last8FromStoredTracking(canonical);
  if (last8.length >= 8) {
    const fuzzy = await deps.query<ResolverRow>(
      orgId,
      `SELECT stn.id AS shipment_id, r.id AS receiving_id, r.source AS receiving_source
         FROM shipping_tracking_numbers stn
         JOIN receiving_carton r ON r.shipment_id = stn.id
        WHERE (RIGHT(regexp_replace(stn.tracking_number_normalized, '\\D', '', 'g'), 8) = $1
            OR RIGHT(regexp_replace(stn.tracking_number_raw,        '\\D', '', 'g'), 8) = $1)
          ${orgPredicate(orgId, '$2')}
        ORDER BY r.id DESC
        LIMIT 2`,
      orgId ? [last8, orgId] : [last8],
    );

    // Single last-8 hit wins; ambiguous (≥2) or miss falls through to digit-prefix.
    if (fuzzy.rows.length === 1) {
      const row = fuzzy.rows[0];
      deps.warn('[resolveShipmentForScan] last-8 fallback used — exact normalized miss', {
        last8,
        canonical,
        shipment_id: Number(row.shipment_id),
        receiving_id: row.receiving_id != null ? Number(row.receiving_id) : null,
      });
      return {
        shipmentId: Number(row.shipment_id),
        receivingId: row.receiving_id != null ? Number(row.receiving_id) : null,
        receivingSource: row.receiving_source ?? null,
        matchKind: 'last8',
      };
    }
  }

  // ── 3. Digit-prefix near-miss (truncated Zoho Reference# / STN) ─────────────
  const digits = trackingDigits(canonical);
  if (digits.length < 8) return NONE;

  const prefix = await deps.query<ResolverRow>(
    orgId,
    `SELECT stn.id AS shipment_id, r.id AS receiving_id, r.source AS receiving_source
       FROM shipping_tracking_numbers stn
       JOIN receiving_carton r ON r.shipment_id = stn.id
      WHERE abs(
              length(regexp_replace(
                COALESCE(stn.tracking_number_normalized, stn.tracking_number_raw, ''),
                '[^0-9]', '', 'g'))
              - length($1)
            ) BETWEEN 1 AND ${DIGIT_PREFIX_MAX_DELTA}
        AND (
              regexp_replace(
                COALESCE(stn.tracking_number_normalized, stn.tracking_number_raw, ''),
                '[^0-9]', '', 'g') LIKE $1 || '%'
           OR $1 LIKE regexp_replace(
                COALESCE(stn.tracking_number_normalized, stn.tracking_number_raw, ''),
                '[^0-9]', '', 'g') || '%'
            )
        ${orgPredicate(orgId, '$2')}
      ORDER BY r.id DESC
      LIMIT 2`,
    orgId ? [digits, orgId] : [digits],
  );

  if (prefix.rows.length !== 1) return NONE;

  const prow = prefix.rows[0];
  deps.warn('[resolveShipmentForScan] digit-prefix near-miss — exact/last-8 miss', {
    digits,
    canonical,
    shipment_id: Number(prow.shipment_id),
    receiving_id: prow.receiving_id != null ? Number(prow.receiving_id) : null,
  });
  return {
    shipmentId: Number(prow.shipment_id),
    receivingId: prow.receiving_id != null ? Number(prow.receiving_id) : null,
    receivingSource: prow.receiving_source ?? null,
    matchKind: 'digit_prefix',
  };
}
