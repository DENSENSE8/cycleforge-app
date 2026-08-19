/**
 * Station Displays leaf-command footer — opt-in slash actions.
 *
 * Footer stages (SoT):
 *   - `index-filter` — Root Index (`TechRailSearchBar` · Filter displays…)
 *   - `leaf-dismiss` — default leaf (same Filter + `→|` band as index)
 *   - `leaf-command` — leaf registers {@link DisplaysFooterCommand}[] via
 *     {@link useDisplaysLeafChrome} `setLeafCommands`
 *
 * Filter / hide always sit **above** the carton Macro icon row.
 *
 * Commands compose existing leaf / terminal / print owners — never page-local
 * fetchers, never raw status SQL, never orgId from the body.
 */

export type DisplaysFooterStage = 'index-filter' | 'leaf-dismiss' | 'leaf-command';

export type DisplaysFooterCommand = {
  /** Stable id for list keys + tests (e.g. `change-po`). */
  id: string;
  /**
   * Slash face without a leading `/` (e.g. `change po` → paints `/change po`).
   * Letters + spaces; never a bare digit bind.
   */
  slash: string;
  /** Operator-facing label beside the slash. */
  label: string;
  disabled?: boolean;
  onAction: () => void;
};

/** Paint `/change po` from `{ slash: 'change po' }`. */
export function formatDisplaysFooterSlash(slash: string): string {
  const trimmed = slash.trim().replace(/^\/+/, '');
  return trimmed ? `/${trimmed}` : '/';
}
