'use client';

/**
 * React binding over {@link bandCollapseReducer}, layered on the centre-wide
 * {@link AutoCollapseController}.
 *
 * One controller in, one controller out: the host keeps calling
 * `useAutoCollapse()` for the scroll / composer rules and hands the result
 * here, so the centre still has ONE story about whether it is yielding its
 * column — this only decides which band is exempt.
 */

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
  /** Open everything again, clearing pins. */
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
      // Goes through the centre controller so the scroll rules see the change —
      // a local pin sweep would leave `collapsed` true and the next scroll
      // would slam everything shut again.
      expandAll: centre.expandAll,
    }),
    [state, allCollapsed, centre.expandAll],
  );
}
