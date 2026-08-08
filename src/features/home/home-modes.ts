/**
 * Shared types + constants for the Home ("/") mode switcher.
 *
 * Home is a Workbench (pick a mode → act in the region). `?mode=` in the URL is
 * the single source of truth — never a local `useState` (sidebar-mode law #1).
 * The five modes map to the home-ops-tv-collab-surfaces plan §3.1:
 *   today | tasks | collab | forge | brief
 *
 * Pure data only — no JSX. The mode LABELS and ICONS live in `SIDEBAR_PAGE_NAV`
 * (the house L2 SoT that `HeaderPageSwitcher` renders); this module keeps only
 * the vocabulary + its parser, which that registry's `resolveChild` imports so
 * the two can never disagree.
 */

export type HomeMode = 'today' | 'inbox' | 'tasks' | 'collab' | 'forge' | 'brief';

export const DEFAULT_HOME_MODE: HomeMode = 'today';

/** Live Home modes — includes default `today` (usually omitted from the URL). */
export const HOME_MODES = [
  'today',
  'inbox',
  'tasks',
  'collab',
  'forge',
  'brief',
] as const satisfies readonly HomeMode[];

export function parseHomeMode(raw: string | null | undefined): HomeMode {
  return raw === 'inbox' ||
    raw === 'tasks' ||
    raw === 'collab' ||
    raw === 'forge' ||
    raw === 'brief'
    ? raw
    : 'today';
}

/**
 * Wire tokens `?mode=` may carry on `/` (route-param hygiene / deep links).
 * Includes `today`. Do not round-trip {@link parseHomeMode}.
 */
export function parseHomeModeWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (HOME_MODES as readonly string[]).includes(v) ? v : null;
}

/**
 * Forge (Plans Live) primary pane. `live` is the bookmark/alias for agent-primary
 * (`/?mode=forge&view=live` from `/forge` and the Plans spine pin).
 */
export type ForgeView = 'agent' | 'doc';

/** Wire tokens `?view=` may carry under Home › Forge. */
export const FORGE_VIEW_WIRE = ['live', 'agent', 'doc'] as const;

export function parseForgeView(raw: string | null | undefined): ForgeView {
  return raw === 'doc' ? 'doc' : 'agent';
}

/** Canonical URL value for a forge view (`live` preferred over `agent` for bookmarks). */
export function forgeViewParam(view: ForgeView): 'live' | 'doc' {
  return view === 'doc' ? 'doc' : 'live';
}

/** Wire tokens for Forge `?view=` hygiene (includes alias `live`). */
export function parseForgeViewWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (FORGE_VIEW_WIRE as readonly string[]).includes(v) ? v : null;
}
