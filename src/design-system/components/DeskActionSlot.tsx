'use client';

/**
 * The seam between a desk's **body** and its **chrome's right slot**.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { Button, type ButtonProps } from '../primitives/Button';
import { focusRing } from '../tokens/focus-ring';

/** The one corner for a desk page-header CTA — `cornerClass('pill')`. */
const DESK_HEADER_ACTION_RADIUS = 'pill' as const;

type DeskHeaderActionProps = Omit<ButtonProps, 'radius'>;


/**
 * One bar cell — a segmented toolbar facet (Stock's Rooms).
 * (owner 2026-09-25, "TO SHIP" readability).
 */
export const DESK_BAR_SEGMENT_CLASS = cn(
  'ds-raw-button inline-flex min-h-mode-hit shrink-0 items-center gap-2 px-4',
  'font-sans text-role-eyebrow font-semibold industrial:font-mono industrial:font-extrabold',
  'disabled:cursor-not-allowed disabled:opacity-40',
  'rounded-mode-control',
  focusRing('cell'),
);

/** Active / pressed = ink fill (colour only, no geometry change); idle = hover wash. */
export function deskBarSegmentTone(active: boolean): string {
  return active
    ? 'bg-mode-ink text-mode-bar'
    : 'text-mode-muted enabled:hover:bg-mode-hover enabled:hover:text-mode-ink';
}

/** Page-header CTA. */
export function DeskHeaderAction(props: DeskHeaderActionProps) {
  return <Button {...props} radius={DESK_HEADER_ACTION_RADIUS} />;
}

/** The cluster the chrome paints in `addSlot` — capsules 8px apart. */
function DeskHeaderActionCluster({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-2" data-testid="desk-header-actions">
      {children}
    </div>
  );
}

type DeskActionSlotRole = 'primary' | 'overall';

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
    () => ({
      primary,
      overall,
      setPrimary,
      setOverall,
    }),
    [primary, overall],
  );
  return (
    <DeskActionSlotContext.Provider value={value}>
      {children}
    </DeskActionSlotContext.Provider>
  );
}

/**
 * What the chrome hands to `addSlot`. Overall · primary. `null`
 * when nothing has registered.
 */
export function useDeskActionSlotNode(): ReactNode {
  const ctx = useContext(DeskActionSlotContext);
  const primary = ctx?.primary ?? null;
  const overall = ctx?.overall ?? null;
  return useMemo(() => {
    if (!overall || !primary) return overall ?? primary;
    return (
      <DeskHeaderActionCluster>
        {overall}
        {primary}
      </DeskHeaderActionCluster>
    );
  }, [primary, overall]);
}

function setterForRole(
  ctx: DeskActionSlotValue | null,
  role: DeskActionSlotRole,
) {
  if (!ctx) return undefined;
  return role === 'overall' ? ctx.setOverall : ctx.setPrimary;
}

/** Register this subtree's content as a desk chrome header action. */
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
