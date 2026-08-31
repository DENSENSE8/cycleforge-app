'use client';

/**
 * React binding over {@link autoCollapseReducer} — the station centre's
 * "expanded until the operator starts working" behaviour.
 *
 * Wire it up as:
 *   const c = useAutoCollapse();
 *   <div onScroll={c.onScroll}>            // the centre scrollport
 *     <Block collapsed={c.collapsed} onToggle={c.toggle} />
 *     <Composer onFocus={c.engage} onBlur={c.disengage} />
 *
 * `onScroll` is throttled to one resolve per animation frame: a scrollport fires
 * dozens of events per gesture and every one of them would otherwise dispatch
 * through React. The rules themselves live in the pure reducer — nothing here
 * decides anything.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  AUTO_COLLAPSE_INITIAL,
  autoCollapseReducer,
  type AutoCollapseState,
} from './auto-collapse';

export interface AutoCollapseController extends AutoCollapseState {
  /** Attach to the centre scrollport's `onScroll`. */
  onScroll: (event: { currentTarget: { scrollTop: number } }) => void;
  /** Composer `onFocus`. */
  engage: () => void;
  /** Composer `onBlur`. */
  disengage: () => void;
  /** An explicit operator toggle — outranks both automatic triggers. */
  toggle: () => void;
  /** Force every band collapsed (pinned). */
  collapseAll: () => void;
  /** Force every band expanded (pinned). */
  expandAll: () => void;
}

export function useAutoCollapse(): AutoCollapseController {
  const [state, dispatch] = useReducer(autoCollapseReducer, AUTO_COLLAPSE_INITIAL);
  const frame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const onScroll = useCallback((event: { currentTarget: { scrollTop: number } }) => {
    // Read synchronously — the event object is pooled/reused, so the value must
    // be captured before the frame callback runs.
    const scrollTop = event.currentTarget.scrollTop;
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      dispatch({ kind: 'scroll', scrollTop });
    });
  }, []);

  const engage = useCallback(() => dispatch({ kind: 'engage' }), []);
  const disengage = useCallback(() => dispatch({ kind: 'disengage' }), []);
  const toggle = useCallback(() => dispatch({ kind: 'toggle' }), []);
  const collapseAll = useCallback(() => dispatch({ kind: 'collapse-all' }), []);
  const expandAll = useCallback(() => dispatch({ kind: 'expand-all' }), []);

  return { ...state, onScroll, engage, disengage, toggle, collapseAll, expandAll };
}
