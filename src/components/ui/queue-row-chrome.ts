/** Horizontal chrome + selection for ops/station queue rows (Receiving, Orders, Shipped, Tech/Packer). */

import { STATION_SCAN_ACTIVE_WELL_CLASS } from '@/components/station/scan-depth';
import type { GridSurfaceCapabilities } from '@/design-system/components/grid';

/** Default / wide tracks mirror META_COL.indent / indentWide. */
export const QUEUE_ROW_META_INDENT = {
  default: '1.25rem',
  wide: '1.75rem',
} as const;

/**
 * Horizontal chrome + selection for ops/station queue rows.
 */
export const QUEUE_ROW = {
  /** Canonical row + group-header horizontal padding (matches DateGroupHeader). */
  px: 'px-3',
  /**
   * Select-mode checkbox leading: `w-4` box + `mr-2` = 1.5rem. Meta indent must
   * add this same offset so qty stays under the shifted title.
   */
  selectGutter: '1.5rem',
  /**
   * Selected chrome for **list / accordion** rows (no cell-rule grid) —
   * background + inset ring; never size/height shift.
   */
  selectedClass: 'bg-blue-50 ring-1 ring-inset ring-blue-400',
  /** Selected chrome for a list/accordion row on a **scan-station well** (Unbox Items band body → `STATION_BAND_BODY_WELL_CLASS`). */
  selectedStationClass: STATION_SCAN_ACTIVE_WELL_CLASS,
  /** Selected chrome for **airtable LedgerGrid** rows — fill only. */
  selectedLedgerClass: 'bg-blue-50',
  /**
   * Linked-peer chrome for **airtable LedgerGrid** rows — quieter than
   * selection. Used by Unbox compare crosshair (same carton in another pane).
   * Never blue — linked ≠ "working this row."
   */
  linkedLedgerClass: 'bg-surface-sunken',
} as const;

/** Selected chrome for **navigator** rows in a context rail — facet scopes, saved views, capture-day leaves, Desk smart segments. */
export const NAV_ROW = {
  selectedClass: 'bg-surface-sunken font-semibold text-text-default',
} as const;

/** Interactive chrome + state fill for one LedgerGrid **leaf row**. */
function ledgerRowStateClass(
  selected: boolean,
  flagClass?: string | null,
  linked = false,
): string {
  const fill = selected
    ? QUEUE_ROW.selectedLedgerClass
    : linked
      ? QUEUE_ROW.linkedLedgerClass
      : (flagClass || 'bg-surface-card');
  return [
    'cursor-pointer border-b border-border-hairline px-0 py-0 transition-colors',
    // A flagged row keeps its wash under the pointer.
    flagClass && !selected && !linked ? '' : 'hover:bg-surface-hover',
    fill,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Capability-gated leaf-row fill for airtable LedgerGrid skins. */
export function ledgerRowFillClass(opts: {
  selected: boolean;
  /**
   * Same-carton peer highlight (Unbox compare crosshair). Ignored when
   * `selected` is true — working-row blue outranks linked wash.
   */
  linked?: boolean;
  /** Pre-resolved wash from the domain flag SoT (e.g. `order-row-flags`). */
  flagClass?: string | null;
  capabilities: Pick<GridSurfaceCapabilities, 'rowTriageFlags'>;
}): string {
  const flag =
    opts.capabilities.rowTriageFlags && opts.flagClass ? opts.flagClass : null;
  return ledgerRowStateClass(opts.selected, flag, Boolean(opts.linked));
}

type MetaIndentTrack = 'default' | 'wide';

/** Meta `paddingLeft` paired to RowTitle dot track (+ select gutter when on). */
export function metaIndentFor(track: MetaIndentTrack, selectMode: boolean): string {
  const base = QUEUE_ROW_META_INDENT[track];
  return selectMode ? `calc(${base} + ${QUEUE_ROW.selectGutter})` : base;
}
