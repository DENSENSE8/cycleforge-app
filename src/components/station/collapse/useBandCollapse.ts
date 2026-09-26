'use client';

/** React binding over {@link bandCollapseReducer}, layered on the centre-wide {@link AutoCollapseController}. */

import { useMemo, useReducer } from 'react';
import {
  BAND_COLLAPSE_INITIAL,
  bandCollapseReducer,
  isBandOpen,
} from './band-collapse';
import type { AutoCollapseController } from './useAutoCollapse';

export interface BandCollapseController {
  /** Is this band showing its body? */
  isOpen: (bandId: string) => boolean;
  /** Operator pressed this band's own disclose. */
  toggle: (bandId: string) => void;
  /** Open this band without touching siblings. No-op if it is already open. */
  open: (bandId: string) => void;
  /** Close this band without touching siblings. No-op if it is already shut. */
  close: (bandId: string) => void;
  /** Open every band, including ones seeded shut (Unbox Label). */
  expandAll: () => void;
}

/**
 * @param seed — optional per-band pins applied on first paint. Unbox / Testing
 * seed Label shut so the sticker stays hidden until the Label row is opened
 * (the old Show-label CTA). `true` = open.
 */
export function useBandCollapse(
  centre: AutoCollapseController,
  seed?: Readonly<Record<string, boolean>>,
): BandCollapseController {
  const [state, dispatch] = useReducer(
    bandCollapseReducer,
    seed ? { anchor: false, pinned: seed } : BAND_COLLAPSE_INITIAL,
  );
  const allCollapsed = centre.collapsed;

  return useMemo(
    () => ({
      isOpen: (bandId: string) => isBandOpen(state, bandId, allCollapsed),
      toggle: (bandId: string) => dispatch({ kind: 'toggle', bandId, allCollapsed }),
      open: (bandId: string) => dispatch({ kind: 'open', bandId, allCollapsed }),
      close: (bandId: string) => dispatch({ kind: 'close', bandId, allCollapsed }),
      // Centre first so scroll/engage see the expanded pin; then drop band
      // pins so a seeded-shut Label (Unbox / Testing) opens with Items.
      expandAll: () => {
        centre.expandAll();
        dispatch({ kind: 'expand-all', allCollapsed: false });
      },
    }),
    [state, allCollapsed, centre.expandAll],
    // dispatch is stable; expandAll now also clears band pins.
  );
}
