/**
 * Design Lab constants — DB-free so client components, the catalog and the
 * tripwire can all import them. The gate itself (which touches
 * organization_feature_flags) lives in ./access, which is server-only.
 */

/** Flag name — mirrored in QA_FEATURE_FLAGS so provisioning turns the lab on. */
export const DESIGN_LAB_FLAG = 'design_lab' as const;

export const DESIGN_LAB_HREF = '/qa/design-lab' as const;
export const DESIGN_LAB_SPLIT_HREF = '/qa/design-lab/split' as const;

/** Specimen page — every primitive in every state, grouped by token group. */
export const DESIGN_LAB_SANDBOX_HREF = '/qa/design-lab/sandbox' as const;
