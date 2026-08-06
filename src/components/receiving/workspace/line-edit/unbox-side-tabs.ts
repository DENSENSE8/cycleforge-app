/**
 * Unbox side displays — which tab the right-edge Displays push column shows.
 *
 * Pure: no React, no imports. The workbench body no longer hosts a tab strip
 * (`overview` IS the centre), so this vocabulary covers only the surfaces
 * that live in {@link ReceivingDisplaysPushStack}.
 *
 * Strip order (left → right): Ticket · Photos · Linkage · Classify · Units —
 * overflow Support / Tracking / Timeline. Ticket is presence-exclusive
 * (Claim create/link vs Chat — no nested Chat · Claim tabs).
 * Units nests Units · Prebox. `checklist` is ring-only.
 *
 * Legacy aliases (one release): `pairing` / `po-note` → `linkage`;
 * `claim` → `ticket` (with `ticketAction=claim`).
 *
 * `null` means the Displays column is CLOSED — there is no separate open flag.
 */

export type UnboxSideTab =
  | 'ticket'
  | 'photos'
  | 'linkage'
  | 'classify'
  | 'listings'
  | 'units'
  | 'checklist'
  | 'support'
  | 'tracking'
  | 'timeline';

/** Nested Photos topic actions (`?photoAction=`). */
export type UnboxPhotoAction = 'browse' | 'move' | 'send';

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
  'classify',
  'listings',
  'units',
  'support',
  'tracking',
  'timeline',
];

/** Strip-visible tabs only — `checklist` opens from the scan-progress ring. */
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
  /** Matched cartons only (an unfound carton has no listing to link). */
  hasListingsTab: boolean;
  /** At least one serial scanned on the line. */
  hasUnits: boolean;
  /** Matched + a real carton row — Zoho note nested under Linkage. */
  hasPoNoteTab: boolean;
  /** Hidden for local-pickup fulfilment (no carrier leg to track). */
  hasTrackingTab: boolean;
  /** Tracking, serials, or a carton id — anything with a history to show. */
  hasTimelineTab: boolean;
}

/** Map retired strip ids → current vocabulary (compat deep links). */
export function canonicalizeUnboxSideTab(raw: string): UnboxSideTab | null {
  if (raw === 'pairing' || raw === 'po-note') return 'linkage';
  if (raw === 'claim') return 'ticket';
  return UNBOX_SIDE_TAB_ORDER.find((tab) => tab === raw) ?? null;
}

export function parseUnboxPhotoAction(raw: string | null): UnboxPhotoAction {
  if (raw === 'move' || raw === 'send' || raw === 'browse') return raw;
  return 'browse';
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
