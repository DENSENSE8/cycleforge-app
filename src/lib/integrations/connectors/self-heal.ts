/** Connection self-heal sweep. */
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  clearIntegrationError,
  type IntegrationProvider,
} from '@/lib/integrations/credentials';
import { getConnector } from './registry';
import type { HealthResult } from './types';

/** A connection currently latched off. */
export interface LatchedConnection {
  orgId: OrgId;
  provider: IntegrationProvider;
  scope: string | null;
  lastError: string | null;
}

export interface SelfHealDeps {
  listLatched: (limit: number) => Promise<LatchedConnection[]>;
  validate: (conn: LatchedConnection) => Promise<HealthResult>;
  heal: (conn: LatchedConnection) => Promise<boolean>;
}

export interface SelfHealAttempt {
  orgId: OrgId;
  provider: IntegrationProvider;
  scope: string | null;
  healed: boolean;
  /** Why it stayed latched (validation error), when it did. */
  error?: string;
}

export interface SelfHealResult {
  scanned: number;
  healed: number;
  stillFailing: number;
  /** Providers with no wired validate() — cannot be proven alive here. */
  unverifiable: number;
  attempts: SelfHealAttempt[];
}

/** Cap per run so one sweep can't spend its whole window on dead rows. */
export const SELF_HEAL_MAX_CONNECTIONS = 25;

async function listLatchedFromDb(limit: number): Promise<LatchedConnection[]> {
  try {
    const { rows } = await pool.query<{
      organization_id: string;
      provider: string;
      scope: string | null;
      last_error: string | null;
    }>(
      `SELECT organization_id, provider, scope, last_error
         FROM organization_integrations
        WHERE status = 'error'
        ORDER BY updated_at ASC
        LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      orgId: r.organization_id as OrgId,
      provider: r.provider as IntegrationProvider,
      scope: r.scope,
      lastError: r.last_error,
    }));
  } catch {
    // Table missing (pre-migration) — nothing to heal.
    return [];
  }
}

const defaultDeps: SelfHealDeps = {
  listLatched: listLatchedFromDb,
  validate: async (conn) => {
    const connector = getConnector(conn.provider);
    if (!connector?.validate) {
      return { ok: false, error: 'no validate() wired for this provider' };
    }
    // allowInactive: the row is latched by definition, so the normal
    // status-gated credential read would report "not connected" and we could
    // never prove recovery.
    return connector.validate(conn.orgId, conn.scope, { allowInactive: true });
  },
  heal: (conn) => clearIntegrationError(conn.orgId, conn.provider, conn.scope),
};

export async function runConnectionSelfHeal(
  opts: { limit?: number } = {},
  deps: SelfHealDeps = defaultDeps,
): Promise<SelfHealResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? SELF_HEAL_MAX_CONNECTIONS, 200));
  const latched = await deps.listLatched(limit);

  const result: SelfHealResult = {
    scanned: latched.length,
    healed: 0,
    stillFailing: 0,
    unverifiable: 0,
    attempts: [],
  };

  for (const conn of latched) {
    const connector = getConnector(conn.provider);
    if (!connector?.validate) {
      result.unverifiable += 1;
      result.attempts.push({
        orgId: conn.orgId,
        provider: conn.provider,
        scope: conn.scope,
        healed: false,
        error: 'no validate() wired for this provider',
      });
      continue;
    }

    let health: HealthResult;
    try {
      health = await deps.validate(conn);
    } catch (err) {
      health = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (!health.ok) {
      result.stillFailing += 1;
      result.attempts.push({
        orgId: conn.orgId,
        provider: conn.provider,
        scope: conn.scope,
        healed: false,
        ...(health.error ? { error: health.error } : {}),
      });
      continue;
    }

    const healed = await deps.heal(conn).catch(() => false);
    if (healed) result.healed += 1;
    result.attempts.push({
      orgId: conn.orgId,
      provider: conn.provider,
      scope: conn.scope,
      healed,
    });
    console.warn(
      `[self-heal] ${conn.provider} org=${conn.orgId} validated clean; latch ${healed ? 'lifted' : 'already clear'}` +
        `${conn.lastError ? ` (was: ${conn.lastError.slice(0, 160)})` : ''}`,
    );
  }

  return result;
}
