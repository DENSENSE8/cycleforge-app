'use client';

/**
 * The seam between a `/m` page's **body** and its **top bar's right cluster** —
 * the phone twin of {@link DeskActionSlot}.
 *
 * ## Why a slot and not a prop
 *
 * `MobileTopBar` is mounted by the HOST ({@link RedesignedMobileShell}), and
 * the page arrives as `children`. So a page could never reach the bar: the bar
 * declared an `actions` prop for years and **no caller could pass it**, because
 * the only mount site is the shell, which knows nothing about the page. Pages
 * that wanted a corner action had two bad options — mount a second bar (which
 * is why `OWN_TOP_BAR_PREFIXES` exists, and those pages silently lost the scan
 * CTA) or go without.
 *
 * Context is the honest edge here for the same reason
 * {@link MobileScanProvider} already uses it: the bar and the page are parent
 * and `children` in one tree, so a late-mounting page cannot miss the seam and
 * no window event is needed.
 *
 * ## ONE action, no roles — and that is the deviation from the desk
 *
 * `DeskActionSlot` carries three roles (`primary` · `overall` · `leading`)
 * because a desk header has room for a cluster. This has exactly one, because
 * a 390px bar does not: it already spends pixels on the menu, the page title
 * and the permanent SCAN seat. SURFACE_LAW §5 — *one job, one sticky CTA* —
 * is the rule, and a second phone action is how a bar becomes a toolbar.
 *
 * A page with two verbs does not get two corners; it gets the SHEET
 * (`BottomSheet`) for the second one.
 *
 * ## Scan keeps the corner
 *
 * The slot renders **left of** {@link MobileScanCta}, never in its place.
 * Starting a scan is the act a warehouse phone exists for and it has a fixed
 * muscle-memory position (ruling 2026-08-21); a page action that displaced it
 * would move the one control that must never move.
 *
 * Callers: `MobileTopBar` (renders), `RedesignedMobileShell` (provides), `/m`
 * pages (register). No API, no schemas.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Button, type ButtonProps } from '@/design-system/primitives/Button';
import { cn } from '@/utils/_cn';

/**
 * One mobile top-bar cell — menu, back, page action, scan. Operator
 * 2026-09-24: the corners are square boxes, flush to the bar's top, bottom
 * and outer edge, no radius and no padding around them — the phone twin of
 * the desk's industrial bar segments (`DESK_BAR_SEGMENT_CLASS`). The cell IS
 * the bar height (44px, the touch floor), so paint == hit and no
 * pseudo-element is needed. Neighbours share a 1px `border-border-soft` edge;
 * the call site picks the side (`border-r` left of the title, `border-l` in
 * the right cluster). Press is a fill, never a scale: a shrinking cell opens a
 * gap in a flush bar.
 */
export const MOBILE_BAR_CELL_CLASS =
  'relative shrink-0 border-border-soft text-text-muted transition-colors hover:bg-surface-hover hover:text-text-default active:scale-100 enabled:active:scale-100 active:bg-surface-sunken';

/** The one corner for a phone top-bar cell — flush, same as every bar segment. */
export const MOBILE_TOP_BAR_ACTION_RADIUS = 'flush' as const;

/** A labelled cell: full bar height, width from its label. */
const MOBILE_TOP_BAR_ACTION_FACE = `${MOBILE_BAR_CELL_CLASS} h-11 border-l px-3 text-role-caption font-semibold tracking-tight`;

export type MobileTopBarActionProps = Omit<ButtonProps, 'radius' | 'size' | 'variant'>;

/**
 * The page action's locked face.
 *
 * `ghost`, a flush cell identical to the scan cell beside it — deliberately
 * NOT louder. The affordance is the fixed corner and the label, not volume;
 * the spine ruling *"no hue, anywhere"* holds on the phone too, and a
 * saturated block here would out-shout the one permanent control in the bar.
 *
 * Keep the label to a word or two. At 390px the title truncates before the
 * cluster does, so a long action label eats the name of the page you are on.
 */
export function MobileTopBarAction({ className, ...props }: MobileTopBarActionProps) {
  return (
    <Button
      {...props}
      variant="ghost"
      size="sm"
      radius={MOBILE_TOP_BAR_ACTION_RADIUS}
      className={cn(MOBILE_TOP_BAR_ACTION_FACE, className)}
    />
  );
}

interface MobileActionSlotValue {
  action: ReactNode;
  setAction: (node: ReactNode) => void;
}

const MobileActionSlotContext = createContext<MobileActionSlotValue | null>(null);

/**
 * Mounted once by the mobile shell, wrapping BOTH the top bar and the page, so
 * the bar can render what the page registers.
 */
export function MobileActionSlotProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<ReactNode>(null);
  const value = useMemo(() => ({ action, setAction }), [action]);
  return (
    <MobileActionSlotContext.Provider value={value}>{children}</MobileActionSlotContext.Provider>
  );
}

/** What {@link MobileTopBar} paints left of the scan CTA. `null` when no page registered. */
export function useMobileActionSlotNode(): ReactNode {
  return useContext(MobileActionSlotContext)?.action ?? null;
}

/**
 * Register this page's single top-bar action. Renders nothing where it is
 * written.
 *
 * **Memoize `children`.** A fresh element identity on every render
 * re-registers on every render, which is a re-render loop through the
 * provider — the same hazard `DeskActionSlotRegistrar` documents. Wrap the
 * `<MobileTopBarAction>` in `useMemo` keyed on what it actually depends on.
 *
 * Last writer wins, so a route swap that mounts the next page before the old
 * one's cleanup runs still ends with the new page's action.
 *
 * A no-op outside a {@link MobileActionSlotProvider} — a page body still
 * mounts on a route that owns its own bar (`OWN_TOP_BAR_PREFIXES`) or renders
 * pre-sign-in, it just paints no corner action there.
 */
export function MobileActionSlotRegistrar({ children }: { children: ReactNode }) {
  const setAction = useContext(MobileActionSlotContext)?.setAction;

  useEffect(() => {
    if (!setAction) return;
    setAction(children);
    return () => setAction(null);
  }, [children, setAction]);

  return null;
}
