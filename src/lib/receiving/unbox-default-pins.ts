/** Resolve a staffer's Unbox pinned extra tabs, most-specific-wins: */

import { sanitizeUnboxPinnedExtraTabs, type UnboxExtraTabId } from './unbox-extra-tabs';

interface ResolveUnboxPinnedTabsInput {
  /** `staff_preferences.unboxPinnedExtraTabs`: `null`/absent = inherit; `[]` = cleared. */
  staffPins?: readonly string[] | null;
  /** Per-role template; `null`/absent = role has no default. */
  roleDefault?: readonly string[] | null;
  /** Org-wide template; `null`/absent = org has no default. */
  orgDefault?: readonly string[] | null;
}

export function resolveUnboxPinnedTabs({
  staffPins,
  roleDefault,
  orgDefault,
}: ResolveUnboxPinnedTabsInput): UnboxExtraTabId[] {
  if (staffPins != null) return sanitizeUnboxPinnedExtraTabs(staffPins);
  if (roleDefault != null) return sanitizeUnboxPinnedExtraTabs(roleDefault);
  if (orgDefault != null) return sanitizeUnboxPinnedExtraTabs(orgDefault);
  return [];
}
