/**
 * Onboarding step catalog — the single source of truth for activation
 * (onboarding-foundational-plan §4/§5).
 *
 * Steps are READ-TIME DERIVED, never stored: a step is complete iff the data
 * that proves it exists (`doneWhen` over {@link OnboardingStats} from
 * GET /api/onboarding/stats). This self-heals — an org that connected a channel
 * before onboarding shipped already shows that step done — and there is nothing
 * to migrate.
 *
 * Plan gating: steps are filtered by the tenant's plan entitlements
 * (`entitlementsForPlan`, src/lib/billing/plans.ts) via the optional `showWhen`
 * predicate, so a plan never surfaces a step it can't act on. This module is
 * pure (no server imports) so client components can consume it directly.
 */

import { entitlementsForPlan, type Entitlements } from '@/lib/billing/plans';
import type { PlatformPlan } from '@/lib/tenancy/constants';
import { UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';

/** Org-scoped activation counts returned by GET /api/onboarding/stats. */
export interface OnboardingStats {
  /** Orders ingested (synced or imported), capped for cheapness. */
  orders: number;
  /** Receiving lines (expected or received cartons/items), capped. */
  receivingLines: number;
  /** Staff members in the org (the signup admin counts as 1). */
  staff: number;
  /** organization_integrations rows currently `active`. */
  integrationsConnected: number;
  /** True once any inventory event exists — the org scanned its first unit. */
  firstScanDone: boolean;
  /** True once the org has an active workflow_definitions row (its ops SOP is chosen). */
  hasActiveWorkflow: boolean;
  /**
   * ISO instant the org answered the two GS1 compliance questions, or null.
   *
   * The one step whose completion is a persisted ANSWER rather than derived
   * activity data — deliberately, because "we stock no new inventory and do not
   * sell on Amazon" is a fact no row in this database can prove. It is still
   * read-time derived like every sibling: the value lives in
   * `organizations.settings.compliance.answeredAt`, stamped server-side by
   * PATCH /api/admin/organization/settings, and this step only reads it.
   */
  complianceAnsweredAt: string | null;
}

/** All-zero stats — the degrade-not-fail fallback and the brand-new-org shape. */
export const EMPTY_ONBOARDING_STATS: OnboardingStats = {
  orders: 0,
  receivingLines: 0,
  staff: 0,
  integrationsConnected: 0,
  firstScanDone: false,
  hasActiveWorkflow: false,
  complianceAnsweredAt: null,
};

export type OnboardingStepId =
  | 'workflow'
  | 'connect'
  | 'order'
  | 'receive'
  | 'scan'
  | 'invite'
  | 'compliance';

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  /** One-line teaching subtitle shown while the step is pending. */
  description: string;
  /** Deep link to the real surface that satisfies the step. */
  href: string;
  /** Derived completion — true iff the underlying data exists. */
  doneWhen: (stats: OnboardingStats) => boolean;
  /** Plan gate — absent means every plan sees the step. */
  showWhen?: (entitlements: Entitlements) => boolean;
}

/**
 * The v1 catalog, in recommended order. Append plan-gated steps here (e.g. a
 * Growth-only "Set up a workflow" → /studio) — the array is plan-filtered, so
 * extensions are additive config, not a redesign.
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'workflow',
    label: 'Choose how you run ops',
    description: 'Start from a proven workflow template for your kind of shop.',
    href: '/onboarding/template',
    doneWhen: (s) => s.hasActiveWorkflow,
  },
  {
    id: 'connect',
    label: 'Connect a sales channel',
    description: 'Orders flow in automatically once a channel is linked.',
    href: '/settings/integrations',
    doneWhen: (s) => s.integrationsConnected > 0,
  },
  {
    id: 'order',
    label: 'Bring in your first order',
    description: 'Sync from a channel or import manually.',
    href: '/dashboard?unshipped',
    doneWhen: (s) => s.orders > 0,
  },
  {
    id: 'receive',
    label: 'Receive your first carton',
    description: 'Log an inbound delivery at the unbox station.',
    href: UNBOX_SURFACE_ROUTE,
    doneWhen: (s) => s.receivingLines > 0,
  },
  {
    id: 'scan',
    label: 'Scan your first unit',
    description: 'Push a unit through your seeded workflow.',
    href: UNBOX_SURFACE_ROUTE,
    doneWhen: (s) => s.firstScanDone,
  },
  {
    id: 'invite',
    label: 'Invite a teammate',
    description: 'Add staff so the whole line can clock work.',
    href: '/settings/organization',
    doneWhen: (s) => s.staff > 1,
    // Hidden on a (hypothetical) single-seat plan; maxStaff 0 = unlimited.
    showWhen: (e) => e.maxStaff === 0 || e.maxStaff > 1,
  },
  {
    id: 'compliance',
    label: 'Answer two product-identity questions',
    description: 'Tells us whether your labels need a licensed GS1 key. Most resellers: no.',
    href: '/settings/organization#gs1',
    // Derives off the SERVER-stamped answer, so "answered no" completes the step
    // and "never asked" does not — the whole reason the field is nullable.
    doneWhen: (s) => s.complianceAnsweredAt != null,
  },
];

/** Steps visible under a resolved entitlements object. */
export function stepsForEntitlements(entitlements: Entitlements): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => !step.showWhen || step.showWhen(entitlements));
}

/** Steps visible for a plan (reads the plan catalog's entitlements). */
export function stepsForPlan(plan: PlatformPlan): OnboardingStep[] {
  return stepsForEntitlements(entitlementsForPlan(plan));
}

/** How many of the given steps the stats prove complete. */
export function completedStepCount(steps: readonly OnboardingStep[], stats: OnboardingStats): number {
  return steps.reduce((n, step) => n + (step.doneWhen(stats) ? 1 : 0), 0);
}
