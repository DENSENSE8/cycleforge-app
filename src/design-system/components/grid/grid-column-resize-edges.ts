/**
 * Which edges of a resizable column mount a {@link ColumnResizeHandle}.
 *
 * Mid-grid keeps the Airtable / Sheets rule: one trailing (`end`) grip per
 * resizable column — left-of-divider owns the seam.
 *
 * At the frozen identity edge that rule alone is a footgun **when the frozen
 * edge column itself is resizable**: the sticky title's trailing grip overhangs
 * into the first scrollable column (Incoming By, Orders Ship by), so operators
 * grabbing "the date column" resize Product instead. {@link resolveColumnResizeEdges}
 * adds a leading (`start`) grip on the first resizable column after
 * `frozenEdgeKey` so the seam's scrollable-side pixels mutate the column they
 * belong to. Title still keeps a flush trailing grip.
 *
 * When the frozen edge is locked (Receiving / Unbox History: `order` is
 * `resizable: false`), there is no overhanging trailing grip to compensate for
 * — the first scrollable resizable column (Product) keeps a right (`end`) grip
 * only. Never invent a left grip there.
 */

import { isGridColumnResizable } from './grid-column-editability';

export type GridColumnResizeEdge = 'start' | 'end';

interface ResizeEdgeColumnLike {
  key: string;
  type?: string;
  resizable?: boolean;
}

/**
 * Per resizable key → edges that mount a handle.
 *
 * Every resizable column gets `'end'`. After a **resizable** `frozenEdgeKey`,
 * the first resizable column also gets `'start'`. A locked frozen edge
 * (Receiving `order`) skips the leading grip. Non-resizable keys are absent
 * from the map. If nothing after the frozen edge is resizable (Catalog: next
 * tracks are fixed-format `id` / `number`), there is no leading grip.
 */
export function resolveColumnResizeEdges(
  columns: readonly ResizeEdgeColumnLike[],
  frozenEdgeKey: string,
): Map<string, GridColumnResizeEdge[]> {
  const result = new Map<string, GridColumnResizeEdge[]>();
  const frozenIdx = columns.findIndex((c) => c.key === frozenEdgeKey);

  for (const column of columns) {
    if (!isGridColumnResizable(column)) continue;
    result.set(column.key, ['end']);
  }

  if (frozenIdx < 0) return result;

  // Leading grip exists only to compensate for the frozen edge's own
  // overhanging trailing grip. A locked identity edge mounts none.
  const frozenColumn = columns[frozenIdx]!;
  if (!isGridColumnResizable(frozenColumn)) return result;

  for (let i = frozenIdx + 1; i < columns.length; i++) {
    const column = columns[i]!;
    if (!isGridColumnResizable(column)) continue;
    const edges = result.get(column.key) ?? ['end'];
    // Leading first so mount order is start then end (stable for tests / DOM).
    result.set(column.key, edges.includes('start') ? edges : ['start', ...edges]);
    break;
  }

  return result;
}
