'use client';

/**
 * Displays leaf chrome trail — leaves report nested breadcrumbs UP to
 * {@link StationDisplaysPushStack}; they never mount a second
 * {@link StationDisplayLeafHeader}.
 *
 *   trail = [Inventory]              → Back / Esc → Displays index
 *   trail = [Inventory, PO notes]    → Back / Esc → pop one (Inventory sub-index)
 *   Forward after a nested pop restores via {@link setOnNestedRestore}.
 *
 * Opt-in leaf-command footer: {@link setLeafCommands} with a non-empty list
 * flips the column footer to `leaf-command` (`/` palette). Pass `null` / `[]`
 * to stay on Filter + hide. Index and default leaves share `Filter displays…`.
 *
 * Leaf-wide child perspectives (e.g. Claim New·Link) register via
 * {@link setLeafTrailing} into the sticky header’s trailing slot — never a
 * second sticky band or a second leaf header.
 *
 * The sticky band paints top-left ← → + current title (+ optional trailing) —
 * ancestors are not jump crumbs; depth is Back / Esc / ArrowLeft·ArrowRight.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { DisplaysFooterCommand } from './displays-footer-command';

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
   * Opt into the leaf-command footer stage. Non-empty → `/` palette;
   * `null` / `[]` → dismiss-only. Cleared automatically when the leaf unmounts
   * if the leaf's effect cleanup calls this with `null`.
   */
  setLeafCommands: (items: DisplaysFooterCommand[] | null) => void;
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

/** Thin context bridge — PushStack owns trail / nested / leaf-command / trailing. */
export function DisplaysLeafChromeProvider({
  setTrail,
  setOnNestedPop,
  setOnNestedRestore,
  setLeafCommands,
  setLeafTrailing,
  children,
}: DisplaysLeafChromeApi & { children: ReactNode }) {
  const api = useMemo(
    (): DisplaysLeafChromeApi => ({
      setTrail,
      setOnNestedPop,
      setOnNestedRestore,
      setLeafCommands,
      setLeafTrailing,
    }),
    [setTrail, setOnNestedPop, setOnNestedRestore, setLeafCommands, setLeafTrailing],
  );
  return (
    <DisplaysLeafChromeContext.Provider value={api}>
      {children}
    </DisplaysLeafChromeContext.Provider>
  );
}
