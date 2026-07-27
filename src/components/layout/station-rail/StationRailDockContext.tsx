'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface StationRailDockValue {
  /** The mounted dock frame, or null until {@link StationRailDock} mounts. */
  node: HTMLElement | null;
  /** Callback-ref target for the host frame. */
  setNode: (el: HTMLElement | null) => void;
}

const StationRailDockContext = createContext<StationRailDockValue | null>(null);

/**
 * Wires the floating station rail's **host frame** (rendered over the work
 * canvas) to the **content** (rendered by whichever sidebar panel owns the
 * scan session).
 *
 * A DOM portal, deliberately — not JSX-in-context like {@link HeaderContext}.
 * The rail is a live feed: pushing its subtree through `setState` would
 * re-render the whole layout shell on every scan, every optimistic patch, and
 * every rail poll. With a portal the owning panel keeps reconciling its own
 * subtree exactly as before; only the DOM insertion point moves.
 */
export function StationRailDockProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const value = useMemo<StationRailDockValue>(() => ({ node, setNode }), [node]);
  return (
    <StationRailDockContext.Provider value={value}>{children}</StationRailDockContext.Provider>
  );
}

/**
 * Returns the dock wiring, or `null` outside a provider (mobile branch, the
 * `/m` shell, chromeless auth routes). Consumers must degrade to their inline
 * rendering rather than throwing — the dock is desktop chrome, not a hard
 * dependency of any station surface.
 */
export function useStationRailDock(): StationRailDockValue | null {
  return useContext(StationRailDockContext);
}
