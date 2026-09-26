/** Plan catalog — single source of truth for what a tenant gets at each tier. */

import type { PlatformPlan } from '../tenancy/constants';

export interface Entitlements {
  // Hard ceilings the app enforces.
  maxStaff: number;                  // 0 = unlimited
  maxMonthlyOrders: number;          // 0 = unlimited
  maxIntegrations: number;           // count of distinct provider rows in organization_integrations
  maxWarehouses: number;
  // Feature toggles — gate the corresponding routes/pages with hasEntitlement().
  features: {
    fba: boolean;
    repair: boolean;
    // Walk-in / point-of-sale (Square-backed). Growth+.
    walkIn: boolean;
    // Sourcing / acquisition engine (saved searches, candidates, alerts). Growth+.
    sourcing: boolean;
    // Support console (Zendesk overview tile + console). Growth+.
    support: boolean;
    // AI chat / copilot assistant surface (/ai-chat + /api/ai/*). Growth+.
    aiChat: boolean;
    aiCopilot: boolean;
    advancedRoles: boolean;          // editable roles + per-staff overrides
    automations: boolean;            // workflow builder (future)
    webhooksOut: boolean;            // outbound webhook subscriptions (future)
    sso: boolean;                    // SAML / OIDC tenant SSO
    auditLogExport: boolean;
    prioritySupport: boolean;
    customBranding: boolean;
    // Receiving photos written browser-direct to the office NAS over WebDAV
    // (beyond the always-on background mirror). The Settings Registry gates the
    // `receiving.nasBackup = direct` option on this. Growth+.
    nasArchive: boolean;
    // Advanced receiving vision tuning — the label-OCR consensus / scan-interval
    // / send-resolution knobs (Settings Registry `receiving.vision.*`). Pro+.
    advancedVision: boolean;
    // Operations Studio capability (entitlement tiers — Part-2 Track 2).
    studio: boolean;
  };
}

const STARTER_FEATURES: Entitlements['features'] = {
  fba: false,
  repair: false,
  // Trial + Starter share this set. Walk-in / sourcing / support / AI chat are
  // paid features unlocked at Growth+ (see GROWTH_FEATURES).
  walkIn: false,
  sourcing: false,
  support: false,
  aiChat: false,
  aiCopilot: false,
  advancedRoles: false,
  automations: false,
  webhooksOut: false,
  sso: false,
  auditLogExport: false,
  prioritySupport: false,
  customBranding: false,
  nasArchive: false,
  advancedVision: false,
  // Studio is granted on EVERY plan by default (it spreads up through GROWTH/PRO/ENTERPRISE) so turning the mechanism on never revokes…
  studio: true,
};

const GROWTH_FEATURES: Entitlements['features'] = {
  ...STARTER_FEATURES,
  fba: true,
  repair: true,
  advancedRoles: true,
  aiCopilot: true,
  customBranding: true,
  // Growth+ unlocks the paid feature set gated out of trial/starter.
  walkIn: true,
  sourcing: true,
  support: true,
  aiChat: true,
  // Growth unlocks NAS direct-write (the background mirror is free on all plans).
  nasArchive: true,
};

const PRO_FEATURES: Entitlements['features'] = {
  ...GROWTH_FEATURES,
  automations: true,
  webhooksOut: true,
  auditLogExport: true,
  // Pro unlocks the advanced receiving vision tuning knobs.
  advancedVision: true,
};

const ENTERPRISE_FEATURES: Entitlements['features'] = {
  ...PRO_FEATURES,
  sso: true,
  prioritySupport: true,
};

const ENTITLEMENTS: Record<PlatformPlan, Entitlements> = {
  trial: {
    maxStaff: 5,
    maxMonthlyOrders: 100,
    maxIntegrations: 2,
    maxWarehouses: 1,
    features: STARTER_FEATURES,
  },
  starter: {
    maxStaff: 10,
    maxMonthlyOrders: 1_000,
    maxIntegrations: 3,
    maxWarehouses: 1,
    features: STARTER_FEATURES,
  },
  growth: {
    maxStaff: 50,
    maxMonthlyOrders: 10_000,
    maxIntegrations: 8,
    maxWarehouses: 3,
    features: GROWTH_FEATURES,
  },
  pro: {
    maxStaff: 250,
    maxMonthlyOrders: 100_000,
    maxIntegrations: 0,
    maxWarehouses: 10,
    features: PRO_FEATURES,
  },
  enterprise: {
    maxStaff: 0,
    maxMonthlyOrders: 0,
    maxIntegrations: 0,
    maxWarehouses: 0,
    features: ENTERPRISE_FEATURES,
  },
};

export function entitlementsForPlan(plan: PlatformPlan): Entitlements {
  return ENTITLEMENTS[plan] ?? ENTITLEMENTS.trial;
}

/**
 * Stripe price ids per plan, resolved at runtime from env so we can change
 * the catalog without a redeploy. Trial doesn't have a price; it's just a
 * status.
 */
export const PLAN_PRICE_IDS: Record<Exclude<PlatformPlan, 'trial'>, string | undefined> = {
  starter:    process.env.STRIPE_PRICE_STARTER,
  growth:     process.env.STRIPE_PRICE_GROWTH,
  pro:        process.env.STRIPE_PRICE_PRO,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

export function planFromPriceId(priceId: string): PlatformPlan | null {
  for (const [plan, id] of Object.entries(PLAN_PRICE_IDS) as Array<[PlatformPlan, string | undefined]>) {
    if (id && id === priceId) return plan;
  }
  return null;
}
