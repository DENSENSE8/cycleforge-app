/**
 * Horizontal chrome + selection for ops/station queue rows (Receiving, Orders,
 * Shipped, Tech/Packer). Vertical density stays in `table-density.ts`.
 *
 * Left-edge stack (title text x), outer → inner:
 *   page gutter → card → [optional nest] → QUEUE_ROW.px → [select gutter] →
 *   META_COL dotTrack → title. Meta indent = metaIndentFor(track, selectMode).
 *
 * Paired with META_COL in RowMetaColumns — keep both the single source for
 * queue-row left alignment.
 */

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
  /**
   * Selected chrome for **airtable LedgerGrid** rows — fill only.
   *
   * An inset ring on the row fights `[data-grid-skin='airtable']` paint order:
   * sticky identity cells (`bg-inherit` + `z-raised`) cover left, cell
   * RIGHT+BOTTOM rules cover those edges, and transparent fact cells leave
   * only a top/right L-glow. Sheets/Airtable selection is a wash; use this
   * (via {@link ledgerRowStateClass} or Pending `gridSkin`) — never
   * {@link QUEUE_ROW.selectedClass} under the skin.
   */
  selectedLedgerClass: 'bg-blue-50',
  /**
   * Expanded-group child nest when a disclosure chevron is shown — pad past the
   * glyph so nesting reads clearly.
   */
  nestWithChevron: 'pl-5',
  /**
   * Expanded-group child nest when chevron is hidden — border + wash only so
   * nested lines share the singleton title edge.
   */
  nestNoChevron: 'pl-0',
} as const;

/**
 * Interactive chrome + state fill for one LedgerGrid **leaf row**.
 *
 * Four grid families (Unbox/History, Incoming, Catalog, Repair) each carried a
 * byte-identical copy of the hover/border string AND a hand-typed zebra
 * ternary. This is the one home for both.
 *
 * **There is no zebra here, deliberately.** Zebra exists to carry row tracking
 * on a surface with no cell rules; every LedgerGrid draws a full cell rule grid
 * inside a raised card frame, so a stripe is a THIRD separation system on top
 * of rules and hover. Its fill (`surface-canvas`) is also a page-canvas ground
 * plane tuned for floating cards, not a row tint — at that luminance step the
 * shaded rows read as a different SURFACE rather than the same one alternately
 * banded. The Pending grid removed it first (2026-07) and the rest followed
 * here; rules + hover + the selected fill carry row tracking on all of them.
 * Do not reintroduce an `index % 2` fill — guard:
 * `ledger-row-zebra.guard.test.ts`.
 *
 * Selection is fill only under airtable (see {@link QUEUE_ROW.selectedLedgerClass}),
 * never a size/height shift — every state below keeps identical row geometry.
 *
 * `flagClass` is the operator-set triage wash (Orders: `orderRowFlagClass`).
 * **Selection outranks it** — the row being edited must look picked, not
 * tagged, and the operator can only edit one row at a time while any number
 * may be flagged. The flag is still readable from its dot while selected.
 *
 * Prefer {@link ledgerRowFillClass} at call sites — it gates the flag wash on
 * the surface's `GridSurfaceCapabilities.rowTriageFlags` so Catalog / Receiving
 * cannot paint staff triage colours even if a flag class is passed by mistake.
 */
export function ledgerRowStateClass(selected: boolean, flagClass?: string | null): string {
  return [
    'cursor-pointer border-b border-border-hairline px-0 py-0 transition-colors',
    // A flagged row keeps its wash under the pointer. The generic hover fill
    // would erase the tint at exactly the moment the operator is pointing at
    // the row, which reads as "did I imagine that colour?" — the flag is a
    // fact, hover is only feedback, so the fact wins.
    flagClass && !selected ? '' : 'hover:bg-surface-hover',
    selected ? QUEUE_ROW.selectedLedgerClass : (flagClass || 'bg-surface-card'),
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Capability-gated leaf-row fill for airtable LedgerGrid skins.
 *
 * Precedence: selection → (optional triage flag) → card ground. The flag wash
 * is ignored unless `capabilities.rowTriageFlags` is true — Catalog /
 * Receiving / Incoming / Repair / Pickup declare `false`, so they stay display
 * / pick surfaces even if a caller hands a flag class.
 */
export function ledgerRowFillClass(opts: {
  selected: boolean;
  /** Pre-resolved wash from the domain flag SoT (e.g. `order-row-flags`). */
  flagClass?: string | null;
  capabilities: Pick<GridSurfaceCapabilities, 'rowTriageFlags'>;
}): string {
  const flag =
    opts.capabilities.rowTriageFlags && opts.flagClass ? opts.flagClass : null;
  return ledgerRowStateClass(opts.selected, flag);
}

type MetaIndentTrack = 'default' | 'wide';

/** Meta `paddingLeft` paired to RowTitle dot track (+ select gutter when on). */
export function metaIndentFor(track: MetaIndentTrack, selectMode: boolean): string {
  const base = QUEUE_ROW_META_INDENT[track];
  return selectMode ? `calc(${base} + ${QUEUE_ROW.selectGutter})` : base;
}

/** Nest padding class for CollapsibleGroupRow children. */
export function queueGroupNestClass(showChevron: boolean): string {
  return showChevron ? QUEUE_ROW.nestWithChevron : QUEUE_ROW.nestNoChevron;
}
