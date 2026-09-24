'use client';

import { createContext, useContext, useMemo, type ComponentPropsWithoutRef } from 'react';
import type { ModeName } from '@/design-system/modes/registry';

/**
 * ModeRegion — the ONE way a region declares its task mode.
 *
 * Renders a `<div data-mode="<mode>">`; the generated mode stylesheet
 * (`design-system/modes/registry.ts`) does the rest, so every neutral surface /
 * text / border utility inside the region adopts the mode. All div props pass
 * through: replace a region's existing root div with this, or wrap a page with
 * `className="contents"` when the wrapper must not take part in layout (custom
 * properties still inherit through a `display: contents` box).
 *
 * Nesting is by REGION, one level deep: a page region plus at most one nested
 * region (the right rail). A third level is a design error — the operator
 * would be three task contexts deep — and is reported in development.
 */

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
