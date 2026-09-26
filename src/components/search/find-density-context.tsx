'use client';

/** FIND measure — the ONE axis every FIND surface gates on. */

import { createContext, useContext, type ReactNode } from 'react';
import type { FindStageDensity } from '@/design-system/tokens/desk-stage';

/** The FIND measure. */
export type FindDensity = FindStageDensity;

const FindDensityContext = createContext<FindDensity>('comfortable');

export function FindDensityProvider({
  density,
  children,
}: {
  density: FindDensity;
  children: ReactNode;
}) {
  return (
    <FindDensityContext.Provider value={density}>{children}</FindDensityContext.Provider>
  );
}

/** The measure this FIND subtree is painting at. */
export function useFindDensity(): FindDensity {
  return useContext(FindDensityContext);
}
