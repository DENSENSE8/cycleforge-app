import type { QueryResultRow } from 'pg';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { listSweepOrgIds } from '@/lib/cron/for-each-org';
import { createDemandAlert, type CreateDemandAlertInput } from '@/lib/neon/sourcing-queries';

/** Sourcing demand collectors — sourcing-hub plan §3.2. */

// ─── Row + result shapes ─────────────────────────────────────────────────────

type DemandCollectorKind =
  | 'missing_part'
  | 'repair_part'
  | 'warranty_part'
  | 'pending_sku'
  | 'fba_replenish';

interface DemandRow {
  collector: DemandCollectorKind;
  skuId: number | null;
  alertType: string;
  demandSource: string;
  demandRefType: string | null;
  demandRefId: number | null;
  severity: 'info' | 'warn' | 'critical';
  reason: string;
  targetQty: number | null;
  searchQuery: string | null;
}

interface SourcingDemandCollectorsResult {
  opened: Record<DemandCollectorKind, number>;
  /** Idempotent no-ops — a live alert already covered the demand. */
  existing: number;
  collected: number;
  dropped_over_cap: number;
  /** '<orgId>:<collector>' per failed collector pass (isolated, non-fatal). */
  collector_errors: string[];
  orgs_swept: number;
  orgs_failed: number;
  elapsed_ms: number;
}

/** Per-org, per-run ceiling on demand rows written (size guard). */
export const DEMAND_CAP_PER_ORG = 200;

/** Pending SKUs must be seen at least this often before they become demand. */
export const PENDING_SKU_MIN_OCCURRENCES = 2;

// ─── Deps (injectable — unit tests run DB-free) ─────────────────────────────

export interface DemandCollectorDeps {
  queryRows: <T extends QueryResultRow>(
    orgId: OrgId,
    sql: string,
    params: unknown[],
  ) => Promise<T[]>;
  openDemandAlert: (
    input: CreateDemandAlertInput,
    orgId: OrgId,
  ) => Promise<{ created: boolean }>;
  listOrgIds: () => Promise<OrgId[]>;
}

const defaultDeps: DemandCollectorDeps = {
  queryRows: async <T extends QueryResultRow>(orgId: OrgId, sql: string, params: unknown[]) =>
    (await tenantQuery<T>(orgId, sql, params)).rows,
  openDemandAlert: (input, orgId) => createDemandAlert(input, orgId),
  listOrgIds: () => listSweepOrgIds(),
};

const truncate = (value: string, max = 160) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

// ─── (a) Missing parts on pickup orders ─────────────────────────────────────

interface MissingPartRow extends QueryResultRow {
  ref_id: number;
  sku_id: number | null;
  sku: string;
  product_title: string | null;
  missing_parts_note: string | null;
  quantity: number;
}

export async function collectMissingPartsDemand(
  orgId: OrgId,
  limit: number,
  deps: DemandCollectorDeps = defaultDeps,
): Promise<DemandRow[]> {
  const rows = await deps.queryRows<MissingPartRow>(
    orgId,
    `SELECT i.id AS ref_id, sc.id AS sku_id, i.sku, i.product_title,
            i.missing_parts_note, i.quantity
       FROM local_pickup_order_items i
       JOIN local_pickup_orders o ON o.id = i.order_id
       LEFT JOIN sku_catalog sc ON sc.sku = i.sku AND sc.organization_id = $1
      WHERE i.parts_status = 'MISSING_PARTS'
        AND o.status <> 'VOIDED'
        AND i.organization_id = $1
        AND i.created_at >= NOW() - INTERVAL '90 days'
      ORDER BY i.created_at DESC
      LIMIT $2`,
    [orgId, limit],
  );
  return rows.map((r) => ({
    collector: 'missing_part' as const,
    skuId: r.sku_id,
    alertType: 'missing_part',
    demandSource: 'missing_part',
    demandRefType: 'order',
    demandRefId: r.ref_id,
    severity: 'warn' as const,
    reason: truncate(
      `auto: missing parts on pickup item${r.missing_parts_note ? ` — ${r.missing_parts_note}` : ''}`,
    ),
    targetQty: r.quantity > 0 ? r.quantity : 1,
    searchQuery: r.sku_id != null ? null : (r.product_title?.trim() || r.sku),
  }));
}

// ─── (b) Open repair / warranty part needs ──────────────────────────────────

interface RepairPartRow extends QueryResultRow {
  ref_id: number;
  sku_id: number | null;
  product_title: string | null;
  issue: string | null;
}

