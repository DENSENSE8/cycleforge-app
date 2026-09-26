'use client';

/**
 * Desk stage state, published DOWN to the desk body.
 * field (operator ruling 2026-08-30).
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

interface DeskStageValue {
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
