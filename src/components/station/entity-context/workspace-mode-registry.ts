/**
 * Workspace mode registry — **station entity-context SoT**.
 *
 * Cross-mode chrome config for Unbox / Triage / Testing: nav channel +
 * terminal-slice pointers into `STATION_TERMINAL_REGISTRY`. Pane-header icon
 * actions (Refresh · Pair) were retired when Displays became the SoT — Unbox /
 * Arrival / Testing leave {@link StationMoreDetails} empty. Adding a mode =
 * one row here.
 *
 * Prefer importing from `@/components/station/entity-context`.
 */

export type WorkspaceMode = 'unbox' | 'triage' | 'testing';

/**
 * Custom-event name a mode's prev/next chevrons dispatch.
 *   - `receiving-navigate-table` → Unbox/Triage sidebar rail (and History/
 *     Incoming table when those modes are active)
 *   - `testing-navigate-rail` → Testing sidebar rail
 */
type NavChannel = 'receiving-navigate-table' | 'testing-navigate-rail';

interface ModeDef {
  /** Human label (rail header / a11y). */
  label: string;
  /** Which navigation event prev/next dispatches for this mode. */
  navChannel: NavChannel;
  /**
   * Key into `STATION_TERMINAL_REGISTRY` (`src/lib/station-terminal`) — which
   * terminal-dock slice owns this mode's bottom CTA.
   */
  terminalSlice: WorkspaceMode;
  /**
   * True when the mode's terminal dock is TAB-AWARE — i.e. its
   * `STATION_TERMINAL_REGISTRY` slice maps tab ids to kinds. Unbox + Testing
   * are `false`: Displays live in the right-edge push column and the dock
   * stays carton-terminal (except Testing's Ticket display, which selects
   * the ticket kind explicitly). Pinned by `station-terminal.test.ts`.
   */
  hasSectionTabs: boolean;
}

export const WORKSPACE_MODES: Record<WorkspaceMode, ModeDef> = {
  unbox: {
    label: 'Unbox',
    navChannel: 'receiving-navigate-table',
    terminalSlice: 'unbox',
    hasSectionTabs: false,
  },
  triage: {
    label: 'Arrival',
    navChannel: 'receiving-navigate-table',
    terminalSlice: 'triage',
    hasSectionTabs: true,
  },
  testing: {
    label: 'Quality Control',
    navChannel: 'testing-navigate-rail',
    terminalSlice: 'testing',
    hasSectionTabs: false,
  },
};
