/** Tenancy constants. */

export const DOGFOOD_ORG_ID = '00000000-0000-0000-0000-000000000001' as const;

/**
 * CycleForge QA sandbox tenant — dedicated org for feature validation, E2E, and
 * sellability checks. Provisioned idempotently via `pnpm provision:qa-org`.
 * Never use as a dogfood fallback; org #1 remains the dogfood tenant for that.
 */
export const QA_ORG_ID = '00000000-0000-0000-0000-000000000002' as const;

export type OrgId = string;

export const PLATFORM_PLANS = ['trial', 'starter', 'growth', 'pro', 'enterprise'] as const;
export type PlatformPlan = (typeof PLATFORM_PLANS)[number];

export const ORG_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];
