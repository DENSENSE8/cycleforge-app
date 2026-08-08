/**
 * Unbox side displays — which surface the right-edge Displays push column shows.
 *
 * Pure: no React. The workbench body no longer hosts a tab strip
 * (`overview` IS the centre), so this vocabulary covers only the surfaces
 * that live in {@link StationDisplaysPushStack}.
 *
 * Navigation is Root-to-Leaf drill-down (not a horizontal icon plate):
 *   - `?display=index` → Root Index (status rows)
 *   - `?display=<leaf>` → full-height leaf body
 *   - absence → column CLOSED
 *
 * Index / leaf order: Ticket · Photos · Linkage · Inventory · Classify · Units ·
 * Listings · Support · Tracking · Timeline. Ticket is presence-exclusive
 * (Claim vs Chat). Inventory is one stacked dossier (no nested tabs). Units nests
 * Units · Prebox. `checklist` is ring-only (progress chrome — never an index row).
 *
 * Legacy aliases (one release): `pairing` / `po-note` → `linkage`;
 * `claim` → `ticket` (with `ticketAction=claim`).
 */

import { STATION_DISPLAY_INDEX } from '@/components/station/displays/display-index';

/**
 * Sentinel URL value — Displays open on the Root Index (no leaf body).
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
  | 'checklist'
  | 'support'
  | 'tracking'
  | 'timeline';

/** URL / nav id: closed is `null`; open is index or a content leaf. */
export type UnboxDisplayNav = typeof UNBOX_DISPLAY_INDEX | UnboxSideTab;

/**
 * Nested Photos topic actions (`?photoAction=`). Absent / legacy `browse` → Move
 * (gallery browse lives on identity peek / lightbox, not this host).
 */
export type UnboxPhotoAction = 'move' | 'send';

/** Nested Linkage topic actions (`?linkageAction=`). */
export type UnboxLinkageAction = 'link' | 'note';

/**
 * Ticket topic surface derived from linked-ticket presence (`?ticketAction=`
 * is written for URL hygiene — not a nested verb switcher).
 */
export type UnboxTicketAction = 'chat' | 'claim';

/** Nested Units topic actions (`?unitsAction=`). */
export type UnboxUnitsAction = 'units' | 'prebox';

/** All display body ids — includes ring-only `checklist`. */
export const UNBOX_SIDE_TAB_ORDER: readonly UnboxSideTab[] = [
  'checklist',
  'ticket',
  'photos',
  'linkage',
  'inventory',
  'classify',
  'listings',
  'units',
  'support',
  'tracking',
  'timeline',
];

/**
 * Index-visible leaves — `checklist` opens from the progress ring chrome only
 * (never a Root Index row).
 */
export const UNBOX_STRIP_TAB_ORDER: readonly UnboxSideTab[] = UNBOX_SIDE_TAB_ORDER.filter(
  (tab) => tab !== 'checklist',
);

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
  /** At least one serial scanned on the line. */
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
 * Parse `?display=` into nav. `index` opens the Root Index; leaf ids canonicalize;
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
  // Legacy `browse` / absent → Move (default Photos verb).
  if (raw === 'send') return 'send';
  return 'move';
}

export function parseUnboxUnitsAction(
  raw: string | null,
  gates: { hasPrebox: boolean },
): UnboxUnitsAction {
  if (raw === 'prebox' && gates.hasPrebox) return 'prebox';
  return 'units';
}

export function parseUnboxLinkageAction(
  raw: string | null,
  gates: Pick<UnboxSideTabGates, 'hasPoNoteTab'>,
): UnboxLinkageAction {
  if (raw === 'note' && gates.hasPoNoteTab) return 'note';
  return 'link';
}

/**
 * Resolve Ticket surface from linked-ticket presence only.
 *
 * No linked ticket → Claim (New ticket · Link existing). Linked ticket → Chat.
 * URL `?ticketAction=` is ignored for which body mounts — presence wins.
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
    // Ticket · Photos · Checklist · Support — always on an open carton.
    case 'ticket':
    case 'photos':
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
