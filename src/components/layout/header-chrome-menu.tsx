'use client';

/**
 * Shared GlobalHeader chrome menu — panel + row SoT for Page · Recents · Pins.
 * Industrial flush column: zero radius, zero outer pad, square row hover.
 * Never fork local panel/row classes in those three switchers.
 */

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Check } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';
import { TOP_CHROME_ICON_FACE } from './header-shell';

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
      className={cn(
        'min-w-[11rem] overflow-y-auto rounded-none border border-border-default border-t-0 bg-surface-card p-0',
        elevationClass('raised', 'soft'),
        className,
      )}
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
        // `"page"` (was the generic `"true"`) — every row here IS a page / destination (Page switcher's children, a Recents entry, a Pin), so the…
        aria-current={active ? 'page' : undefined}
        className={cn(
          // Rail-matched row type (2026-08-16, bumped again same day) — `font-semibold text-text-default`, same weight/ink as RailRowBody's title…
          'ds-raw-button flex min-w-0 flex-1 items-center gap-2 rounded-none px-3 py-2.5 text-left text-role-nav text-text-default',
          focusRing('control', 'accent'),
          !hasSideSlots && 'w-full border-b border-border-hairline hover:bg-surface-sunken',
          !hasSideSlots && active && 'bg-surface-sunken',
          className,
        )}
        {...rest}
      >
        {/* `text-text-default` (2026-08-16) — matches HEADER_ICON_BTN_CLASS's base ink (header-shell.ts) and the spine's constant ink… */}
        <span
          className={cn(
            // TOP_CHROME_ICON_FACE, not the bare glyph box:
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
          'flex w-full items-center gap-0.5 rounded-none border-b border-border-hairline',
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

/** A BAND caption inside the menu — the same word the desk paints over the same run of rows. */
export function HeaderChromeMenuLabel({ children }: { children: ReactNode }) {
  return (
    <p
      role="presentation"
      className="border-b border-border-hairline bg-surface-sunken px-3 py-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft"
    >
      {children}
    </p>
  );
}

export function HeaderChromeMenuEmpty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-2.5 text-role-caption text-text-faint">{children}</p>;
}
