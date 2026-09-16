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
 * The one corner for a phone top-bar action — the same `radius="surface"`
 * {@link MobileScanCta} paints, so the two controls in the right cluster read
 * as one pair rather than two languages. Not a call-site choice, exactly as
 * `DESK_HEADER_ACTION_RADIUS` is not one on the desk.
 */
export const MOBILE_TOP_BAR_ACTION_RADIUS = 'surface' as const;

/**
 * 32px PAINTED with a 44px hit region carried by the pseudo-element
 * (32 + 6 + 6) — `MOBILE_CONTROL_LADDER`'s paint-small-hit-big rule, copied
 * from the scan CTA rather than re-derived so the pair cannot drift by a pixel.
 */
const MOBILE_TOP_BAR_ACTION_FACE =
  "relative h-8 shrink-0 px-2.5 text-role-caption font-semibold tracking-tight before:absolute before:-inset-1.5 before:content-['']";

export type MobileTopBarActionProps = Omit<ButtonProps, 'radius' | 'size' | 'variant'>;

/**
 * The page action's locked face.
 *
 * `secondary`, identical in weight to the scan CTA beside it — deliberately
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
      variant="secondary"
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
