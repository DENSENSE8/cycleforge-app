/** Connection-driven sync orchestrator — the layer that makes a *connection* drive ingestion instead of an ad-hoc button. */
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import { connectorsWithCapability, getConnector, listConnectors } from './registry';
import type { ReconcileOutcome, SyncOpts, SyncOutcome } from './types';

/** Best-effort operational writeback after a provider sync. */
async function recordSyncOutcome(orgId: OrgId, provider: IntegrationProvider, ok: boolean): Promise<void> {
  try {
    await pool.query(
      `UPDATE organization_integrations
          SET last_synced_at = now(), last_sync_status = $3, updated_at = now()
        WHERE organization_id = $1 AND provider = $2`,
      [orgId, provider, ok ? 'ok' : 'error'],
    );
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code !== '42703') {
      console.warn(`[connectors] sync-outcome writeback failed for ${provider}/${orgId}:`, e instanceof Error ? e.message : e);
    }
  }
}

/** Run one org's sync for one provider (the "Sync now" action). */
export async function syncConnection(
  orgId: OrgId,
  provider: IntegrationProvider,
  opts?: SyncOpts,
): Promise<SyncOutcome> {
  const connector = getConnector(provider);
  if (!connector) return { ok: false, error: `Unknown provider: ${provider}` };
  if (!connector.sync) return { ok: false, error: `${provider} has no sync capability yet` };
  const outcome = await connector.sync(orgId, opts);
  await recordSyncOutcome(orgId, provider, outcome.ok);
  return outcome;
}

/** Which orgs have this provider connected (its active vault row). */
async function connectedOrgsForProvider(provider: IntegrationProvider): Promise<OrgId[]> {
  const { rows } = await pool.query<{ organization_id: string }>(
    `SELECT DISTINCT organization_id FROM organization_integrations
      WHERE provider = $1 AND status = 'active'`,
    [provider],
  );
  return rows.map((r) => r.organization_id as OrgId);
}

export interface OrchestratorResult {
  provider: IntegrationProvider;
  orgId: OrgId;
  outcome: SyncOutcome;
}

/** Cron entrypoint: for every orders-capable connector with a wired sync(),
 *  sync every org that has it connected. `only` scopes the run to specific
 *  providers, so each cron drives exactly the providers it schedules. */
export async function runOrdersSyncAllOrgs(only?: IntegrationProvider[]): Promise<OrchestratorResult[]> {
  const out: OrchestratorResult[] = [];
  const allow = only && only.length ? new Set(only) : null;
  for (const connector of connectorsWithCapability('orders')) {
    if (!connector.sync) continue;
    if (allow && !allow.has(connector.provider)) continue;
    const orgs = await connectedOrgsForProvider(connector.provider);
    for (const orgId of orgs) {
      try {
        const outcome = await connector.sync(orgId);
        out.push({ provider: connector.provider, orgId, outcome });
        await recordSyncOutcome(orgId, connector.provider, outcome.ok);
      } catch (e) {
        out.push({
          provider: connector.provider,
          orgId,
          outcome: { ok: false, error: e instanceof Error ? e.message : String(e) },
        });
        await recordSyncOutcome(orgId, connector.provider, false);
      }
    }
  }
  return out;
}

export interface ReconcileResult {
  provider: IntegrationProvider;
  orgId: OrgId;
  outcome: ReconcileOutcome;
}

/** Daily drift-repair entrypoint: for every connector with a wired reconcile(),
 *  reconcile every org that has it connected. No-op (returns []) until providers
 *  implement reconcile() — additive and safe to schedule now. */
export async function runReconcileAllOrgs(opts?: { since?: Date }): Promise<ReconcileResult[]> {
  const out: ReconcileResult[] = [];
  for (const connector of listConnectors()) {
    if (!connector.reconcile) continue;
    const orgs = await connectedOrgsForProvider(connector.provider);
    for (const orgId of orgs) {
      try {
        out.push({
          provider: connector.provider,
          orgId,
          outcome: await connector.reconcile(orgId, opts),
        });
      } catch (e) {
        out.push({
          provider: connector.provider,
          orgId,
          outcome: { ok: false, error: e instanceof Error ? e.message : String(e) },
        });
      }
    }
  }
  return out;
}
