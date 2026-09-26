'use client';

import { createContext, useContext, useMemo, type ComponentPropsWithoutRef } from 'react';
import type { ModeName } from '@/design-system/modes/registry';

/** ModeRegion — the ONE way a region declares its task mode. */

/** Page region + one nested region. */
const MAX_MODE_DEPTH = 2;

interface ModeContextValue {
  mode: ModeName;
  depth: number;
  /** The enclosing region's mode, when this region is nested. */
  outer: ModeName | null;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export interface ModeRegionProps extends ComponentPropsWithoutRef<'div'> {
  mode: ModeName;
}

export function ModeRegion({ mode, children, ...rest }: ModeRegionProps) {
  const parent = useContext(ModeContext);
  const depth = (parent?.depth ?? 0) + 1;
  if (parent && depth > MAX_MODE_DEPTH && process.env.NODE_ENV !== 'production') {
    console.error(
      `ModeRegion: "${mode}" is mode level ${depth}, nested inside "${parent.outer}" → "${parent.mode}". ` +
        'Modes nest one level deep (a page region plus one nested region); mount this content outside the nested region or drop its ModeRegion.',
    );
  }
  const outer = parent?.mode ?? null;
  const value = useMemo<ModeContextValue>(() => ({ mode, depth, outer }), [mode, depth, outer]);
  return (
    <ModeContext.Provider value={value}>
      <div data-mode={mode} {...rest}>
        {children}
      </div>
    </ModeContext.Provider>
  );
}

/** The innermost enclosing region's mode, or null outside every region. */
export function useMode(): ModeName | null {
  return useContext(ModeContext)?.mode ?? null;
}
