'use client';

/**
 * The seam between a desk's **body** and its **chrome's right slot**.
 *
 * {@link DeskPageChrome} is mounted by the shared desk layout, one level above
 * the page — so the page cannot hand it an `addSlot` prop, and the layout must
 * not import one desk's intake button (a shared frame that knows about To-ship's
 * Add is no longer shared). This is the registration channel between them: the
 * layout provides, the active desk registers, the band renders whatever it got.
 *
 * ```tsx
 * // layout (once)                       // the desk that has a CTA
 * <DeskActionSlotProvider>               <DeskActionSlotRegistrar>
 *   <DeskPageChrome addSlot={node} …>      <Button …>Add</Button>
 * </DeskActionSlotProvider>              </DeskActionSlotRegistrar>
 * ```
 *
 * **One occupant, last writer wins.** Two desks are never mounted at once (they
 * are sibling route segments), and a desk with no CTA registers nothing — so
 * the slot empties on unmount and a stale button can never outlive the page
 * that owns it. That unmount cleanup is the whole reason this is a registrar
 * and not a module-level store.
 *
 * Not a portal: the node has no DOM home of its own to escape, and rendering it
 * through context keeps it inside the band's own flex row where its sizing and
 * focus order belong.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface DeskActionSlotValue {
  node: ReactNode;
  setNode: (node: ReactNode) => void;
}

const DeskActionSlotContext = createContext<DeskActionSlotValue | null>(null);

export function DeskActionSlotProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode>(null);
  const value = useMemo(() => ({ node, setNode }), [node]);
  return (
    <DeskActionSlotContext.Provider value={value}>
      {children}
    </DeskActionSlotContext.Provider>
  );
}

/** What the chrome hands to `addSlot`. `null` when no desk has registered. */
export function useDeskActionSlotNode(): ReactNode {
  return useContext(DeskActionSlotContext)?.node ?? null;
}

/**
 * Register this subtree's content as the desk chrome's right-slot CTA.
 *
 * Renders nothing where it is written. Memoize the children (or keep them
 * cheap) — a fresh element identity on every render re-registers on every
 * render, which is a re-render loop through the provider.
 *
 * A no-op outside a {@link DeskActionSlotProvider}, so a desk body still mounts
 * on a route that has no desk chrome (e.g. the Support alias).
 */
export function DeskActionSlotRegistrar({ children }: { children: ReactNode }) {
  const ctx = useContext(DeskActionSlotContext);
  const setNode = ctx?.setNode;

  useEffect(() => {
    if (!setNode) return;
    setNode(children);
    return () => setNode(null);
  }, [children, setNode]);

  return null;
}
