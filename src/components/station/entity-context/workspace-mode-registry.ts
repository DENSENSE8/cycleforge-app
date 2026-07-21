/**
 * Workspace mode registry — **station entity-context SoT**.
 *
 * Cross-mode chrome config for Unbox / Triage / Testing:
 * which toolbar actions a mode shows, which rail/table navigation channel
 * its prev/next drives — plus pointers into `STATION_TERMINAL_REGISTRY` for the
 * tab-aware bottom dock. Adding a mode = one row here.
 *
 * Prefer importing from `@/components/station/entity-context`.
 */

export type WorkspaceMode = 'unbox' | 'triage' | 'testing';

/** Pane-header action buttons. The header renders the subset each mode lists. */
export type HeaderActionKey =
  | 'refresh' // re-sync this line from Zoho by tracking number
  | 'share' // copy/native-share a deep link to this package
  | 'audit' // open the inventory-events audit modal
  | 'copy' // copy package + PO details to the clipboard
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
type NavChannel = 'receiving-navigate-table' | 'testing-navigate-rail';

interface ModeDef {
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
    // photoNote lives on the carton photo dropdown (ReceivingPhotoButton), not More.
    headerActions: ['refresh', 'share', 'audit', 'copy', 'movePhotos'],
    showDetails: true,
    navChannel: 'receiving-navigate-table',
    terminalSlice: 'unbox',
    hasSectionTabs: true,
  },
  triage: {
    label: 'Arrival',
    // photoNote lives on the carton photo dropdown (ReceivingPhotoButton), not More.
    headerActions: ['refresh', 'share', 'audit', 'copy', 'movePhotos'],
    showDetails: true,
    navChannel: 'receiving-navigate-table',
    terminalSlice: 'triage',
    hasSectionTabs: true,
  },
  testing: {
    label: 'Testing',
    // photoNote lives on the carton photo dropdown (ReceivingPhotoButton), not toolbar.
    headerActions: ['refresh', 'share', 'audit', 'pair', 'copy', 'movePhotos', 'details'],
    showDetails: true,
    navChannel: 'testing-navigate-rail',
    terminalSlice: 'testing',
    hasSectionTabs: true,
  },
};

export function workspaceMode(mode: WorkspaceMode): ModeDef {
  return WORKSPACE_MODES[mode] ?? WORKSPACE_MODES.unbox;
}
