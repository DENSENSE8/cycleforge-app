/**
 * Forge (Plans Live) `?view=` vocabulary — the forge's own param contract.
 *
 * Lived in `features/home/home-modes.ts` until 2026-08-19, when Home was cut
 * back to Daily + Today and the forge console moved off `/?mode=forge` onto its
 * own `/forge` route. The parser moved WITH the surface: a param vocabulary
 * belongs to the route that owns the param (`query-mode-routes.ts` → `/forge`),
 * not to whichever shell happened to host the console.
 *
 * Pure data + parsers. No JSX, no React.
 */

/**
 * Forge (Plans Live) primary pane. `live` is the bookmark/alias for
 * agent-primary (`/forge?view=live` from the Plans spine pin).
 */
export type ForgeView = 'agent' | 'doc';

/** Wire tokens `?view=` may carry on `/forge`. */
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
