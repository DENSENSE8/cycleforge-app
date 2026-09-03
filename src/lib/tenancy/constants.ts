/**
 * Tenancy constants.
 *
 * The dogfood tenant is org #1 with a fixed UUID. `DOGFOOD_ORG_ID` is the
 * canonical name for it. It exists ONLY for explicit dogfood exemptions
 * (e.g. billing/entitlement gates that grandfather the first tenant) — NEVER
 * for request scoping. Request scoping comes from `ctx.organizationId` /
 * `resolveOrgIdFromRequest`, which fail closed rather than default to a tenant.
 *
 * The UUID `…0001` is unchanged (DB seed, enum `EBAY_USAV`).
 */

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

export const ORG_ENVIRONMENTS = ['sandbox', 'customer'] as const;
export type OrgEnvironment = (typeof ORG_ENVIRONMENTS)[number];
