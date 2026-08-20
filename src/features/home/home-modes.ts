/**
 * Shared types + constants for the Home ("/") mode switcher.
 *
 * TWO modes as of 2026-08-19: `daily` and `today`. `inbox` (subscription feed),
 * `tasks` (ops-plan tasks) and `forge` (Plans Live) were removed from Home —
 * `inbox` and `tasks` deleted outright, `forge` moved to its own `/forge` route,
 * which is where its bookmark already pointed. Same disposal as `collab` and
 * `brief` before them: a mode nobody wants costs a slot on the first screen of
 * every shift, and a switcher is not a parking lot.
 *
 * Home is a Workbench (pick a mode → act in the region). `?mode=` in the URL is
 * the single source of truth — never a local `useState` (sidebar-mode law #1).
 *
 * Pure data only — no JSX. The mode LABELS and ICONS live in `SIDEBAR_PAGE_NAV`
 * (the house L2 SoT that `HeaderPageSwitcher` renders); this module keeps only
 * the vocabulary + its parser, which that registry's `resolveChild` imports so
 * the two can never disagree.
 */

export type HomeMode = 'daily' | 'today';

/**
 * `daily` is the landing view: the first screen of a shift is the checklist you
 * run and the report of who has run theirs. Change this one constant to move
 * the landing to `today` — the nav entry below reads it, so the bare `/` path
 * follows automatically.
 */
export const DEFAULT_HOME_MODE: HomeMode = 'daily';

/** Live Home modes — includes default `daily` (usually omitted from the URL). */
export const HOME_MODES = ['daily', 'today'] as const satisfies readonly HomeMode[];

export function parseHomeMode(raw: string | null | undefined): HomeMode {
  return raw === 'today' ? 'today' : DEFAULT_HOME_MODE;
}

/**
 * Wire tokens `?mode=` may carry on `/` (route-param hygiene / deep links).
 * Includes `today`. Do not round-trip {@link parseHomeMode}.
 */
export function parseHomeModeWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (HOME_MODES as readonly string[]).includes(v) ? v : null;
}