export async function collectRepairPartsDemand(
  orgId: OrgId,
  limit: number,
  deps: DemandCollectorDeps = defaultDeps,
): Promise<DemandRow[]> {
  const rows = await deps.queryRows<RepairPartRow>(
    orgId,
    `SELECT rs.id AS ref_id, sc.id AS sku_id, rs.product_title, rs.issue
       FROM repair_service rs
       LEFT JOIN sku_catalog sc ON sc.sku = rs.source_sku AND sc.organization_id = $1
      WHERE rs.status IN ('Awaiting Parts', 'Awaiting Additional Parts Payment')
        AND rs.organization_id = $1
        AND (sc.id IS NOT NULL OR rs.product_title IS NOT NULL)
      ORDER BY rs.updated_at DESC
      LIMIT $2`,
    [orgId, limit],
  );
  return rows.map((r) => ({
    collector: 'repair_part' as const,
    skuId: r.sku_id,
    alertType: 'repair_part',
    demandSource: 'repair',
    demandRefType: 'repair',
    demandRefId: r.ref_id,
    severity: 'warn' as const,
    reason: truncate(`auto: repair awaiting parts${r.issue ? ` — ${r.issue}` : ''}`),
    targetQty: 1,
    searchQuery: r.sku_id != null ? null : (r.product_title?.trim() || null),
  }));
}

interface WarrantyPartRow extends QueryResultRow {
  ref_id: number;
  sku_id: number | null;
  product_title: string | null;
  sku: string | null;
  claim_number: string;
}

export async function collectWarrantyPartsDemand(
  orgId: OrgId,
  limit: number,
  deps: DemandCollectorDeps = defaultDeps,
): Promise<DemandRow[]> {
  const rows = await deps.queryRows<WarrantyPartRow>(
    orgId,
    `SELECT wc.id AS ref_id, sc.id AS sku_id, wc.product_title, wc.sku, wc.claim_number
       FROM warranty_claims wc
       LEFT JOIN sku_catalog sc ON sc.sku = wc.sku AND sc.organization_id = $1
      WHERE wc.status IN ('APPROVED', 'IN_REPAIR')
        AND wc.deleted_at IS NULL
        AND wc.organization_id = $1
        AND (sc.id IS NOT NULL OR wc.product_title IS NOT NULL OR wc.sku IS NOT NULL)
      ORDER BY wc.updated_at DESC
      LIMIT $2`,
    [orgId, limit],
  );
  return rows.map((r) => ({
    collector: 'warranty_part' as const,
    skuId: r.sku_id,
    alertType: 'warranty_part',
    demandSource: 'warranty',
    demandRefType: 'warranty_claim',
    demandRefId: r.ref_id,
    severity: 'warn' as const,
    reason: truncate(`auto: warranty claim ${r.claim_number} in repair`),
    targetQty: 1,
    searchQuery: r.sku_id != null ? null : (r.product_title?.trim() || r.sku),
  }));
}

// ─── (c) Pending SKUs (unknown SKU repeatedly blocking work) ───────────────── pending_skus is a global (un-orged) steward queue; the…

interface PendingSkuRow extends QueryResultRow {
  ref_id: number;
  raw_sku: string;
  suggested_title: string | null;
  occurrences: number;
}

export async function collectPendingSkuDemand(
  orgId: OrgId,
  limit: number,
  deps: DemandCollectorDeps = defaultDeps,
): Promise<DemandRow[]> {
  const rows = await deps.queryRows<PendingSkuRow>(
    orgId,
    `SELECT p.id AS ref_id, p.raw_sku, p.suggested_title, p.occurrences
       FROM pending_skus p
      WHERE p.status = 'PENDING'
        AND p.sku_catalog_id IS NULL
        AND p.occurrences >= $1
      ORDER BY p.occurrences DESC, p.updated_at DESC
      LIMIT $2`,
    [PENDING_SKU_MIN_OCCURRENCES, limit],
  );
  return rows.map((r) => ({
    collector: 'pending_sku' as const,
    skuId: null,
    // NOTE: sourcing_alerts_type_chk has no 'pending_sku' value yet (2026-06-13d
    // vocab); demand_no_stock is the closest applied type. demand_source carries
    // the true origin.
    alertType: 'demand_no_stock',
    demandSource: 'pending_sku',
    demandRefType: 'pending_sku',
    demandRefId: r.ref_id,
    severity: 'info' as const,
    reason: truncate(`auto: unknown SKU seen ${r.occurrences}× — ${r.raw_sku}`),
    targetQty: 1,
    searchQuery: r.suggested_title?.trim() || r.raw_sku,
  }));
}

// ─── (d) Replenishment need calc (FBA/Zoho shortfall) ─────────────────────── replenishment_requests is the existing replenishment-need…

