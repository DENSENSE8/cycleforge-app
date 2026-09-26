'use client';

import { createContext, useContext, useMemo, useSyncExternalStore, type ComponentPropsWithoutRef } from 'react';
import { usePathname } from 'next/navigation';
import { Slot } from '@radix-ui/react-slot';
import type { ModeName } from '@/design-system/modes/registry';
import { modeDeviceOf, resolveRegionMode } from './resolve-region-mode';

/** ModeRegion — the ONE way a region declares its task mode. */

const COARSE_POINTER_QUERY = '(pointer: coarse)';

function subscribeCoarsePointer(onChange: () => void): () => void {
  const query = window.matchMedia(COARSE_POINTER_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Server and hydration paint the desk; a touch screen switches after hydration. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeCoarsePointer,
    () => window.matchMedia(COARSE_POINTER_QUERY).matches,
    () => false,
  );
}

/** Page region + one nested region. */
const MAX_MODE_DEPTH = 2;

interface ModeContextValue {
  mode: ModeName;
  depth: number;
  /** The enclosing region's mode, when this region is nested. */
  outer: ModeName | null;
}

const ModeContext = createContext<ModeContextValue | null>(null);

interface ModeRegionProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * The job's mode. `triage` resolves by device — triage on desktop,
   * industrial on `/m/*` and touch screens. `industrial` is explicit and never
   * lifted (the phone floor, or Mode C: a desktop mirror of a live phone).
   */
  mode: ModeName;
  /**
   * Stamp `data-mode` on the single child instead of a wrapping div — for a
   * portalled surface (dialog, palette) whose own box must read the mode's
   * corner and planes.
   */
  asChild?: boolean;
}

export function ModeRegion({ mode: requested, asChild = false, children, ...rest }: ModeRegionProps) {
  const parent = useContext(ModeContext);
  const mode = resolveRegionMode(requested, modeDeviceOf(usePathname(), useCoarsePointer()));
  const depth = (parent?.depth ?? 0) + 1;
  if (parent && depth > MAX_MODE_DEPTH && process.env.NODE_ENV !== 'production') {
    console.error(
      `ModeRegion: "${mode}" is mode level ${depth}, nested inside "${parent.outer}" → "${parent.mode}". ` +
        'Modes nest one level deep (a page region plus one nested region); mount this content outside the nested region or drop its ModeRegion.',
    );
  }
  const outer = parent?.mode ?? null;
  const value = useMemo<ModeContextValue>(() => ({ mode, depth, outer }), [mode, depth, outer]);
  const Host = asChild ? Slot : 'div';
  return (
    <ModeContext.Provider value={value}>
      <Host data-mode={mode} {...rest}>
        {children}
      </Host>
    </ModeContext.Provider>
  );
}

/** The innermost enclosing region's mode, or null outside every region. */
export function useMode(): ModeName | null {
  return useContext(ModeContext)?.mode ?? null;
}
