/**
 * Workspace mode registry — the single source of truth for "what is each mode".
 *
 * Three surfaces share the receiving/tech workspace cards but are distinct mode
 * DISPLAYS, not one panel with bits hidden:
 *   - `unbox`   (/receiving)            — scan → identify → serial → print · receive
 *   - `triage`  (/receiving?mode=triage)— fast classify pass → save for unbox
 *   - `testing` (/test?view=testing)    — verdict pills → pass · print
 *     (tested-lines browse when no line is selected)
 *
 * Card visibility is no longer a shared matrix — unbox and triage are separate
 * panels (`LineEditPanel` / `TriagePanel`) that each declare their own sections.
 * This registry owns the cross-mode chrome config the unified pane header needs
 * — which toolbar actions a mode shows, which rail/table navigation channel
 * its prev/next drives — plus pointers into `STATION_TERMINAL_REGISTRY` for the
 * tab-aware bottom dock. Adding a mode = one row here.
 */

export type WorkspaceMode = 'unbox' | 'triage' | 'testing';

/** Pane-header action buttons. The header renders the subset each mode lists. */
export type HeaderActionKey =
  | 'refresh' // re-sync this line from Zoho by tracking number
  | 'share' // copy/native-share a deep link to this package
  | 'audit' // open the inventory-events audit modal
  | 'copy' // copy package + PO details to the clipboard
  | 'photoNote' // send this PO's photos to a Zendesk ticket as an internal note
  | 'movePhotos' // bidirectional move photos between this carton and another PO
  | 'pair' // open the cross-platform SKU pairing modal (testing only)
  | 'details'; // right-slot Info → receiving-details overlay

/**
 * Custom-event name a mode's prev/next chevrons dispatch.
 *   - `receiving-navigate-table` → Unbox/Triage sidebar rail (and History/
 *     Incoming table when those modes are active)
 *   - `testing-navigate-rail` → Testing sidebar rail
 * Shared header reads this instead of hard-coding the channel.
 */
export type NavChannel = 'receiving-navigate-table' | 'testing-navigate-rail';

export interface ModeDef {
  /** Human label (rail header / a11y). */
  label: string;
  /** Toolbar actions shown in the pane header, left → right. */
  headerActions: HeaderActionKey[];
  /** Right-slot Info button → receiving-details overlay (receiving modes only). */
  showDetails: boolean;
  /** Which navigation event prev/next dispatches for this mode. */
  navChannel: NavChannel;
  /**
   * Key into `STATION_TERMINAL_REGISTRY` (`src/lib/station-terminal`) — which
   * terminal-dock slice owns this mode's bottom CTA.
   */
  terminalSlice: WorkspaceMode;
  /** True when the mode hosts a SectionTabsSlider (tab-aware terminal). */
  hasSectionTabs: boolean;
}

export const WORKSPACE_MODES: Record<WorkspaceMode, ModeDef> = {
  unbox: {
    label: 'Unbox',
    headerActions: ['refresh', 'share', 'audit', 'copy', 'movePhotos', 'photoNote'],
    showDetails: true,
    navChannel: 'receiving-navigate-table',
    terminalSlice: 'unbox',
    hasSectionTabs: true,
  },
  triage: {
    label: 'Arrival',
    headerActions: ['refresh', 'share', 'audit', 'copy', 'movePhotos', 'photoNote'],
    showDetails: true,
    navChannel: 'receiving-navigate-table',
    terminalSlice: 'triage',
    hasSectionTabs: true,
  },
  testing: {
    label: 'Testing',
    headerActions: ['refresh', 'share', 'audit', 'pair', 'copy', 'movePhotos', 'photoNote', 'details'],
    showDetails: true,
    navChannel: 'testing-navigate-rail',
    terminalSlice: 'testing',
    hasSectionTabs: true,
  },
};

export function workspaceMode(mode: WorkspaceMode): ModeDef {
  return WORKSPACE_MODES[mode] ?? WORKSPACE_MODES.unbox;
}
