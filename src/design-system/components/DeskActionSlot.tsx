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
 * **Three roles, one row.** Paint order: `overall` (collection, e.g. Media
 * Export) · `leading` (To-ship Labels display toggle, immediately left of
 * Sync) · `primary` (create / Sync, rightmost). Last writer wins *per role*.
 * Print, filter, columns, zoom and fullscreen stay off this row — they act
 * on chosen rows or on how the sheet is drawn
 * (`docs/todo/seller-table-program-PLAN.md` §05). To-ship Export is not an
 * `overall` button: it lives in the Sync Google Sheet dropdown
 * ({@link DeskExportMenuRegistrar}), operator 2026-09-01. Labels is a
 * display toggle for the paperwork walk, not a per-row print verb.
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

export type DeskActionSlotRole = 'primary' | 'overall' | 'leading';

/** CSV export handed to a desk's Sync / intake dropdown — not a header button. */
export type DeskExportMenuAction = {
  run: () => void;
  rowCount: number;
  empty: boolean;
};

interface DeskActionSlotValue {
  primary: ReactNode;
  overall: ReactNode;
  leading: ReactNode;
  exportMenu: DeskExportMenuAction | null;
  setPrimary: (node: ReactNode) => void;
  setOverall: (node: ReactNode) => void;
  setLeading: (node: ReactNode) => void;
  setExportMenu: (action: DeskExportMenuAction | null) => void;
}

const DeskActionSlotContext = createContext<DeskActionSlotValue | null>(null);

export function DeskActionSlotProvider({ children }: { children: ReactNode }) {
  const [primary, setPrimary] = useState<ReactNode>(null);
  const [overall, setOverall] = useState<ReactNode>(null);
  const [leading, setLeading] = useState<ReactNode>(null);
  const [exportMenu, setExportMenu] = useState<DeskExportMenuAction | null>(null);
  const value = useMemo(
    () => ({
      primary,
      overall,
      leading,
      exportMenu,
      setPrimary,
      setOverall,
      setLeading,
      setExportMenu,
    }),
    [primary, overall, leading, exportMenu],
  );
  return (
    <DeskActionSlotContext.Provider value={value}>
      {children}
    </DeskActionSlotContext.Provider>
  );
}

/**
 * What the chrome hands to `addSlot`. Overall · leading (Labels) ·
 * primary (Sync). `null` when nothing has registered. To-ship Export is not
 * in this cluster — {@link useDeskExportMenuAction} feeds the Sync menu.
 */
export function useDeskActionSlotNode(): ReactNode {
  const ctx = useContext(DeskActionSlotContext);
  const primary = ctx?.primary ?? null;
  const overall = ctx?.overall ?? null;
  const leading = ctx?.leading ?? null;
  return useMemo(() => {
    const nodes = [overall, leading, primary].filter(Boolean);
    if (nodes.length === 0) return null;
    if (nodes.length === 1) return nodes[0];
    return (
      <div className="flex shrink-0 items-center gap-2" data-testid="desk-header-actions">
        {nodes}
      </div>
    );
  }, [primary, overall, leading]);
}

function setterForRole(
  ctx: DeskActionSlotValue | null,
  role: DeskActionSlotRole,
) {
  if (!ctx) return undefined;
  if (role === 'overall') return ctx.setOverall;
  if (role === 'leading') return ctx.setLeading;
  return ctx.setPrimary;
}

/**
 * Register this subtree's content as a desk chrome header action.
 *
 * `role="primary"` (default) is the create verb, rightmost. `role="overall"`
 * is a collection action (Media Export, etc.) further left. `role="leading"`
 * sits immediately left of primary (To-ship Labels, left of Sync). Last writer
 * wins per role. To-ship CSV export uses {@link DeskExportMenuRegistrar}.
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
  const setNode = setterForRole(ctx, role);

  useEffect(() => {
    if (!setNode) return;
    setNode(children);
    return () => setNode(null);
  }, [children, setNode]);

  return null;
}

/**
 * Register the current table's CSV export so a desk's Sync / intake dropdown
 * can tuck it (To-ship). The header does not paint a second Export button.
 */
export function DeskExportMenuRegistrar({
  run,
  rowCount,
  empty,
}: DeskExportMenuAction) {
  const ctx = useContext(DeskActionSlotContext);
  const setExportMenu = ctx?.setExportMenu;

  useEffect(() => {
    if (!setExportMenu) return;
    setExportMenu({ run, rowCount, empty });
    return () => setExportMenu(null);
  }, [setExportMenu, run, rowCount, empty]);

  return null;
}

/** The table's CSV export, if a {@link DeskExportMenuRegistrar} is mounted. */
export function useDeskExportMenuAction(): DeskExportMenuAction | null {
  return useContext(DeskActionSlotContext)?.exportMenu ?? null;
}
