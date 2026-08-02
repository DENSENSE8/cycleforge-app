/**
 * Unbox side displays — which tab the right-edge Displays push column shows.
 *
 * Pure: no React, no imports. The workbench body no longer hosts a tab strip
 * (`overview` IS the centre), so this vocabulary covers only the eight surfaces
 * that moved to {@link ReceivingDisplaysPushStack}.
 *
 * `checklist` is a valid Displays body id and deep-link (`?display=checklist`) but
 * is **ring-only** — it does not appear on the icon strip (2026-08-02). The pane
 * scan-progress ring is the sole Checklist entry. It is a second VIEW of the centre's
 * work cards, never a second derivation — both read `useUnboxProcedureSteps`.
 *
 * `null` means the Displays column is CLOSED — there is no separate open flag,
 * so there is nothing to keep in sync and no vestigial "active tab while
 * hidden" state.
 */

export type UnboxSideTab =
  | 'classify'
  | 'pairing'
  | 'listings'
  | 'units'
  | 'po-note'
  | 'checklist'
  | 'support'
  | 'tracking'
  | 'timeline';

/** All display body ids — includes ring-only `checklist`. */
export const UNBOX_SIDE_TAB_ORDER: readonly UnboxSideTab[] = [
  'checklist',
  'classify',
  'pairing',
  'listings',
  'units',
  'po-note',
  'support',
  'tracking',
  'timeline',
];

/** Strip-visible tabs only — `checklist` opens from the scan-progress ring. */
export const UNBOX_STRIP_TAB_ORDER: readonly UnboxSideTab[] = UNBOX_SIDE_TAB_ORDER.filter(
  (tab) => tab !== 'checklist',
);

/** Per-carton visibility gates (unfound vs matched, local pickup, serials, …). */
export interface UnboxSideTabGates {
  /** Always true today — Classify is the SoT editor for both lanes. */
  hasClassifyTab: boolean;
  /**
   * Package Pairing needs a carton record to pair — without one the hub can
   * only teach ("scan its tracking"), which is not a display worth a strip cell.
   */
  hasPairingTab: boolean;
  /** Matched cartons only (an unfound carton has no listing to link). */
  hasListingsTab: boolean;
  /** At least one serial scanned on the line. */
  hasUnits: boolean;
  /** Matched + a real carton row — the synced PO note lives on the carton. */
  hasPoNoteTab: boolean;
  /** Hidden for local-pickup fulfilment (no carrier leg to track). */
  hasTrackingTab: boolean;
  /** Tracking, serials, or a carton id — anything with a history to show. */
  hasTimelineTab: boolean;
}

export function isUnboxSideTabVisible(tab: UnboxSideTab, gates: UnboxSideTabGates): boolean {
  switch (tab) {
    case 'classify':
      return gates.hasClassifyTab;
    case 'pairing':
      return gates.hasPairingTab;
    case 'listings':
      return gates.hasListingsTab;
    case 'units':
      return gates.hasUnits;
    case 'po-note':
      return gates.hasPoNoteTab;
    case 'tracking':
      return gates.hasTrackingTab;
    case 'timeline':
      return gates.hasTimelineTab;
    // Checklist + Support are always available on an open carton.
    case 'checklist':
    case 'support':
      return true;
  }
}

/**
 * Resolve the tab the Displays column should actually render.
 *
 * `null` in → `null` out (closed). A requested tab that has since been gated
 * off (the operator cleared the last serial while Units was open) falls back to
 * the first visible tab rather than painting an empty column.
 */
export function resolveUnboxSideTab(
  requested: UnboxSideTab | null,
  gates: UnboxSideTabGates,
): UnboxSideTab | null {
  if (requested == null) return null;
  if (isUnboxSideTabVisible(requested, gates)) return requested;
  return UNBOX_STRIP_TAB_ORDER.find((tab) => isUnboxSideTabVisible(tab, gates)) ?? null;
}
