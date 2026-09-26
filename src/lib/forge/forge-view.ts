/** Forge (Plans Live) `?view=` vocabulary — the forge's own param contract. */

/**
 * Forge (Plans Live) primary pane. `live` is the bookmark/alias for
 * agent-primary (`/forge?view=live` from the Plans spine pin).
 */
type ForgeView = 'agent' | 'doc';

/** Wire tokens `?view=` may carry on `/forge`. */
const FORGE_VIEW_WIRE = ['live', 'agent', 'doc'] as const;

export function parseForgeView(raw: string | null | undefined): ForgeView {
  return raw === 'doc' ? 'doc' : 'agent';
}

/** Canonical URL value for a forge view (`live` preferred over `agent` for bookmarks). */
export function forgeViewParam(view: ForgeView): 'live' | 'doc' {
  return view === 'doc' ? 'doc' : 'live';
}

/** Wire tokens for Forge `?view=` hygiene (includes alias `live`). */
function parseForgeViewWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (FORGE_VIEW_WIRE as readonly string[]).includes(v) ? v : null;
}
