/** Per-org cap on view-monitors — the cost governor for the 5-min evaluation cron. */

/** Maximum active view-monitors a single org may arm. */
export const MAX_VIEW_MONITORS_PER_ORG = 25;

/**
 * True when the org is already at (or past) the cap and may not arm another.
 * Pure — the caller counts the org's monitors and maps this to a 409/422.
 */
export function monitorCapExceeded(activeCount: number): boolean {
  return activeCount >= MAX_VIEW_MONITORS_PER_ORG;
}
