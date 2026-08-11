/**
 * Unbox side displays — which surface the right-edge Displays push column shows.
 *
 * Pure: no React. The workbench body no longer hosts a tab strip
 * (`overview` IS the centre), so this vocabulary covers only the surfaces
 * that live in {@link StationDisplaysPushStack}.
 *
 * Navigation is Root-to-Leaf drill-down (local React state via
 * `useUnboxDisplayView` — Arrival parity; never URL wires):
 *   - `display === 'index'` → Root Index (status rows)
 *   - `display === <leaf>` → full-height leaf body
 *   - `null` → column CLOSED
 *
 * Index / leaf order (PO-identity first): Listings · Classify · Pairing · Inventory ·
 * Units · Prebox · Photos · Ticket · Tracking · Timeline · Support. Ticket is
 * presence-exclusive (Claim vs Chat). Inventory is a **secondary vertical drill**
 * (Information · Lines · PO notes · Activity) via `useDisplaysLeafChrome` — never
 * a nested TabDisplay and never a second LeafHeader. Photos · Linkage are
 * **armed-row verbs + local nest drills**. Prebox is an Assets peer leaf (not
 * nested under Units). `checklist` is a Displays leaf (never a floor % ring).
 *
 * Legacy aliases (one release): `pairing` / `po-note` → `linkage`;
 * `claim` → `ticket` (with `ticketAction=claim`).
 */

import { STATION_DISPLAY_INDEX } from '@/components/station/displays/display-index';

/**
 * Sentinel — Displays open on the Root Index (no leaf body).
 *
 * DERIVED from {@link STATION_DISPLAY_INDEX}, never re-typed: a hand-written
 * `'index'` twin here would go on compiling if the station SoT ever moved, and
 * Unbox would silently stop agreeing with the shared push stack about what
 * "open on the index" means. Deep import (not the `station/displays` barrel) so
 * this stays a pure module and cannot pull the push column's React graph in.
 */
export const UNBOX_DISPLAY_INDEX = STATION_DISPLAY_INDEX;

export type UnboxSideTab =
  | 'ticket'
  | 'photos'
  | 'linkage'
  | 'inventory'
  | 'classify'
  | 'listings'
  | 'units'
  | 'prebox'
  | 'checklist'
  | 'support'
  | 'tracking'
  | 'timeline';

/** Nav id: closed is `null`; open is index or a content leaf. */
export type UnboxDisplayNav = typeof UNBOX_DISPLAY_INDEX | UnboxSideTab;

/**
 * Photos leaf surfaces (`photoAction` nest). Absent / legacy `browse` → armed
 * Actions rows (no nested TabDisplay). Move · Send · Compare are nest
 * drill-downs from those rows (Compare = listing vs bench — trailing).
 *
 * {@link UNBOX_PHOTO_ACTION_ORDER}: default first, then drill surfaces — not a
 * horizontal tab strip. Never land a trailing verb when `photoAction` is absent.
 *
 * `link` is the exact-linkage attach surface (select carton photos → Link to a
 * PO item · Link as an aspect → reassign). It replaced the off-screen dock
 * popover — the attach grid lives in the rail, never a floating panel.
 */
export type UnboxPhotoAction = 'actions' | 'link' | 'move' | 'send' | 'compare';

/** Photos nest surfaces — Actions (default) → Link · Move · Send → Compare. */
export const UNBOX_PHOTO_ACTION_ORDER = [
  'actions',
  'link',
  'move',
  'send',
  'compare',
] as const satisfies readonly UnboxPhotoAction[];

/**
 * Linkage leaf surfaces (`linkageAction` nest). Absent → armed Actions rows;
 * `link` · `note` are nest drill-downs (Photos twin).
 */
export type UnboxLinkageAction = 'actions' | 'link' | 'note';

const UNBOX_LINKAGE_ACTION_ORDER = [
  'actions',
  'link',
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
  'classify',
  'linkage',
  'inventory',
  'units',
  'prebox',
  'photos',
  'ticket',
  'tracking',
  'timeline',
  'support',
];

/**
 * Index-visible leaves — PO-identity first; Assets = Inventory · Units · Prebox ·
 * Photos; `checklist` trails (was ring-only; now a Root Index row, never a floor
 * % ring).
 */
export const UNBOX_STRIP_TAB_ORDER: readonly UnboxSideTab[] = [
  'listings',
  'classify',
  'linkage',
  'inventory',
  'units',
  'prebox',
  'photos',
  'ticket',
  'tracking',
  'timeline',
  'support',
  'checklist',
];

/** Per-carton visibility gates. */
export interface UnboxSideTabGates {
  /** Always true today — Classify is the SoT editor for both lanes. */
  hasClassifyTab: boolean;
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
  /** Tracking, serials, or a carton id — anything with a history to show. */
  hasTimelineTab: boolean;
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
  return canonicalizeUnboxSideTab(raw);
}

/**
 * Resolve Displays open state + active leaf.
 *
 * - `null` → closed
 * - `index` → open on Root Index (`leaf: null`)
 * - leaf id → open on that leaf (gated-off falls back to first visible index leaf)
 */
export function resolveUnboxDisplayNav(
  requested: UnboxDisplayNav | null,
  gates: UnboxSideTabGates,
): { open: boolean; leaf: UnboxSideTab | null } {
  if (requested == null) return { open: false, leaf: null };
  if (requested === UNBOX_DISPLAY_INDEX) return { open: true, leaf: null };
  return { open: true, leaf: resolveUnboxSideTab(requested, gates) };
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
    case 'classify':
      return gates.hasClassifyTab;
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
    // Ticket · Photos · Prebox · Checklist · Support — always on an open carton.
    // Prebox is an Assets peer leaf (empty body when no serials — never gated off).
    case 'ticket':
    case 'photos':
    case 'prebox':
    case 'checklist':
    case 'support':
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
