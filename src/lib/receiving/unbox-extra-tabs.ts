/**
 * Closed catalog of extra Unbox Band-1 tabs staff can pin via Plus.
 *
 * System tabs (Urgent · Recent · Queue · All · History) live in
 * {@link UNBOX_WORKSPACE_TABS}. Extras are foreign collections mounted on
 * `/unbox` without leaving the station — v1 is Inbound Pipeline only.
 *
 * Plan: `docs/todo/unbox-pinned-inbound-tab-PLAN.md`.
 */

/** Catalog entry ids — subset of Unbox workspace tabs (`incoming`). */
export type UnboxExtraTabId = 'incoming';

export interface UnboxExtraTabDef {
  id: UnboxExtraTabId;
  label: string;
  /** One-line caption in the Plus popover. */
  description: string;
}

export const UNBOX_EXTRA_TAB_CATALOG: readonly UnboxExtraTabDef[] = [
  {
    id: 'incoming',
    label: 'Inbound',
    description: 'Pipeline purchase orders on the way',
  },
] as const;

/**
 * Hard cap on pinned Band-1 extras. Band-1 max vocabulary is 5 system tabs
 * (Urgent · Recent · Queue · All · History) + this — so the strip never grows
 * past 7 and stays scannable on a 1080p bench (Gemini D2 · D14). The cap is
 * enforced at three layers: {@link sanitizeUnboxPinnedExtraTabs} slices to it,
 * the chrome rejects a pin at it, and the prefs Zod bounds the array length.
 */
export const UNBOX_PINNED_EXTRA_TABS_MAX = 2;

const EXTRA_ID_SET = new Set<string>(UNBOX_EXTRA_TAB_CATALOG.map((e) => e.id));

export function isUnboxExtraTabId(value: string): value is UnboxExtraTabId {
  return EXTRA_ID_SET.has(value);
}

/** Catalog rows not already pinned (Plus popover body). */
export function unboxExtraTabsAvailable(
  pinned: readonly string[] | null | undefined,
): readonly UnboxExtraTabDef[] {
  const have = new Set(pinned ?? []);
  return UNBOX_EXTRA_TAB_CATALOG.filter((e) => !have.has(e.id));
}

/**
 * Sanitize a prefs list to known catalog ids (stable catalog order), capped at
 * {@link UNBOX_PINNED_EXTRA_TABS_MAX}. Dedups (Set), drops unknown ids, and
 * slices to the cap so a stale/hostile prefs value with too many entries can
 * never widen the strip past the Band-1 vocabulary budget.
 */
export function sanitizeUnboxPinnedExtraTabs(
  raw: readonly string[] | null | undefined,
): UnboxExtraTabId[] {
  if (!raw?.length) return [];
  const have = new Set(raw.filter(isUnboxExtraTabId));
  return UNBOX_EXTRA_TAB_CATALOG.map((e) => e.id)
    .filter((id) => have.has(id))
    .slice(0, UNBOX_PINNED_EXTRA_TABS_MAX);
}

/** At the pin cap — the chrome disables further pins (Gemini D2 · D14). */
export function isUnboxPinCapReached(pinned: readonly string[] | null | undefined): boolean {
  return sanitizeUnboxPinnedExtraTabs(pinned).length >= UNBOX_PINNED_EXTRA_TABS_MAX;
}
