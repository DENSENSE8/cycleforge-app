/**
 * Per-org monthly AI spend cap (SCALE-ROI row 4 / A4).
 *
 * What is capped is PLATFORM-carried cost — `ai_usage_events.provider =
 * 'platform'`, the shared key the operator pays for and bills back. A tenant's
 * own vault keys and self-hosted boxes are not the operator's spend.
 *
 * Cap: `organizations.settings.ai.monthlyCostCapUsd` when the org has one
 * (a positive number; 0 turns the cap off for that org), else
 * `AI_ORG_MONTHLY_COST_CAP_USD` (default 100; 0 = no cap). Calendar month in
 * UTC. The spend read is memoized per org for `SPEND_MEMO_MS` — a turn costs
 * cents, so a minute of lag is at most a few turns past the line, and the
 * Cloudflare AI Gateway spend limit is the hard backstop.
 */

import 'server-only';
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';

const MICROCENTS_PER_USD = 100_000_000;
export const SPEND_MEMO_MS = 60_000;
const DEFAULT_CAP_USD = 100;

export interface OrgSpend {
  /** Null = no cap. */
  capUsd: number | null;
  spentUsd: number;
}

export type SpendCheck =
  | { ok: true; spend: OrgSpend }
  | { ok: false; code: 'org_spend_cap'; message: string; retryAfterSec: number; spend: OrgSpend };

function envCapUsd(): number | null {
  const raw = process.env.AI_ORG_MONTHLY_COST_CAP_USD;
  if (raw === undefined || raw.trim() === '') return DEFAULT_CAP_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function loadOrgSpend(orgId: OrgId): Promise<OrgSpend> {
  const { rows } = await pool.query<{ cap: unknown; spent: string | number | null }>(
    `SELECT (SELECT settings->'ai'->'monthlyCostCapUsd' FROM organizations WHERE id = $1) AS cap,
            (SELECT COALESCE(SUM(cost_microcents), 0)
               FROM ai_usage_events
              WHERE organization_id = $1
                AND provider = 'platform'
                AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS spent`,
    [orgId],
  );
  const row = rows[0];
  const orgCap = typeof row?.cap === 'number' && Number.isFinite(row.cap) && row.cap >= 0 ? row.cap : null;
  return {
    capUsd: orgCap === null ? envCapUsd() : orgCap > 0 ? orgCap : null,
    spentUsd: Number(row?.spent ?? 0) / MICROCENTS_PER_USD,
  };
}

const memo = new Map<string, { value: OrgSpend; until: number }>();

/** Seconds until the next UTC month starts — when a capped org's budget resets. */
export function secondsUntilNextMonth(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export async function checkOrgSpendCap(
  orgId: OrgId,
  deps: { load?: (orgId: OrgId) => Promise<OrgSpend>; now?: () => number } = {},
): Promise<SpendCheck> {
  const now = (deps.now ?? Date.now)();
  const cached = memo.get(orgId);
  let spend = cached && cached.until > now ? cached.value : null;
  if (!spend) {
    try {
      spend = await (deps.load ?? loadOrgSpend)(orgId);
    } catch {
      // A metering read failure must not take chat down; the gateway limit backstops.
      return { ok: true, spend: { capUsd: null, spentUsd: 0 } };
    }
    memo.set(orgId, { value: spend, until: now + SPEND_MEMO_MS });
  }
  if (spend.capUsd === null || spend.spentUsd < spend.capUsd) return { ok: true, spend };
  return {
    ok: false,
    code: 'org_spend_cap',
    message: `Your workspace has used its $${spend.capUsd.toFixed(2)} monthly AI budget ($${spend.spentUsd.toFixed(2)} spent this month). Ask an admin to raise it, or it resets on the 1st.`,
    retryAfterSec: secondsUntilNextMonth(new Date(now)),
    spend,
  };
}

/** Drop the memo after an admin changes the cap. */
export function invalidateOrgSpendCap(orgId: OrgId): void {
  memo.delete(orgId);
}

/** Test seam. */
export function __resetOrgSpendCap(): void {
  memo.clear();
}
