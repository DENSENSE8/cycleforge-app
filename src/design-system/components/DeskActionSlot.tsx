'use client';

/**
 * The seam between a desk's **body** and its **chrome's right slot**.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode, type Ref } from 'react';
import { cn } from '@/utils/_cn';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button, type ButtonProps } from '../primitives/Button';
import { KeyboardKey } from '../primitives/KeyboardKey';
import { focusRing } from '../tokens/focus-ring';

/** The one corner for a desk page-header CTA — `cornerClass('pill')`. */
const DESK_HEADER_ACTION_RADIUS = 'pill' as const;

type DeskHeaderActionProps = Omit<ButtonProps, 'radius'> & {
  /**
   * The verb's word. With it the action paints icon + label + keycap, and
   * inside a record header band (`DeskRecordHeadContext`) drops to the icon
   * alone while the BAND is compact — its own width, not the viewport, so a
   * split pane compacts on a wide screen (owner 2026-09-29). The word stays
   * the accessible name and the hover tooltip in both faces.
   */
  label?: string;
  /** Bare key that fires the verb — painted as a keycap and in the tooltip. */
  shortcut?: string;
  /** The button node — an anchored layer (a popover the verb opens) measures it. */
  ref?: Ref<HTMLButtonElement>;
};

/**
 * True inside `DeskStageRecordHeader`'s verbs: labelled `DeskHeaderAction`s
 * collapse to icons below {@link DESK_RECORD_HEAD_ROOMY}.
 */
export const DeskRecordHeadContext = createContext(false);

/**
 * Record band widths (`@container/record-head`): words from 56rem, keycaps
 * only from 80rem — below that the keycap lives in the tooltip, so a long
 * title keeps its two lines.
 */
const DESK_RECORD_HEAD_ROOMY = {
  label: 'hidden @min-[56rem]/record-head:inline',
  key: 'hidden @min-[80rem]/record-head:inline-flex',
} as const;

/** A record-band control's word: shown from the roomy band width, drawing-only below it. */
export const DESK_RECORD_HEAD_LABEL_CLASS = DESK_RECORD_HEAD_ROOMY.label;

/** Filled faces carry the inverse keycap. */
const INVERSE_KEY_VARIANTS: Readonly<Partial<Record<NonNullable<ButtonProps['variant']>, true>>> = {
  primary: true,
  brand: true,
  danger: true,
  warning: true,
  success: true,
  ink: true,
};


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

/** Page-header CTA — and the record header band's verbs (with `label`). */
export function DeskHeaderAction({ label, shortcut, children, ref, ...props }: DeskHeaderActionProps) {
  const compact = useContext(DeskRecordHeadContext);
  if (label == null) return <Button {...props} ref={ref} radius={DESK_HEADER_ACTION_RADIUS}>{children}</Button>;
  return (
    <HoverTooltip label={label} shortcut={shortcut} asChild placement="below">
      <Button {...props} ref={ref} ariaLabel={props.ariaLabel ?? label} radius={DESK_HEADER_ACTION_RADIUS} className={cn('whitespace-nowrap', props.className)}>
        <span className={compact ? DESK_RECORD_HEAD_ROOMY.label : undefined}>{label}</span>
        {shortcut ? (
          <KeyboardKey
            size="xs"
            tone={INVERSE_KEY_VARIANTS[props.variant ?? 'primary'] ? 'inverse' : 'default'}
            className={cn('ml-1', compact && DESK_RECORD_HEAD_ROOMY.key)}
          >
            {shortcut}
          </KeyboardKey>
        ) : null}
        {children}
      </Button>
    </HoverTooltip>
  );
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
