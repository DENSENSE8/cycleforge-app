/**
 * Hover-driven beam identity — typed last-hovered entity, not a ReactNode.
 *
 * Composer and assistant never write and never clear. Entity tiles last-write-wins
 * (Hyprland follow_mouse). Closing the source tile falls back to another entity
 * tile's payload when one exists; otherwise the snapshot stays until the next
 * entity hover.
 */

export type HeaderPublishSource = 'tile' | 'composer' | 'assistant';

export interface HeaderOrderEntity {
  readonly kind: 'order';
  readonly tileId: string;
  readonly orderKey: string;
  readonly orderNumber: string;
  readonly tracking: string | null;
  readonly platform: string | null;
  readonly urgent: boolean;
  readonly type: string | null;
  readonly price: number | null;
  readonly listingHref: string | null;
  readonly claimCount: number | null;
  readonly photoCount: number | null;
}

export type HeaderEntity = HeaderOrderEntity;

const IGNORED_TILE_REFS = new Set(['assistant', 'composer', 'chronology']);

export function isIgnoredHeaderSource(source: HeaderPublishSource): boolean {
  return source === 'composer' || source === 'assistant';
}

export function isIgnoredHeaderTileRef(ref: string): boolean {
  return IGNORED_TILE_REFS.has(ref);
}

/** Composer / assistant publishes are no-ops. Tile publishes replace. */
export function applyHeaderPublish(
  prev: HeaderEntity | null,
  next: HeaderEntity,
  source: HeaderPublishSource,
): HeaderEntity | null {
  if (isIgnoredHeaderSource(source)) return prev;
  return next;
}

/**
 * Pointer entered a tile. Ignored refs and tiles with no payload yet leave
 * the previous entity in place (queue tile, loading detail).
 */
export function applyHeaderTileHover(
  prev: HeaderEntity | null,
  tileRef: string,
  payload: HeaderEntity | null,
): HeaderEntity | null {
  if (isIgnoredHeaderTileRef(tileRef)) return prev;
  if (payload === null) return prev;
  return payload;
}

/**
 * The source tile closed. Prefer `fallback` (the newly focused entity tile);
 * if there is none, keep the snapshot.
 */
export function applyHeaderTileClose(
  prev: HeaderEntity | null,
  closedTileId: string,
  fallback: HeaderEntity | null,
): HeaderEntity | null {
  if (!prev || prev.tileId !== closedTileId) return prev;
  return fallback ?? prev;
}
