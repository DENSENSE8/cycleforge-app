/** Plan quantity ceilings — maxStaff / maxWarehouses / maxMonthlyOrders. */

import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import { getOrganization } from '../tenancy/organizations';
import { entitlementsForPlan } from './plans';
import { planFeatureEnforced, isPlanFeatureExemptOrg } from './plan-feature-gate';
import type { OrgId } from '../tenancy/constants';

/** The count-based ceilings in `Entitlements` this module enforces. */
export type PlanCeiling = 'maxStaff' | 'maxWarehouses' | 'maxMonthlyOrders';

/** Seats currently consumed: active staff rows (invited rows hold a seat;
 *  deactivation sets active=false, releasing it). */
async function countActiveStaff(orgId: OrgId): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM staff WHERE organization_id = $1 AND active = true`,
    [orgId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** Active warehouses. `warehouses` has no organization_id column yet
 *  (tenant-owned-NEEDS-COL, see /api/warehouses); run GUC-wrapped via
 *  tenantQuery so the count is RLS-subject once per-table FORCE lands. */
async function countActiveWarehouses(orgId: OrgId): Promise<number> {
  const r = await tenantQuery<{ n: string }>(
    orgId,
    `SELECT COUNT(*)::text AS n FROM warehouses WHERE is_active = true`,
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** Orders created since the start of the current calendar month (UTC) — the
 *  unit `plans.ts.maxMonthlyOrders` is measured in. */
async function countOrdersThisMonth(orgId: OrgId): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
       FROM orders
      WHERE organization_id = $1
        AND created_at >= date_trunc('month', now())`,
    [orgId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

const USAGE_COUNTERS: Record<PlanCeiling, (orgId: OrgId) => Promise<number>> = {
  maxStaff: countActiveStaff,
  maxWarehouses: countActiveWarehouses,
  maxMonthlyOrders: countOrdersThisMonth,
};

/**
 * Injectable collaborators so the decision is unit-testable without a DB.
 * Defaults are the real impls; tests pass fakes that capture/return without I/O.
 */
export interface PlanCeilingDeps {
  enforced: () => boolean;
  isExempt: (orgId: OrgId | null | undefined) => boolean;
  /** Plan ceiling for the org; 0 = unlimited (the plans.ts convention). */
  ceilingFor: (orgId: OrgId, ceiling: PlanCeiling) => Promise<number>;
  /** Current usage count for the ceiling's unit. */
  countUsage: (orgId: OrgId, ceiling: PlanCeiling) => Promise<number>;
}

const defaultDeps: PlanCeilingDeps = {
  enforced: planFeatureEnforced,
  isExempt: isPlanFeatureExemptOrg,
  ceilingFor: async (orgId, ceiling) => {
    const org = await getOrganization(orgId);
    return entitlementsForPlan(org?.plan ?? 'trial')[ceiling];
  },
  countUsage: (orgId, ceiling) => USAGE_COUNTERS[ceiling](orgId),
};

/** True if creating ONE MORE unit of `ceiling` would exceed the org's plan. */
export async function wouldExceedPlanCeiling(
  orgId: OrgId | null | undefined,
  ceiling: PlanCeiling,
  deps: PlanCeilingDeps = defaultDeps,
): Promise<boolean> {
  // 1. Dormant by default — short-circuit before any DB read.
  if (!deps.enforced()) return false;

  // 2. Unknown org (anonymous context) and the dogfood org are never limited.
  if (!orgId || deps.isExempt(orgId)) return false;

  try {
    const max = await deps.ceilingFor(orgId, ceiling);
    // 3. 0 (or anything non-positive / non-finite) means unlimited.
    if (!Number.isFinite(max) || max <= 0) return false;

    // 4. At/over the ceiling → adding one more would exceed it.
    const used = await deps.countUsage(orgId, ceiling);
    return used >= max;
  } catch (err) {
    console.warn(
      `[plan-ceilings] ${ceiling} check failed for ${orgId}; failing open:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/** Canonical 403 body for a blown ceiling — keep the shape identical across routes. */
export function planLimitResponseBody(ceiling: PlanCeiling): {
  ok: false;
  error: 'PLAN_LIMIT';
  limit: PlanCeiling;
  upgrade: true;
} {
  return { ok: false, error: 'PLAN_LIMIT', limit: ceiling, upgrade: true };
}
