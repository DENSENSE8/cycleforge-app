'use client';

/**
 * Desk stage state, published DOWN to the desk body.
 *
 * The sibling of `DeskActionSlot`, which carries a node UP from the body into
 * the chrome. This carries the stage's fullscreen state the other way, because
 * the control that toggles it does not live on the chrome any more: it belongs
 * to the **data table's own header**, on the same row as the table's find
 * field (operator ruling 2026-08-30).
 *
 * That is the right home for it. Fullscreen is a question about the TABLE — "I
 * need more of this grid" — and every other control that answers a question
 * about the table (find, filter, fields) already lives on that row. A toggle
 * sitting one band higher, on the page's tab strip, read as page chrome and
 * put two rows of chrome between the operator and the first data row.
 *
 * `null` outside a desk: a table on a route with no desk chrome simply renders
 * no fullscreen control, rather than one that would have nothing to expand.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

export interface DeskStageValue {
  fullscreen: boolean;
  toggleFullscreen: () => void;
}

const DeskStageContext = createContext<DeskStageValue | null>(null);

export function DeskStageProvider({
  fullscreen,
  toggleFullscreen,
  children,
}: DeskStageValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ fullscreen, toggleFullscreen }),
    [fullscreen, toggleFullscreen],
  );
  return <DeskStageContext.Provider value={value}>{children}</DeskStageContext.Provider>;
}

/** `null` when this table is not inside a desk stage. */
export function useDeskStageOptional(): DeskStageValue | null {
  return useContext(DeskStageContext);
}
