'use client';

/**
 * React binding over {@link lineCollapseReducer} — per-line capture disclosure
 * inside a station line list.
 *
 * Wire it up as:
 *   const lines = useLineCollapse(activeLineId);
 *   <Row collapse={{ expanded: lines.isExpanded(id), onToggle: () => lines.toggle(id), … }} />
 *   <CollapseAll onClick={() => { band.collapseAll(); lines.collapseAll(); }} />
 *
 * The host owns it, not the row — the whole point is that several lines answer
 * to one gesture. Nothing here decides anything; the rules live in the pure
 * reducer beside it.
 */

import { useMemo, useReducer } from 'react';
import {
  LINE_COLLAPSE_INITIAL,
  isLineExpanded,
  lineCollapseReducer,
} from './line-collapse';

export interface LineCollapseController {
  /** Is this line showing its capture body? */
  isExpanded: (lineId: number) => boolean;
  /** Operator pressed the line's own disclosure. */
  toggle: (lineId: number) => void;
  /** Open this line's body because something needs it (select · scan · step). */
  expand: (lineId: number) => void;
  /** Items-band "Collapse all" — every line back to its identity face. */
  collapseAll: () => void;
}

export function useLineCollapse(activeLineId: number | null): LineCollapseController {
  const [state, dispatch] = useReducer(lineCollapseReducer, LINE_COLLAPSE_INITIAL);

  return useMemo(
    () => ({
      isExpanded: (lineId: number) => isLineExpanded(state, lineId, activeLineId),
      toggle: (lineId: number) => dispatch({ kind: 'toggle', lineId, activeLineId }),
      expand: (lineId: number) => dispatch({ kind: 'expand', lineId, activeLineId }),
      collapseAll: () => dispatch({ kind: 'collapse-all', activeLineId }),
    }),
    [state, activeLineId],
  );
}
