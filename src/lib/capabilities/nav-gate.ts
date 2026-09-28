/**
 * The capability gate on the org nav (SIMPLE-FIRST): rows owned only by
 * inactive capabilities ride the org's nav override as `hidden` entries, so
 * every surface that already honours the override (MasterNav, the contextual
 * sidebar, ⌘K) hides them with no second pipeline. Pure and client-safe.
 *
 * The gate is presentation, not a security boundary: a hidden row's URL still
 * opens for a staffer with the page's permission.
 */

import type { NavDefinition } from '@/lib/nav/org-nav';

/**
 * The org's ACTIVE capability ids as a SQL scalar subquery (`text[]`, never
 * null) — so a nav read folds the gate into its own round trip. `$1` is the org.
 */
export const ACTIVE_CAPABILITIES_SUBQUERY_SQL = `COALESCE((SELECT array_agg(oc.capability_id)
    FROM org_capabilities oc
   WHERE oc.organization_id = $1 AND oc.state = 'active'), ARRAY[]::text[])`;

export function withCapabilityGate(
  definition: NavDefinition | null,
  hiddenIds: readonly string[] | null | undefined,
): NavDefinition | null {
  if (!hiddenIds || hiddenIds.length === 0) return definition;
  const entries = definition ? [...definition.entries] : [];
  const index = new Map(entries.map((entry, i) => [entry.id, i]));
  for (const id of hiddenIds) {
    const at = index.get(id);
    if (at === undefined) entries.push({ id, hidden: true });
    else entries[at] = { ...entries[at], hidden: true };
  }
  return { entries };
}
