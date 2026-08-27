'use client';

import { useCallback } from 'react';
import type { TileSelectMods } from './types';

const TILE_SELECTOR = '[data-photo-tile]';

const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' ']);

function tilesIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TILE_SELECTOR));
}

function moveFocus(el: HTMLElement | undefined) {
  if (!el) return;
  el.focus();
  // `nearest` only scrolls when the tile is actually off-screen — no jump when
  // arrowing between already-visible tiles.
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * Roving arrow-key navigation across media-library grid tiles — the missing
 * industry-standard interaction (Google Photos / Lightroom / Finder). Returns an
 * `onKeyDown` for the grid container; it operates on the rendered
 * `[data-photo-tile]` buttons via their live geometry, so it's view-agnostic
 * (flat grid, list, ticket) and correct under any responsive column count or
 * variable tile height — no assumed grid math.
 *
 * - ←/→ step one tile; ↑/↓ move to the nearest tile in the adjacent visual row
 *   (keeping horizontal position); Home/End jump to first/last.
 * - Space toggles selection on the focused tile (Shift+Space extends the range).
 * - Enter opens the focused tile — handled by the tile's own native button click,
 *   so it isn't intercepted here.
 *
 * Attached to the container, so it only fires while focus is inside the grid and
 * never fights the page-level shortcuts or the fullscreen viewer's own keys.
 */
export function usePhotoGridKeyboardNav(opts: {
  onSelect: (id: number, mods: TileSelectMods) => void;
}) {
  const { onSelect } = opts;
  return useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (!NAV_KEYS.has(e.key)) return;

      const container = e.currentTarget;
      const tiles = tilesIn(container);
      if (tiles.length === 0) return;

      const activeTile = (e.target as HTMLElement).closest<HTMLElement>(TILE_SELECTOR);
      const current = activeTile ? tiles.indexOf(activeTile) : -1;

      // Space: toggle selection on the focused tile (don't let the button's
      // native Space-click open the viewer, and don't scroll the page).
      if (e.key === ' ') {
        if (!activeTile) return;
        e.preventDefault();
        const id = Number(activeTile.dataset.photoId);
        if (Number.isFinite(id)) onSelect(id, { shift: e.shiftKey });
        return;
      }

      e.preventDefault();
      if (current < 0) {
        moveFocus(tiles[0]);
        return;
      }
      if (e.key === 'Home') return moveFocus(tiles[0]);
      if (e.key === 'End') return moveFocus(tiles[tiles.length - 1]);
      if (e.key === 'ArrowLeft') return moveFocus(tiles[Math.max(0, current - 1)]);
      if (e.key === 'ArrowRight') return moveFocus(tiles[Math.min(tiles.length - 1, current + 1)]);

      // ↑/↓: pick the tile in the nearest adjacent visual row whose horizontal
      // center is closest to the current one — robust to any column count.
      const cur = tiles[current].getBoundingClientRect();
      const curCenterX = cur.left + cur.width / 2;
      const goingDown = e.key === 'ArrowDown';
      let best: { el: HTMLElement; rowTop: number; dx: number } | null = null;
      for (let i = 0; i < tiles.length; i++) {
        if (i === current) continue;
        const r = tiles[i].getBoundingClientRect();
        const inRow = goingDown ? r.top > cur.top + 1 : r.bottom < cur.bottom - 1;
        if (!inRow) continue;
        const rowDist = Math.abs(r.top - cur.top);
        const dx = Math.abs(r.left + r.width / 2 - curCenterX);
        if (
          !best ||
          rowDist < Math.abs(best.rowTop - cur.top) - 1 ||
          (Math.abs(rowDist - Math.abs(best.rowTop - cur.top)) <= 1 && dx < best.dx)
        ) {
          best = { el: tiles[i], rowTop: r.top, dx };
        }
      }
      if (best) moveFocus(best.el);
    },
    [onSelect],
  );
}
