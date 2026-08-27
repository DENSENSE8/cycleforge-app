/**
 * Scroll-edge affordance tokens — flat "more content below" lip for recent-rail
 * scrollports. Prefer {@link SidebarRailScrollport}; never hand-roll a twin.
 *
 * Linear gradient only (no box-shadow): blur wraps rounded corners and climbs
 * the left/right edges. A gradient band stays a straight bottom lip.
 *
 * Keep the lip quiet — it sits above bottom-anchored filter bars
 * (`TechRailSearchBar` / `TriageCartonSearchBar`) and must read as a soft
 * hint, not a heavy scrim.
 */

/** Flat bottom fade — toggle opacity with {@link useMoreBelow}. */
export const SCROLL_MORE_BELOW_CLASS =
  'bg-gradient-to-t from-scrim/[0.04] via-scrim/[0.015] to-transparent';
