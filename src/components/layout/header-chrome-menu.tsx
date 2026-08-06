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
import { TOP_CHROME_ICON_GLYPH } from './header-shell';

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
        'min-w-[11rem] overflow-hidden rounded-none border border-border-default border-t-0 bg-surface-card p-0',
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
        aria-current={active ? 'true' : undefined}
        className={cn(
          'ds-raw-button flex min-w-0 flex-1 items-center gap-2 rounded-none px-3 py-2.5 text-left text-sm text-text-default',
          focusRing('control', 'accent'),
          active && 'font-medium',
          !hasSideSlots && 'w-full border-b border-border-hairline hover:bg-surface-sunken',
          !hasSideSlots && active && 'bg-surface-sunken',
          className,
        )}
        {...rest}
      >
        <span
          className={cn(
            TOP_CHROME_ICON_GLYPH,
            'flex shrink-0 items-center justify-center text-text-muted [&>svg]:h-full [&>svg]:w-full',
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
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

export function HeaderChromeMenuEmpty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-2.5 text-role-caption text-text-faint">{children}</p>;
}
