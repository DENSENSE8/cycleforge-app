'use client';

/**
 * The seam between a desk's **body** and its **chrome's right slot**.
 * ({@link DeskExportMenuRegistrar}), operator 2026-09-01. Labels is a
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Loader2 } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { Button, type ButtonProps } from '../primitives/Button';
import { focusRing } from '../tokens/focus-ring';
import { cornerClass } from '../tokens/radius';

/** The one corner for a desk page-header CTA — `cornerClass('pill')`. */
const DESK_HEADER_ACTION_RADIUS = 'pill' as const;

type DeskHeaderActionProps = Omit<ButtonProps, 'radius'>;

/**
 * Which face the header cluster renders in. `pill` — the card desk's header
 * row. `segment` — the industrial desk bar (`stage="flush"`).
 */
type DeskHeaderFace = 'pill' | 'segment';

const DeskHeaderFaceContext = createContext<DeskHeaderFace>('pill');

/** Set by the bar that paints `addSlot`, never by the registering desk. */
export function DeskHeaderFaceProvider({
  face,
  children,
}: {
  face: DeskHeaderFace;
  children: ReactNode;
}) {
  return <DeskHeaderFaceContext.Provider value={face}>{children}</DeskHeaderFaceContext.Provider>;
}

export function useDeskHeaderFace(): DeskHeaderFace {
  return useContext(DeskHeaderFaceContext);
}

/**
 * One industrial bar cell — mode tab or page action.
 * (owner 2026-09-25, "TO SHIP" readability).
 */
export const DESK_BAR_SEGMENT_CLASS = cn(
  'ds-raw-button inline-flex min-h-mode-hit shrink-0 items-center gap-2 px-4',
  'font-mono text-role-eyebrow font-extrabold uppercase tracking-[0.08em]',
  'disabled:cursor-not-allowed disabled:opacity-40',
  cornerClass('flush'),
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
  const face = useDeskHeaderFace();
  if (face === 'segment') return <DeskHeaderSegmentAction {...props} />;
  return <Button {...props} radius={DESK_HEADER_ACTION_RADIUS} />;
}

function DeskHeaderSegmentAction({
  children,
  icon,
  loading = false,
  ariaLabel,
  disabled,
  className,
  type = 'button',
  // Pill-face knobs with no meaning on a bar cell.
  variant: _variant,
  size: _size,
  iconRight: _iconRight,
  iconOnly: _iconOnly,
  ...rest
}: DeskHeaderActionProps) {
  const pressed = rest['aria-pressed'] === true || rest['aria-pressed'] === 'true';
  return (
    <button
      {...rest}
      type={type}
      aria-label={ariaLabel ?? rest['aria-label']}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        DESK_BAR_SEGMENT_CLASS,
        'border-l border-mode-edge',
        deskBarSegmentTone(pressed),
        className,
      )}
    >
      {loading ? (
        <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
      ) : icon ? (
        <span aria-hidden className="flex shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

/**
 * The cluster the chrome paints in `addSlot`. Pill face keeps the 8px gap
 * between capsules; segment face stretches to the bar and lets neighbours
 * touch — the 1px edge on each cell is the only separator.
 */
function DeskHeaderActionCluster({ children }: { children: ReactNode }) {
  const face = useDeskHeaderFace();
  return (
    <div
      className={cn(
        'flex shrink-0',
        face === 'segment' ? 'items-stretch' : 'items-center gap-2',
      )}
      data-testid="desk-header-actions"
    >
      {children}
    </div>
  );
}

type DeskActionSlotRole = 'primary' | 'overall' | 'leading';

/** CSV export handed to a desk's Sync / intake dropdown — not a header button. */
type DeskExportMenuAction = {
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
    const count = [overall, leading, primary].filter(Boolean).length;
    if (count === 0) return null;
    if (count === 1) return overall ?? leading ?? primary;
    return (
      <DeskHeaderActionCluster>
        {overall}
        {leading}
        {primary}
      </DeskHeaderActionCluster>
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
