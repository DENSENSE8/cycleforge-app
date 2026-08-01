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
  /**
   * Legacy Info → receiving-details overlay. Always false — observe utilities
   * live on `/carton/[id]` (decision 2a). Kept so the toolbar can stay keyed.
   */
  showDetails: boolean;
  /** Which navigation event prev/next dispatches for this mode. */
  navChannel: NavChannel;
  /**
   * Key into `STATION_TERMINAL_REGISTRY` (`src/lib/station-terminal`) — which
   * terminal-dock slice owns this mode's bottom CTA.
   */
  terminalSlice: WorkspaceMode;
  /**
   * True when the mode's terminal dock is TAB-AWARE — i.e. its
   * `STATION_TERMINAL_REGISTRY` slice maps tab ids to kinds. Unbox is `false`:
   * it still has a SectionTabsSlider, but that slider lives in the right-edge
   * Displays push column and the dock stays carton-terminal (Print · Receive).
   * Pinned against the terminal registry by `station-terminal.test.ts`.
   */
  hasSectionTabs: boolean;
}

export const WORKSPACE_MODES: Record<WorkspaceMode, ModeDef> = {
  unbox: {
    label: 'Unbox',
    // Share / Audit / Copy / Refresh live on `/carton/[id]`; Move photos on the
    // photo gallery. Ticket (photoNote) stays on the carton photo dropdown.
    // PO link is the carton `#` chip → Package Pairing.
    headerActions: [],
    showDetails: false,
    navChannel: 'receiving-navigate-table',
    terminalSlice: 'unbox',
    // Displays live in the right-edge push column; the dock never changes with
    // the selected display. See the field docblock above.
    hasSectionTabs: false,
  },
  triage: {
    label: 'Arrival',
    // Share / Audit / Copy / Refresh live on `/carton/[id]`; Move photos on the
    // photo gallery. PO link is the carton `#` chip → Package Pairing.
    headerActions: [],
    showDetails: false,
    navChannel: 'receiving-navigate-table',
    terminalSlice: 'triage',
    hasSectionTabs: true,
  },
  testing: {
    label: 'Testing',
    // Refresh + Pair only; Share / Audit / Copy / Info live on carton read.
    // Move photos on the photo gallery; photoNote on ReceivingPhotoButton.
    headerActions: ['refresh', 'pair'],
    showDetails: false,
    navChannel: 'testing-navigate-rail',
    terminalSlice: 'testing',
    hasSectionTabs: true,
  },
};

export function workspaceMode(mode: WorkspaceMode): ModeDef {
  return WORKSPACE_MODES[mode] ?? WORKSPACE_MODES.unbox;
}
