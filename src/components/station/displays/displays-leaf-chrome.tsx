'use client';

/** Displays leaf chrome trail — leaves report nested breadcrumbs UP to {@link StationDisplaysPushStack}; they never mount a second {@link… */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

export type DisplaysBreadcrumbSegment = {
  /** `'index'` | leaf tab id | leaf-local sub id */
  id: string;
  label: string;
};

type DisplaysLeafChromeApi = {
  /** Replace the sticky leaf-header trail (min 1 segment). */
  setTrail: (segments: DisplaysBreadcrumbSegment[]) => void;
  /**
   * Register the leaf's nested-pop handler. Fired when Back/Esc pops while
   * `trail.length > 1` — leaf syncs local state (e.g. `setSubLeaf(null)`),
   * which should re-`setTrail` to the shorter path.
   */
  setOnNestedPop: (handler: (() => void) | null) => void;
  /**
   * Register nested Forward restore. Fired with the segment id that was
   * popped (e.g. `'notes'` · `'compare'`) when the operator hits Forward
   * before leaving the leaf.
   */
  setOnNestedRestore: (handler: ((segmentId: string) => void) | null) => void;
  /**
   * Leaf-wide perspective control for the sticky header trailing slot
   * (e.g. Arrival Locations commit). Pass `null` on cleanup. In-tool segments
   * stay in-body. Claim Create|Link is a body combobox, not leaf trailing.
   */
  setLeafTrailing: (node: ReactNode | null) => void;
};

const DisplaysLeafChromeContext = createContext<DisplaysLeafChromeApi | null>(null);

export function useDisplaysLeafChrome(): DisplaysLeafChromeApi {
  const api = useContext(DisplaysLeafChromeContext);
  if (!api) {
    throw new Error(
      'useDisplaysLeafChrome must be used inside StationDisplaysPushStack leaf body',
    );
  }
  return api;
}

/** Thin context bridge — PushStack owns trail / nested / trailing. */
export function DisplaysLeafChromeProvider({
  setTrail,
  setOnNestedPop,
  setOnNestedRestore,
  setLeafTrailing,
  children,
}: DisplaysLeafChromeApi & { children: ReactNode }) {
  const api = useMemo(
    (): DisplaysLeafChromeApi => ({
      setTrail,
      setOnNestedPop,
      setOnNestedRestore,
      setLeafTrailing,
    }),
    [setTrail, setOnNestedPop, setOnNestedRestore, setLeafTrailing],
  );
  return (
    <DisplaysLeafChromeContext.Provider value={api}>
      {children}
    </DisplaysLeafChromeContext.Provider>
  );
}
