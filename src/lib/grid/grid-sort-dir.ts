/**
 * `GridSortDir` — the ONE spelling of a column-sort direction.
 *
 * Every LedgerGrid family used to redeclare `export type <Family>GridSortDir =
 * 'asc' | 'desc'` in its own layout module — twelve identical aliases plus the
 * header component's own `LedgerHeaderSortDir`. Thirteen names for a
 * two-member union is not type safety, it is thirteen places to look before you
 * can tell whether a surface means the same thing by "desc" as its neighbour.
 *
 * There is no per-surface variation to preserve here: a direction is a
 * direction. Column *vocabularies* stay per family (`<Family>GridColumnKey`),
 * because those genuinely differ.
 *
 * Deliberately NOT folded in: `QueueDisplaySortDir` (`@/utils/queue-display-sort`).
 * That belongs to the `?sort=`/`?dir=` DISPLAY-order vocabulary, which carries
 * composite non-column modes (`priority`, `newest`) — a different question, per
 * `source-of-truth.md` → Grid column visibility + sort. Same shape today; not
 * the same concept, so it keeps its own name.
 */
export type GridSortDir = 'asc' | 'desc';
