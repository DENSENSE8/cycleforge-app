/**
 * Grid column-header justification SoT.
 *
 * **A header always aligns with the data it names** — including when the track
 * is too narrow for a label and only the type glyph renders
 * (`*GridHeaderShowsLabel(column)` is false).
 *
 * This previously centered every glyph-only header, on the reasoning that a
 * lone left-hugged glyph reads as a stray mark against the ruled band. That
 * traded a real defect for a cosmetic one: centering breaks the column's
 * vertical alignment axis, so the header floats off the values beneath it and
 * the operator loses the line that ties a mark to its column — worst on a
 * narrow track, which is exactly when the label drops. A glyph is a label; it
 * belongs over its data like any other.
 *
 * `end` remains available for genuinely right-aligned numeric tracks; pass the
 * SAME alignment the cells use, never a different one.
 *
 * Every `*GridColumnHeader` composes this — never hand-roll the ternary.
 */
export type GridHeaderAlign = 'start' | 'end';

export function gridHeaderCellAlignClass(align: GridHeaderAlign = 'start'): string {
  return align === 'end' ? 'justify-end' : 'justify-start';
}
