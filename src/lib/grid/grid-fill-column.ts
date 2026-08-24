/**
 * The one declaration of the trailing filler track. Spread it as the LAST entry
 * of a column model: `[...facts, GRID_FILL_COLUMN]`.
 *
 * **Why every family needs the track.** The house law (Receiving golden, same
 * as Orders) is: every fact column is content-hard, and a zero-floor filler at
 * the right edge absorbs the slack so the sheet fills its pane. A `1fr` hung
 * off a *frozen* content column is a contradiction, not a preference:
 * `gridFrozenLeft` sums each locked column's DECLARED rem to compute the next
 * frozen cell's sticky `left`, so a track that renders wider than its floor
 * puts every following frozen cell out by exactly that difference. Slack must
 * land somewhere nothing is pinned to.
 *
 * Structural, never a fact column: no label, no type, no `hideKey`, no `tier`,
 * never sortable, never resizable. The render half is `GridFillCell`.
 */
export const GRID_FILL_COLUMN = {
  key: '_fill' as const,
  width: 'minmax(0rem, 1fr)',
  sortable: false,
  resizable: false,
};
