/**
 * Idempotent QA fixture reset.
 *
 * Preview is the default. Execute deletes only catalogued / prefix-known
 * sandbox rows for this org, then reports the provisioner command that
 * restores them. Never touches a customer org — the capability resolver
 * is the other gate; this still asserts sandbox.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { loadOrgEnvironment } from '../environment';
import { getQaScenario } from '../scenarios/registry';
import { demoOrderIdPattern, e2eOrderIds, fixtureEntitiesForScenario } from './catalog';
import type { DryRunBucket, DryRunPreview } from '../dry-run';
import { emptyDryRunPreview } from '../dry-run';

export type FixtureResetScope = 'scenario' | 'demo' | 'all';

export interface FixtureResetPreview extends DryRunPreview {
  scope: FixtureResetScope;
  scenarioId: string | null;
  reseedCommand: string;
}

async function countDemoOrders(orgId: OrgId): Promise<number> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM orders
        WHERE organization_id = $1 AND order_id LIKE $2`,
      [orgId, demoOrderIdPattern()],
    );
    return Number(r.rows[0]?.n ?? 0);
  });
}

async function countE2eOrders(orgId: OrgId): Promise<number> {
  const ids = e2eOrderIds();
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM orders
        WHERE organization_id = $1 AND order_id = ANY($2::text[])`,
      [orgId, ids],
    );
    return Number(r.rows[0]?.n ?? 0);
  });
}

function bucket(kind: string, count: number, reason?: string): DryRunBucket {
  return { kind, count, reason };
}

export async function previewFixtureReset(
  orgId: OrgId,
  scope: FixtureResetScope,
  scenarioId?: string | null,
): Promise<FixtureResetPreview> {
  const demo = await countDemoOrders(orgId);
  const e2e = await countE2eOrders(orgId);
  const preview = emptyDryRunPreview();
  preview.notes = [
    'Reset deletes catalogued sandbox rows only.',
    'Restore with pnpm provision:qa-org -- --fixtures-only (same seed path as E2E).',
  ];

  if (scope === 'demo') {
    preview.wouldSkip = demo === 0 ? [bucket('demo orders', 0, 'none present')] : [];
    if (demo > 0) preview.wouldCreate = []; // reset is a delete
    return {
      ...preview,
      wouldSkip: preview.wouldSkip,
      wouldUpdate: demo > 0 ? [bucket('demo orders (delete then reseed)', demo)] : [],
      scope,
      scenarioId: scenarioId ?? 'fixtures.demo-volume',
      reseedCommand: 'pnpm provision:qa-org -- --fixtures-only',
    };
  }

  if (scope === 'scenario' && scenarioId) {
    const scenario = getQaScenario(scenarioId);
    const entities = fixtureEntitiesForScenario(scenarioId);
    return {
      ...preview,
      wouldUpdate: [bucket(`${scenario?.title ?? scenarioId} entities`, entities.length)],
      scope,
      scenarioId,
      reseedCommand: 'pnpm provision:qa-org -- --fixtures-only',
    };
  }

  return {
    ...preview,
    wouldUpdate: [
      bucket('demo orders (delete then reseed)', demo),
      bucket('E2E orders (re-upsert via provisioner)', e2e),
    ],
    scope: 'all',
    scenarioId: null,
    reseedCommand: 'pnpm provision:qa-org -- --fixtures-only',
  };
}

export async function executeFixtureReset(
  orgId: OrgId,
  scope: FixtureResetScope,
  scenarioId?: string | null,
): Promise<{ deleted: Record<string, number>; reseedCommand: string }> {
  const environment = await loadOrgEnvironment(orgId);
  if (environment !== 'sandbox') {
    throw new Error('Fixture reset is only allowed on a sandbox organization');
  }

  const deleted: Record<string, number> = {};

  await withTenantTransaction(orgId, async (client) => {
    if (scope === 'demo' || scope === 'all') {
      const demo = await client.query(
        `DELETE FROM orders
          WHERE organization_id = $1 AND order_id LIKE $2`,
        [orgId, demoOrderIdPattern()],
      );
      deleted.demoOrders = demo.rowCount ?? 0;
    }

    if (scope === 'all') {
      const placements = await client.query(
        `DELETE FROM unit_pack_placements WHERE organization_id = $1`,
        [orgId],
      );
      deleted.unitPackPlacements = placements.rowCount ?? 0;
      const orderPlacements = await client.query(
        `DELETE FROM order_pack_placements WHERE organization_id = $1`,
        [orgId],
      );
      deleted.orderPackPlacements = orderPlacements.rowCount ?? 0;
    }

    if (scope === 'scenario' && scenarioId === 'fixtures.demo-volume') {
      const demo = await client.query(
        `DELETE FROM orders
          WHERE organization_id = $1 AND order_id LIKE $2`,
        [orgId, demoOrderIdPattern()],
      );
      deleted.demoOrders = demo.rowCount ?? 0;
    }
  });

  return { deleted, reseedCommand: 'pnpm provision:qa-org -- --fixtures-only' };
}
