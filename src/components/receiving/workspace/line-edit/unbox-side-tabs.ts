/** Unbox side displays — which surface the right-edge Displays push column shows. */

import {
  STATION_DISPLAY_INDEX,
  STATION_LOOK_DISPLAY_ID,
  isDisplaysHostedLeaf,
} from '@/components/station/displays/display-index';

/** Sentinel — Displays open on the Root Index (no leaf body). */
export const UNBOX_DISPLAY_INDEX = STATION_DISPLAY_INDEX;

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
  | 'locations';

/** Nav id: closed is `null`; open is index, a carton leaf, or Displays-hosted Look. */
export type UnboxDisplayNav =
  | typeof UNBOX_DISPLAY_INDEX
  | UnboxSideTab
  | typeof STATION_LOOK_DISPLAY_ID;

/** Photos leaf surfaces (`photoAction` nest). */
export type UnboxPhotoAction = 'actions' | 'link' | 'move' | 'send' | 'compare';

/** Photos nest surfaces — Actions (default) → Link · Move · Send → Compare. */
export const UNBOX_PHOTO_ACTION_ORDER = [
  'actions',
  'link',
  'move',
  'send',
  'compare',
] as const satisfies readonly UnboxPhotoAction[];

/** Linkage leaf surfaces (`linkageAction` nest). */
export type UnboxLinkageAction = 'actions' | 'link' | 'return' | 'note';

const UNBOX_LINKAGE_ACTION_ORDER = [
  'actions',
  'link',
  'return',
  'note',
] as const satisfies readonly UnboxLinkageAction[];

/**
 * Ticket topic surface derived from linked-ticket presence.
 */
export type UnboxTicketAction = 'chat' | 'claim';

const UNBOX_TICKET_ACTION_ORDER = ['chat', 'claim'] as const satisfies readonly UnboxTicketAction[];

/** All display body ids — includes Displays-leaf `checklist`. */
export const UNBOX_SIDE_TAB_ORDER: readonly UnboxSideTab[] = [
  'checklist',
  'listings',
  'linkage',
  'inventory',
  'units',
  'prebox',
  'photos',
  'ticket',
  'tracking',
  'locations',
];

/**
 * Index-visible leaves — PO-identity first; Assets = Inventory · Units · Prebox ·
 * Photos; `checklist` trails (was ring-only; now a Root Index row, never a floor
 * % ring).
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
  'checklist',
];

/** Per-carton visibility gates. */
export interface UnboxSideTabGates {
  /**
   * Linkage (Pairing + Zoho note) needs a carton record to pair — without one
   * the hub can only teach, which is not worth a strip cell.
   */
  hasLinkageTab: boolean;
  /**
   * Inventory dossier (PO lines · notes · activity) — same carton gate as
   * Linkage; unpaired cartons still get a Pair CTA inside the leaf.
   */
  hasInventoryTab: boolean;
  /** Matched cartons only (an unfound carton has no listing to link). */
  hasListingsTab: boolean;
  /** At least one serial scanned on the line / qty expected. */
  hasUnits: boolean;
  /** Matched + a real carton row — Zoho note nested under Linkage / Inventory. */
  hasPoNoteTab: boolean;
  /** Hidden for local-pickup fulfilment (no carrier leg to track). */
  hasTrackingTab: boolean;
}

/** Map retired strip ids → current vocabulary (compat deep links). Never `index`. */
export function canonicalizeUnboxSideTab(raw: string): UnboxSideTab | null {
  if (raw === UNBOX_DISPLAY_INDEX) return null;
  if (raw === 'pairing' || raw === 'po-note') return 'linkage';
  if (raw === 'claim') return 'ticket';
  return UNBOX_SIDE_TAB_ORDER.find((tab) => tab === raw) ?? null;
}

/**
 * Parse a display id into nav. `index` opens the Root Index; leaf ids canonicalize;
 * bogus → closed.
 */
export function parseUnboxDisplayNav(raw: string | null): UnboxDisplayNav | null {
  if (!raw) return null;
  if (raw === UNBOX_DISPLAY_INDEX) return UNBOX_DISPLAY_INDEX;
  if (isDisplaysHostedLeaf(raw)) return STATION_LOOK_DISPLAY_ID;
  // Retired Displays leaves (2026-08-27) — keep the column open on the index.
  if (raw === 'timeline' || raw === 'support') return UNBOX_DISPLAY_INDEX;
  return canonicalizeUnboxSideTab(raw);
}

/** Resolve Displays open state + active leaf. */
export function resolveUnboxDisplayNav(
  requested: UnboxDisplayNav | null,
  gates: UnboxSideTabGates,
): { open: boolean; leaf: UnboxSideTab | null } {
  if (requested == null) return { open: false, leaf: null };
  if (requested === UNBOX_DISPLAY_INDEX) return { open: true, leaf: null };
  if (isDisplaysHostedLeaf(requested)) return { open: true, leaf: null };
  if (!(UNBOX_SIDE_TAB_ORDER as readonly string[]).includes(requested)) {
    return { open: true, leaf: null };
  }
  return { open: true, leaf: resolveUnboxSideTab(requested as UnboxSideTab, gates) };
}

export function parseUnboxPhotoAction(raw: string | null): UnboxPhotoAction {
  if (raw === 'link') return 'link';
  if (raw === 'send') return 'send';
  if (raw === 'move') return 'move';
  if (raw === 'compare') return 'compare';
  // Absent / legacy `browse` / explicit `actions` → in-column action list.
  return 'actions';
}

/**
 * Wire tokens a Photos nest may carry (parsers / legacy hygiene strip).
 *
 * Includes live {@link UNBOX_PHOTO_ACTION_ORDER} plus legacy `browse`. Do not
 * round-trip {@link parseUnboxPhotoAction} — it always coerces to `actions`.
 */
export function parseUnboxPhotoActionWire(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if ((UNBOX_PHOTO_ACTION_ORDER as readonly string[]).includes(key)) return key;
  if (key === 'browse') return key;
  return null;
}

export function parseUnboxLinkageAction(
  raw: string | null,
  gates: Pick<UnboxSideTabGates, 'hasPoNoteTab'>,
): UnboxLinkageAction {
  if (raw === 'note' && gates.hasPoNoteTab) return 'note';
  if (raw === 'link') return 'link';
  if (raw === 'return') return 'return';
  // Absent / explicit `actions` / gated-away note → armed verb list.
  return 'actions';
}

/**
 * Resolve Ticket surface from linked-ticket presence only.
 *
 * No linked ticket → Claim (New ticket · Link existing). Linked ticket → Chat.
 * Nest `ticketAction` is ignored for which body mounts — presence wins.
 */
export function resolveUnboxTicketAction(hasTicketId: boolean): UnboxTicketAction {
  return hasTicketId ? 'chat' : 'claim';
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
    // Ticket · Photos · Prebox · Checklist — always on an open carton.
    case 'ticket':
    case 'photos':
    case 'prebox':
    case 'checklist':
    case 'locations':
      return true;
  }
}

/**
 * Resolve the tab the Displays column should actually render.
 *
 * `null` in → `null` out (closed). A requested tab that has since been gated
 * off falls back to the first visible strip tab rather than painting empty.
 */
export function resolveUnboxSideTab(
  requested: UnboxSideTab | null,
  gates: UnboxSideTabGates,
): UnboxSideTab | null {
  if (requested == null) return null;
  if (isUnboxSideTabVisible(requested, gates)) return requested;
  return UNBOX_STRIP_TAB_ORDER.find((tab) => isUnboxSideTabVisible(tab, gates)) ?? null;
}
