/** Unbox side displays — which leaf the right-edge Displays push column shows. */

import {
  STATION_DISPLAY_INDEX,
  isDisplaysHostedLeaf,
} from '@/components/station/displays/display-index';

/** Sentinel — Displays open on the Root Index (no leaf body). */
export const UNBOX_DISPLAY_INDEX = STATION_DISPLAY_INDEX;

/**
 * Every Root Index id. `ticket` is a directory row only: selecting it hands
 * off to the header Ticket task, which owns the ticket body.
 */
export type UnboxSideTab =
  | 'ticket'
  | 'photos'
  | 'linkage'
  | 'inventory'
  | 'listings'
  | 'units'
  | 'prebox'
  | 'checklist'
  | 'tracking'
  | 'locations'
  | 'timeline';

/** Photos leaf surfaces (`photoAction` nest). The header Photos task is the gallery. */
export type UnboxPhotoAction = 'actions' | 'link' | 'move' | 'send' | 'compare';

const UNBOX_PHOTO_ACTIONS: readonly UnboxPhotoAction[] = [
  'actions',
  'link',
  'move',
  'send',
  'compare',
];

/** Linkage leaf surfaces (`linkageAction` nest). Link itself is the header Pair task. */
export type UnboxLinkageAction = 'actions' | 'return' | 'note';

const UNBOX_LINKAGE_ACTIONS: readonly UnboxLinkageAction[] = ['actions', 'return', 'note'];

/**
 * Index-visible leaves — PO-identity first; Assets = Inventory · Units · Prebox ·
 * Photos; Context = Ticket · Tracking · Locations · Timeline; Checklist trails.
 */
export const UNBOX_STRIP_TAB_ORDER: readonly UnboxSideTab[] = [
  'listings',
  'linkage',
  'inventory',
  'units',
  'prebox',
  'photos',
  'ticket',
  'tracking',
  // Locations is a TOOL (place · reprint · mint), so it sits below the
  // carton's own leaves; Checklist still trails as the procedure summary.
  'locations',
  'timeline',
  'checklist',
];

/** Per-carton visibility gates. */
export interface UnboxSideTabGates {
  /**
   * Pairing (Return # + Zoho note + pairing verbs) needs a carton record, and
   * never shows once a scanned serial traced to a return order — pairing
   * link/unlink must not display when a return is found.
   */
  hasLinkageTab: boolean;
  /**
   * Inventory dossier (PO lines · notes · activity) — carton gate; unpaired
   * cartons still get a Pair CTA inside the leaf.
   */
  hasInventoryTab: boolean;
  /** Matched cartons only (an unfound carton has no listing to link). */
  hasListingsTab: boolean;
  /** At least one serial scanned on the line / qty expected. */
  hasUnits: boolean;
  /** Matched + a real carton row — Zoho note nested under Pairing / Inventory. */
  hasPoNoteTab: boolean;
  /** Hidden for local-pickup fulfilment (no carrier leg to track). */
  hasTrackingTab: boolean;
  /** Status history needs a carton record. */
  hasTimelineTab: boolean;
}

function isUnboxSideTab(raw: string): raw is UnboxSideTab {
  return (UNBOX_STRIP_TAB_ORDER as readonly string[]).includes(raw);
}

export function parseUnboxPhotoAction(raw: string | undefined): UnboxPhotoAction {
  return UNBOX_PHOTO_ACTIONS.find((action) => action === raw) ?? 'actions';
}

export function parseUnboxLinkageAction(raw: string | undefined): UnboxLinkageAction {
  return UNBOX_LINKAGE_ACTIONS.find((action) => action === raw) ?? 'actions';
}

export function isUnboxSideTabVisible(tab: UnboxSideTab, gates: UnboxSideTabGates): boolean {
  switch (tab) {
    case 'linkage':
      return gates.hasLinkageTab;
    case 'inventory':
      return gates.hasInventoryTab;
    case 'listings':
      return gates.hasListingsTab;
    case 'units':
      return gates.hasUnits;
    case 'tracking':
      return gates.hasTrackingTab;
    case 'timeline':
      return gates.hasTimelineTab;
    // Ticket · Photos · Prebox · Checklist · Locations — always on an open carton.
    case 'ticket':
    case 'photos':
    case 'prebox':
    case 'checklist':
    case 'locations':
      return true;
  }
}

/**
 * Resolve the leaf the Displays column should actually render for the task
 * controller's `activeDisplay`.
 *
 * `null` / index / a Displays-hosted leaf (Look) → no carton leaf. A requested
 * leaf that has since been gated off falls back to the first visible strip
 * leaf rather than painting empty.
 */
export function resolveUnboxSideTab(
  requested: string | null,
  gates: UnboxSideTabGates,
): UnboxSideTab | null {
  if (requested == null || requested === UNBOX_DISPLAY_INDEX) return null;
  if (isDisplaysHostedLeaf(requested) || !isUnboxSideTab(requested)) return null;
  if (isUnboxSideTabVisible(requested, gates)) return requested;
  return UNBOX_STRIP_TAB_ORDER.find((tab) => isUnboxSideTabVisible(tab, gates)) ?? null;
}
