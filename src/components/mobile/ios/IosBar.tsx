'use client';

/**
 * The record sheet's top bar, after Apple's HIG Toolbars + Sheets (researched 2026-10-03):
 *
 * - The title sits on the leading edge (it may wrap — the record display law forbids ellipsizing).
 * - The trailing edge holds the few items that must stay visible, as SYMBOL buttons without
 *   borders, in at most two visually separate groups: tools (the ⋯ More menu, a running timer)
 *   and dismissal (✕). HIG: "Group … critical actions like Done, Close … in dedicated, familiar,
 *   and visually distinct sections"; "Prefer system-provided symbols without borders".
 * - Owner 2026-10-03 places ✕ top-RIGHT (HIG 2026 puts a sheet's Close on the leading edge;
 *   the owner's placement governs here).
 *
 * Every bar button is a 44×44 hit target with a glass-like circular fill (iOS 26 bar items).
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/_cn';

/** The circular, borderless 44px bar item. */
export const IosBarButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }
>(function IosBarButton({ label, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-sunken/80 text-text-default backdrop-blur',
        'transition-transform active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-soft',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export function IosBar({
  title,
  tools,
  close,
}: {
  /** Leading: the record's identity. Wraps; never truncates. */
  title: ReactNode;
  /** Trailing group 1: the More menu and live state (a running timer). */
  tools?: ReactNode;
  /** Trailing group 2: dismissal, always last. */
  close: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-start gap-3 px-1 pt-1">
      {/* py-2.5 + leading-6 = 44px: the title's first line centres on the bar items. */}
      <div className="min-w-0 flex-1 py-2.5 leading-6">{title}</div>
      {tools ? <div className="flex shrink-0 items-center gap-2">{tools}</div> : null}
      {close}
    </div>
  );
}
