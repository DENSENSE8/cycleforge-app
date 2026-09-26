/** placement-policy — resolve a tenant's placement rules from its Studio graph (UNIFIED-ENGINE-MASTER-PLAN §1.6 Track 1, Stage 1.x). */

import type { OrgId } from '@/lib/tenancy/constants';
import {
  parseDecisionRules,
  resolveDecision,
  type DecisionFacts,
  type DecisionRule,
} from './decision-eval';
import {
  resolvePlacementBin,
  type PlacementResolverDeps,
  type ResolvedPlacement,
} from './placement';

interface PlacementPolicyDeps {
  /** Configs of every `decision` node in the org's ACTIVE workflow definition. */
  loadActiveDecisionConfigs: (orgId: OrgId) => Promise<Array<Record<string, unknown>>>;
}

const defaultDeps: PlacementPolicyDeps = {
  loadActiveDecisionConfigs: async (orgId) => {
    const { db } = await import('@/lib/drizzle/db');
    const { workflowDefinitions, workflowNodes } = await import('@/lib/drizzle/schema');
    const { and, eq, desc } = await import('drizzle-orm');

    const [def] = await db
      .select({ id: workflowDefinitions.id })
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.organizationId, orgId),
          eq(workflowDefinitions.isActive, true),
        ),
      )
      .orderBy(desc(workflowDefinitions.version))
      .limit(1);
    if (!def) return [];

    const rows = await db
      .select({ config: workflowNodes.config })
      .from(workflowNodes)
      .where(
        and(
          eq(workflowNodes.workflowDefinitionId, def.id),
          eq(workflowNodes.type, 'decision'),
        ),
      );
    return rows.map((r) => (r.config ?? {}) as Record<string, unknown>);
  },
};

/** The org's placement rules — the union of every decision node's `config.rules` in its active definition. */
export async function loadOrgPlacementRules(
  orgId: OrgId,
  deps: PlacementPolicyDeps = defaultDeps,
): Promise<DecisionRule[]> {
  try {
    const configs = await deps.loadActiveDecisionConfigs(orgId);
    return configs.flatMap((cfg) => parseDecisionRules(cfg.rules));
  } catch (err) {
    console.warn(`[placement-policy] could not load org=${orgId} decision rules (ignored):`, err);
    return [];
  }
}

/** A resolved site placement + which policy layer it came from (for logging). */
interface SitePlacementResult {
  bin: ResolvedPlacement;
  source: 'org' | 'system';
}

/** Resolve a destination bin for a strangled site from the declarative policy: */
export async function resolveSitePlacementBin(args: {
  orgId: OrgId;
  facts: DecisionFacts;
  /** The site's built-in default policy (expresses today's hardcoded routing). */
  systemPolicy: readonly DecisionRule[];
  policyDeps?: PlacementPolicyDeps;
  binDeps?: PlacementResolverDeps;
}): Promise<SitePlacementResult | null> {
  const tryPolicy = async (
    rules: readonly DecisionRule[],
    source: 'org' | 'system',
  ): Promise<SitePlacementResult | null> => {
    const placement = resolveDecision(rules, null, args.facts).placement;
    if (!placement) return null;
    const res = await resolvePlacementBin(placement, args.orgId, args.binDeps);
    return res.resolved ? { bin: res.bin, source } : null;
  };

  const orgRules = await loadOrgPlacementRules(args.orgId, args.policyDeps);
  return (await tryPolicy(orgRules, 'org')) ?? (await tryPolicy(args.systemPolicy, 'system'));
}
