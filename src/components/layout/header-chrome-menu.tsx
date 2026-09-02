'use client';

/**
 * Shared GlobalHeader chrome menu — padded overlay + row SoT for Recents · Pins.
 * Click opens `HeaderChromeMenuLayer` (dropdown shell radius, wrapping outline, top-down
 * Motion). Hover-peek of MasterNav is the sidebar collapse button only.
 * Inner list is `HeaderChromeMenu`. Never fork panel classes in the switchers.
 */

import {
  forwardRef,
  useLayoutEffect,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import { Check } from '@/components/Icons';
import { SIDEBAR_SPINE_PEEK_INSET_PX } from '@/components/sidebar/sidebar-spine';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import {
  AnchoredLayer,
  type AnchoredPlacement,
} from '@/design-system/primitives/AnchoredLayer';
import {
  DROPDOWN_ITEM_CORNER,
  DROPDOWN_SHELL_CORNER,
} from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';
import { TOP_CHROME_ICON_FACE } from './header-shell';

/** {@link DROPDOWN_SHELL_CORNER} → `rounded-lg` (8px). SVG wrap uses the px twin. */
const HEADER_CHROME_MENU_SURFACE_RX_PX = 8;

function HeaderChromeWrapOutline() {
  const reduce = useReducedMotion();
  const transition = useMotionTransition(framerTransition.navDropdownFromTop);
  return (
    <motion.svg
      aria-hidden
      className="pointer-events-none absolute -inset-px h-[calc(100%+2px)] w-[calc(100%+2px)] overflow-visible text-border-default"
    >
      <motion.rect
        x="0.5"
        y="0.5"
        width="calc(100% - 1px)"
        height="calc(100% - 1px)"
        rx={HEADER_CHROME_MENU_SURFACE_RX_PX}
        ry={HEADER_CHROME_MENU_SURFACE_RX_PX}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        exit={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        transition={transition}
      />
    </motion.svg>
  );
}

export function HeaderChromeMenuLayer({
  open,
  onClose,
  anchorRef,
  placement,
  matchWidth,
  surfaceProps,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  placement: AnchoredPlacement;
  matchWidth?: boolean;
  surfaceProps?: HTMLAttributes<HTMLElement> & { 'data-hover-surface'?: '' };
  children: ReactNode;
}) {
  const presence = useMotionPresence(framerPresence.navDropdownFromTop);
  const transition = useMotionTransition(framerTransition.navDropdownFromTop);
  const [layerOpen, setLayerOpen] = useState(open);
  const { className: surfaceClassName, style: surfaceStyle, onMouseEnter, onMouseLeave } =
    surfaceProps ?? {};

  useLayoutEffect(() => {
    if (open) setLayerOpen(true);
  }, [open]);

  if (!layerOpen) return null;

  return (
    <AnchoredLayer
      open={layerOpen}
      onClose={onClose}
      anchorRef={anchorRef}
      placement={placement}
      gap={SIDEBAR_SPINE_PEEK_INSET_PX}
      matchWidth={matchWidth}
    >
      <AnimatePresence
        onExitComplete={() => {
          if (!open) setLayerOpen(false);
        }}
      >
        {open ? (
          <motion.div
            key="header-chrome-menu"
            {...presence}
            transition={transition}
            className="origin-top"
            style={{ transformOrigin: '50% 0' }}
          >
            <div
              data-hover-surface=""
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              style={surfaceStyle as CSSProperties | undefined}
              className={cn(
                'relative overflow-hidden bg-surface-card p-1',
                DROPDOWN_SHELL_CORNER,
                elevationClass('overlay'),
                surfaceClassName,
              )}
            >
              <HeaderChromeWrapOutline />
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </AnchoredLayer>
  );
}

export function HeaderChromeMenu({
  ariaLabel,
  children,
  className,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="menu"
      aria-label={ariaLabel}
      className={cn('min-w-[11rem] overflow-y-auto', className)}
    >
      {children}
    </div>
  );
}

type HeaderChromeMenuItemProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> & {
  icon: ReactNode;
  label: string;
  /** Sunken fill + medium weight (current destination). */
  active?: boolean;
  /**
   * Reserve a Check-sized trailing slot; render Check when `active`.
   * Page switcher uses this so labels stay aligned across rows.
   */
  activeCheck?: boolean;
  /** Leading slot (e.g. drag grip for Pins). Outside the navigate button. */
  leading?: ReactNode;
  /**
   * Trailing slot (kbd hint, unpin, …). Rendered as a sibling of the navigate
   * button so interactive controls are never nested buttons. Ignored when
   * `activeCheck` is set.
   */
  trailing?: ReactNode;
};

export const HeaderChromeMenuItem = forwardRef<HTMLButtonElement, HeaderChromeMenuItemProps>(
  function HeaderChromeMenuItem(
    {
      icon,
      label,
      active = false,
      activeCheck = false,
      leading,
      trailing,
      className,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    const hasSideSlots = Boolean(leading) || (Boolean(trailing) && !activeCheck);

    const button = (
      <button
        ref={ref}
        type={type}
        role="menuitem"
        // `"page"` (was the generic `"true"`) — every row here IS a page /
        // destination (Page switcher's children, a Recents entry, a Pin), so
        // the more specific WAI-ARIA value applies, matching the spine rows
        // these menus are a second door onto (`SidebarNavList.tsx`).
        aria-current={active ? 'page' : undefined}
        className={cn(
          // Rail-matched row type (2026-08-16, bumped again same day) —
          // `font-semibold text-text-default`, same weight/ink as
          // RailRowBody's title line, at `role-title` (18px) — matching the
          // spine's own settled size (`SidebarNavList.tsx` —
          // `SPINE_ROW_FACE_CLASS` docblock has the full sizing history).
          // These rows are the SAME destinations as the spine, opened from a
          // second door (the header face), so they take the spine row's own
          // size — `role-nav` (13px). They ran at `role-title` (18px) until
          // 2026-08-19, which was correct while the header face was also 18px
          // and wrong the moment it quieted: an 18px dropdown hanging off a
          // 12px trigger reads as a different system, not a second door.
          // `active` marks itself via the `bg-surface-sunken` fill below,
          // never a font-weight bump.
          'ds-raw-button flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-role-nav text-text-default last:border-b-0',
          DROPDOWN_ITEM_CORNER,
          focusRing('control', 'accent'),
          !hasSideSlots && 'w-full border-b border-border-hairline hover:bg-surface-sunken',
          !hasSideSlots && active && 'bg-surface-sunken',
          className,
        )}
        {...rest}
      >
        {/* `text-text-default` (2026-08-16) — matches HEADER_ICON_BTN_CLASS's
            base ink (header-shell.ts) and the spine's constant ink
            (spine-section-accent.ts); these menu rows (Page / Recents /
            Pins) are the same nav system as the row they open from. */}
        <span
          className={cn(
            // TOP_CHROME_ICON_FACE, not the bare glyph box: these rows open
            // FROM the beam and must draw at the beam's weight (page stroke
            // 1.5). Passing icons in as `<Icon />` with no className left every
            // dropdown row at Lucide's native stroke 2 — a heavier glyph in the
            // menu than on the control that opened it.
            TOP_CHROME_ICON_FACE,
            'flex shrink-0 items-center justify-center text-text-default [&>svg]:h-full [&>svg]:w-full',
          )}
        >
          {icon}
        </span>
        {/* `title` — truncation tooltip, same reasoning as the spine rows
            these menus mirror (`SidebarNavList.tsx`). */}
        <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
        {activeCheck ? (
          active ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
          ) : (
            <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )
        ) : null}
      </button>
    );

    if (!hasSideSlots) return button;

    return (
      <div
        className={cn(
          'flex w-full items-center gap-0.5 border-b border-border-hairline last:border-b-0',
          DROPDOWN_ITEM_CORNER,
          'hover:bg-surface-sunken',
          active && 'bg-surface-sunken',
        )}
      >
        {leading ? <div className="flex shrink-0 items-center pl-1.5">{leading}</div> : null}
        {button}
        {trailing && !activeCheck ? (
          <div className="flex shrink-0 items-center pr-1">{trailing}</div>
        ) : null}
      </div>
    );
  },
);

export function HeaderChromeMenuEmpty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-2.5 text-role-caption text-text-faint">{children}</p>;
}
