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
  /** Selected chrome — background + inset ring; never size/height shift. */
  selectedClass: 'bg-blue-50 ring-1 ring-inset ring-blue-400',
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
