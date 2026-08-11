/**
 * Per-org cap on view-monitors — the cost governor for the 5-min evaluation cron.
 * ─────────────────────────────────────────────────────────────────────────────
 * The cron evaluates EVERY monitor an org holds each cycle, so the count of
 * monitors bounds the worst-case query cost per tenant per cycle. Most monitors
 * reuse a pre-computed count for free (plan → Cost budget), but a custom-combo
 * monitor issues one bounded fallback count — capping arm-time keeps that worst
 * case finite. Enforced at the arm API (Phase 3) via `monitorCapExceeded` over
 * the org's live monitor count; tune the ceiling here, never at the call site.
 *
 * Plan: docs/todo/view-threshold-alerts-and-digests-IMPLEMENTATION-PLAN.md.
 */

/** Maximum active view-monitors a single org may arm. */
export const MAX_VIEW_MONITORS_PER_ORG = 25;

/**
 * True when the org is already at (or past) the cap and may not arm another.
 * Pure — the caller counts the org's monitors and maps this to a 409/422.
 */
export function monitorCapExceeded(activeCount: number): boolean {
  return activeCount >= MAX_VIEW_MONITORS_PER_ORG;
}
