/**
 * Resolve a staffer's Unbox pinned extra tabs, most-specific-wins:
 *
 *   staff override → role default → org default → []
 *
 * This is the durable contract behind org/role default pin templates (Gemini
 * D9). The three inputs each answer "did THIS layer say anything?":
 *
 *   - `undefined` / `null` → this layer is silent; fall through to the next.
 *   - `[]`                 → this layer explicitly says "no pins"; it WINS.
 *   - `['incoming', …]`    → this layer set a template; it WINS.
 *
 * So a staffer who has never touched their strip (`staffPins == null`) inherits
 * the role default, then the org default; a staffer who explicitly cleared their
 * strip (`staffPins === []`) keeps it empty and never re-inherits — exactly the
 * "absent = inherit, [] = staff cleared" rule the chrome relies on when it
 * unpins the last list.
 *
 * The staff tier lives in `staff_preferences.unboxPinnedExtraTabs`; the org tier
 * in the `receiving.unboxDefaultPinnedExtraTabs` registry toggle; the role tier
 * in the optional `receiving.unboxDefaultPinnedByRole` org-settings map. The
 * server folds role→org and hands the chrome a single non-staff default (see
 * `/api/staff-preferences` GET + `useUnboxDefaultPins`), so the chrome calls
 * this with just `{ staffPins, orgDefault }` — but the full order is exercised
 * server-side and by the tests.
 *
 * Every layer is sanitized (closed catalog + pin cap), so a stale template can
 * never widen the strip past the Band-1 vocabulary budget (Gemini D2 · D14).
 */

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
