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
 *   <DeskPageChrome addSlot={node} …>      <DeskHeaderAction>Add</DeskHeaderAction>
 * </DeskActionSlotProvider>              </DeskActionSlotRegistrar>
 * ```
 *
 * **Radius is locked.** The page-header CTA is {@link DeskHeaderAction} —
 * the house {@link Button} with `radius="pill"` (`cornerClass('pill')`). A
 * split intake (To-ship) is `SlicedActionDock` `embeddedChrome="header"`,
 * which paints that same token. Do not pass `radius` on a raw Button here,
 * and do not round the slot with a `rounded-*` class.
 *
 * **Two roles, one row.** `role="primary"` (default) is the create verb,
 * rightmost. `role="overall"` is a page-level action on the collection
 * (Export) that sits to its left. Last writer wins *per role*, so a table
 * can register Export without replacing Add. Print, labels, filter, columns,
 * zoom and fullscreen stay off this row — they act on chosen rows or on how
 * the sheet is drawn (`docs/todo/seller-table-program-PLAN.md` §05).
 *
 * A desk with no CTA registers nothing — so the slot empties on unmount and a
 * stale button can never outlive the page that owns it. That unmount cleanup
 * is the whole reason this is a registrar and not a module-level store.
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
import { Button, type ButtonProps } from '../primitives/Button';

/** The one corner for a desk page-header CTA — `cornerClass('pill')`. */
export const DESK_HEADER_ACTION_RADIUS = 'pill' as const;

export type DeskHeaderActionProps = Omit<ButtonProps, 'radius'>;

/**
 * Page-header CTA. Same {@link Button} every other ops action uses; radius is
 * not a call-site choice. A desk that wants a different corner is asking for
 * a second header language.
 */
export function DeskHeaderAction(props: DeskHeaderActionProps) {
  return <Button {...props} radius={DESK_HEADER_ACTION_RADIUS} />;
}

export type DeskActionSlotRole = 'primary' | 'overall';

interface DeskActionSlotValue {
  primary: ReactNode;
  overall: ReactNode;
  setPrimary: (node: ReactNode) => void;
  setOverall: (node: ReactNode) => void;
}

const DeskActionSlotContext = createContext<DeskActionSlotValue | null>(null);

export function DeskActionSlotProvider({ children }: { children: ReactNode }) {
  const [primary, setPrimary] = useState<ReactNode>(null);
  const [overall, setOverall] = useState<ReactNode>(null);
  const value = useMemo(
    () => ({ primary, overall, setPrimary, setOverall }),
    [primary, overall],
  );
  return (
    <DeskActionSlotContext.Provider value={value}>
      {children}
    </DeskActionSlotContext.Provider>
  );
}

/**
 * What the chrome hands to `addSlot`. Overall actions (Export) sit left of
 * the primary create verb. `null` when nothing has registered.
 */
export function useDeskActionSlotNode(): ReactNode {
  const ctx = useContext(DeskActionSlotContext);
  const primary = ctx?.primary ?? null;
  const overall = ctx?.overall ?? null;
  return useMemo(() => {
    if (!primary && !overall) return null;
    if (!overall) return primary;
    if (!primary) return overall;
    return (
      <div className="flex shrink-0 items-center gap-2" data-testid="desk-header-actions">
        {overall}
        {primary}
      </div>
    );
  }, [primary, overall]);
}

/**
 * Register this subtree's content as a desk chrome header action.
 *
 * `role="primary"` (default) is the create verb, rightmost. `role="overall"`
 * is a collection action (Export) to its left. Last writer wins per role.
 *
 * Renders nothing where it is written. Memoize the children (or keep them
 * cheap) — a fresh element identity on every render re-registers on every
 * render, which is a re-render loop through the provider.
 *
 * A no-op outside a {@link DeskActionSlotProvider}, so a desk body still mounts
 * on a route that has no desk chrome (e.g. the Support alias).
 */
export function DeskActionSlotRegistrar({
  children,
  role = 'primary',
}: {
  children: ReactNode;
  role?: DeskActionSlotRole;
}) {
  const ctx = useContext(DeskActionSlotContext);
  const setNode = role === 'overall' ? ctx?.setOverall : ctx?.setPrimary;

  useEffect(() => {
    if (!setNode) return;
    setNode(children);
    return () => setNode(null);
  }, [children, setNode]);

  return null;
}