interface FbaReplenishRow extends QueryResultRow {
  sku_id: number;
  item_name: string;
  need_qty: number;
}

export async function collectFbaReplenishmentDemand(
  orgId: OrgId,
  limit: number,
  deps: DemandCollectorDeps = defaultDeps,
): Promise<DemandRow[]> {
  const rows = await deps.queryRows<FbaReplenishRow>(
    orgId,
    `SELECT sc.id AS sku_id, rr.item_name,
            CEIL(COALESCE(NULLIF(rr.quantity_to_order, 0), rr.quantity_needed, 1))::int AS need_qty
       FROM replenishment_requests rr
       JOIN sku_catalog sc ON sc.sku = rr.sku AND sc.organization_id = $1
      WHERE rr.status IN ('detected', 'pending_review')
      ORDER BY rr.updated_at DESC
      LIMIT $2`,
    [orgId, limit],
  );
  return rows.map((r) => ({
    collector: 'fba_replenish' as const,
    skuId: r.sku_id,
    alertType: 'fba_replenish',
    demandSource: 'fba',
    demandRefType: null,
    demandRefId: null,
    severity: 'warn' as const,
    reason: truncate(`auto: replenishment shortfall — need ${r.need_qty} (${r.item_name})`),
    targetQty: r.need_qty > 0 ? r.need_qty : 1,
    searchQuery: null,
  }));
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const COLLECTORS: Array<{
  kind: DemandCollectorKind;
  run: (orgId: OrgId, limit: number, deps: DemandCollectorDeps) => Promise<DemandRow[]>;
}> = [
  { kind: 'missing_part', run: collectMissingPartsDemand },
  { kind: 'repair_part', run: collectRepairPartsDemand },
  { kind: 'warranty_part', run: collectWarrantyPartsDemand },
  { kind: 'pending_sku', run: collectPendingSkuDemand },
  { kind: 'fba_replenish', run: collectFbaReplenishmentDemand },
];

function emptyOpened(): Record<DemandCollectorKind, number> {
  return { missing_part: 0, repair_part: 0, warranty_part: 0, pending_sku: 0, fba_replenish: 0 };
}

export async function runSourcingDemandCollectorsJob(
  opts: { capPerOrg?: number } = {},
  deps: DemandCollectorDeps = defaultDeps,
): Promise<SourcingDemandCollectorsResult> {
  const startedAt = Date.now();
  const cap = Math.max(1, opts.capPerOrg ?? DEMAND_CAP_PER_ORG);

  const result: SourcingDemandCollectorsResult = {
    opened: emptyOpened(),
    existing: 0,
    collected: 0,
    dropped_over_cap: 0,
    collector_errors: [],
    orgs_swept: 0,
    orgs_failed: 0,
    elapsed_ms: 0,
  };

  const orgIds = await deps.listOrgIds();
  for (const orgId of orgIds) {
    try {
      // 1. Collect (each collector isolated; a bad signal source never blocks
      //    the others). Each read is already LIMITed to the org cap.
      const rows: DemandRow[] = [];
      for (const { kind, run } of COLLECTORS) {
        try {
          rows.push(...(await run(orgId, cap, deps)));
        } catch (err) {
          result.collector_errors.push(`${orgId}:${kind}`);
          console.error(`[sourcing.demand] collector ${kind} failed for org ${orgId}:`, err);
        }
      }
      result.collected += rows.length;

      // 2. Size guard — cap per org, log dropped counts (never silent).
      const kept = rows.slice(0, cap);
      const dropped = rows.length - kept.length;
      if (dropped > 0) {
        result.dropped_over_cap += dropped;
        console.warn(
          `[sourcing.demand] org ${orgId}: cap ${cap} reached — dropped ${dropped} demand row(s) this run`,
        );
      }

      // 3. Write through the single demand writer (idempotent on the live
      //    partial-unique indexes). Rows with neither a SKU nor a demand ref
      //    have no idempotency key and are never emitted by the collectors.
      for (const row of kept) {
        const { created } = await deps.openDemandAlert(
          {
            skuId: row.skuId,
            alertType: row.alertType,
            demandSource: row.demandSource,
            demandRefType: row.demandRefType,
            demandRefId: row.demandRefId,
            severity: row.severity,
            reason: row.reason,
            targetQty: row.targetQty,
            searchQuery: row.searchQuery,
          },
          orgId,
        );
        if (created) result.opened[row.collector] += 1;
        else result.existing += 1;
      }
      result.orgs_swept += 1;
    } catch (err) {
      result.orgs_failed += 1;
      console.error(`[sourcing.demand] org ${orgId} failed:`, err);
    }
  }

  result.elapsed_ms = Date.now() - startedAt;
  return result;
}
