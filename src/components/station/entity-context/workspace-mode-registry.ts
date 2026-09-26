/** Workspace mode registry — **station entity-context SoT**. */

export type WorkspaceMode = 'unbox' | 'triage' | 'testing';

/** Custom-event name a mode's prev/next chevrons dispatch. */
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
  /** True when the mode's terminal dock is TAB-AWARE — i.e. */
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
