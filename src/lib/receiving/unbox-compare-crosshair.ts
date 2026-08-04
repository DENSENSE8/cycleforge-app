/**
 * Unbox compare linked crosshair — carton match across panes.
 *
 * Match key is `receiving_id` (carton). Hover is ephemeral; select is sticky.
 * Resolved id = hover ?? sticky. Null / non-positive carton ids never link.
 */

/** Normalize a row's carton id for crosshair state (null = no link). */
export function normalizeCartonReceivingId(
  receivingId: number | null | undefined,
): number | null {
  return typeof receivingId === 'number'
    && Number.isFinite(receivingId)
    && receivingId > 0
    ? receivingId
    : null;
}

/** Hover overrides sticky while the pointer is over a carton row. */
export function resolveUnboxCompareCrosshair(
  stickyReceivingId: number | null,
  hoverReceivingId: number | null,
): number | null {
  return hoverReceivingId ?? stickyReceivingId;
}

/**
 * Scroll the first matching carton row into view inside a pane root.
 * No-op when the element is missing (virtualized off-screen / no match).
 */
export function scrollPaneToReceivingId(
  root: ParentNode | null | undefined,
  receivingId: number,
): void {
  if (!root) return;
  const el = root.querySelector(`[data-receiving-id="${receivingId}"]`);
  if (!el || typeof (el as HTMLElement).scrollIntoView !== 'function') return;
  (el as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
