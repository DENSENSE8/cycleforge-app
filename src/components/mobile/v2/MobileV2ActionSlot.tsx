'use client';

/** V2 seam between a `/m` page body and the shell top bar's right cluster. */

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

/** One mobile top-bar cell — menu, back, page action, scan. */
export const MOBILE_BAR_CELL_CLASS =
  'relative shrink-0 border-border-soft text-text-muted transition-colors hover:bg-surface-hover hover:text-text-default active:scale-100 enabled:active:scale-100 active:bg-surface-sunken';

/** V2 page actions are normal rounded controls. */
export const MOBILE_TOP_BAR_ACTION_RADIUS = 'surface' as const;

/** A labelled cell: full bar height, width from its label. */
const MOBILE_TOP_BAR_ACTION_FACE =
  'my-1 h-11 px-3 text-role-caption font-semibold tracking-tight text-text-default hover:bg-surface-hover';

export type MobileTopBarActionProps = Omit<ButtonProps, 'radius' | 'size' | 'variant'>;

/** The page action's locked face. */
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

/** Register this page's single top-bar action. */
export function MobileActionSlotRegistrar({ children }: { children: ReactNode }) {
  const setAction = useContext(MobileActionSlotContext)?.setAction;

  useEffect(() => {
    if (!setAction) return;
    setAction(children);
    return () => setAction(null);
  }, [children, setAction]);

  return null;
}
