'use client';

/**
 * SlicedActionDock — bottom-docked floating terminal CTA (DoorDash/Uber sticky job).
 *
 * Fully rounded pill track (`rounded-2xl` on all corners). Optional menu/primary
 * segments share one tone track with a hairline between:
 *   [ ▾ menu ]|[ primary CTA ]
 *
 * Placement:
 *   - `bottom` (default) — absolute float at host bottom
 *   - `bottom` + `docked` — in-flow band under other docked bands (receive feedback)
 *
 * Host must be `position: relative` + full-height; scroll body reserves
 * {@link STATION_TERMINAL_SCROLL_CLEARANCE} (`pb-32`) when absolute.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronDown, Loader2 } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { operatorAccentClasses } from '@/utils/operator-accent';
import { Popover } from './Popover';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SlicedActionTone =
  | 'accent'
  | 'blue'
  | 'emerald'
  | 'orange'
  | 'violet'
  | 'red'
  | 'gray';

export interface SlicedActionMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  /** Marks the active choice (e.g. selected label kind). */
  selected?: boolean;
  /** Quiet rule above this item — group outcomes below selections. */
  separatorBefore?: boolean;
  /** Keep the menu open after click (selection toggles). Default closes. */
  keepOpen?: boolean;
}

/** Canvas edge the dock slices against. Extend when a new region needs a slice. */
export type SlicedActionEdge = 'bottom';

export interface SlicedActionDockProps {
  /** CTA label. */
  label: string;
  /** Primary click handler. */
  onClick: () => void;
  /** Leading icon node. */
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  /** Title attribute for the CTA (explains disabled states). */
  title?: string;
  /** Tone preset. Ignored when `toneClasses` is set. Defaults to `accent`. */
  tone?: SlicedActionTone;
  /** Override the tone with arbitrary Tailwind classes (e.g. a per-row theme). */
  toneClasses?: { bg: string; hover: string };
  /** Optional split — left menu segment + primary segment. */
  menu?: SlicedActionMenuItem[];
  /** aria-label for the chevron trigger. Defaults to "More actions". */
  menuLabel?: string;
  /** title attribute for the chevron trigger. */
  menuTitle?: string;
  /** Max width of the centered track. Match the host column. */
  maxWidth?: string;
  /** Stretch the track to fill `maxWidth`. Default `false`. */
  fullWidth?: boolean;
  /**
   * In-flow docked band instead of absolute bottom float. Use when other bands
   * (receive feedback, label preview) stack above the terminal CTA.
   */
  docked?: boolean;
  /** Dock placement. Default `bottom`. */
  edge?: SlicedActionEdge;
  /** Extra class on the outer wrapper. */
  className?: string;
}

const TONE_BG_SOLID: Record<SlicedActionTone, string> = {
  accent: operatorAccentClasses.bg,
  blue: 'bg-blue-600',
  emerald: 'bg-emerald-600',
  orange: 'bg-orange-600',
  violet: 'bg-violet-700',
  red: 'bg-rose-600',
  gray: 'bg-surface-inverse',
};

/** Fully rounded floating pill chrome (all four corners). */
const PILL_TRACK = 'rounded-2xl shadow-lg shadow-black/15 ring-1 ring-black/5';

const spring = { type: 'spring', stiffness: 520, damping: 36 } as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function SlicedActionDock({
  label,
  onClick,
  icon,
  disabled = false,
  loading = false,
  title,
  tone = 'accent',
  toneClasses,
  menu,
  menuLabel,
  menuTitle,
  maxWidth = 'max-w-[720px]',
  fullWidth = false,
  docked = false,
  edge = 'bottom',
  className,
}: SlicedActionDockProps) {
  const isDisabled = disabled || loading;
  const solidBg = isDisabled
    ? 'bg-surface-strong'
    : toneClasses
      ? toneClasses.bg
      : TONE_BG_SOLID[tone];
  const hasMenu = Array.isArray(menu) && menu.length > 0;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuListId = useId();

  useEffect(() => {
    if (loading) setMenuOpen(false);
  }, [loading]);

  const leadingIcon = loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon;
  const closeMenu = () => setMenuOpen(false);

  // Only `bottom` exists today — keep the switch so new edges stay explicit.
  const wrapperClass =
    edge === 'bottom'
      ? docked
        ? 'shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6'
        : 'pointer-events-none absolute inset-x-0 bottom-0 z-fab px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-6'
      : '';

  return (
    <div className={cn(wrapperClass, className)}>
      <div
        className={cn(
          'mx-auto flex w-full',
          docked ? '' : 'pointer-events-auto',
          maxWidth,
          fullWidth ? '' : 'justify-center',
        )}
      >
        {hasMenu ? (
          <motion.div
            whileTap={isDisabled ? undefined : { scale: 0.99 }}
            transition={spring}
            className={cn(
              'relative z-20 flex w-full min-w-0 overflow-visible transition-[filter] duration-100',
              PILL_TRACK,
              isDisabled ? 'cursor-not-allowed' : 'hover:brightness-[0.96] active:brightness-[0.92]',
              solidBg,
              fullWidth ? '' : 'max-w-full',
            )}
            data-testid="sliced-action-dock"
            data-edge={edge}
            data-segments="menu,primary"
          >
            {/* Menu segment — left half of pill */}
            <div className="relative flex shrink-0 self-stretch">
              {/* ds-raw-button: split-menu chevron; Popover owns dismissal */}
              <button
                ref={menuTriggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuListId : undefined}
                aria-label={menuLabel ?? 'More actions'}
                title={menuTitle}
                disabled={loading}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((open) => !open);
                }}
                className="flex h-12 items-center justify-center rounded-l-2xl border-r border-white/20 bg-transparent px-3 text-white outline-none transition-[filter] focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ChevronDown
                  className={cn(
                    'h-4 w-4 opacity-95 transition-transform duration-150',
                    menuOpen && 'rotate-180',
                  )}
                />
              </button>
              <Popover
                open={menuOpen}
                onClose={closeMenu}
                anchorRef={menuTriggerRef}
                placement="top-start"
                gap={6}
                padded={false}
                role="menu"
                id={menuListId}
                aria-label={menuLabel ?? 'More actions'}
                className="min-w-[14rem] py-1 shadow-xl ring-1 ring-border-soft/80"
              >
                {menu!.map((item) => (
                  <div key={item.label} role="none">
                    {item.separatorBefore ? (
                      <div
                        role="separator"
                        className="my-1 border-t border-border-hairline"
                      />
                    ) : null}
                    {/* ds-raw-button: menu item inside Popover role=menu */}
                    <button
                      role="menuitem"
                      type="button"
                      disabled={item.disabled}
                      title={item.title}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.disabled) return;
                        item.onClick();
                        if (!item.keepOpen) closeMenu();
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-role-caption font-black uppercase tracking-wider transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-35',
                        item.selected ? 'bg-surface-hover text-text-default' : 'text-text-default',
                      )}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-muted">
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.selected ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-text-default" aria-hidden />
                      ) : (
                        <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      )}
                    </button>
                  </div>
                ))}
              </Popover>
            </div>
            {/* Primary segment */}
            <button
              type="button"
              onClick={onClick}
              disabled={isDisabled}
              title={title}
              className={cn(
                'inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-r-2xl bg-transparent px-6 text-sm font-bold text-white outline-none transition-[filter] focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {leadingIcon}
              <span className="truncate">{label}</span>
            </button>
          </motion.div>
        ) : (
          <motion.button
            type="button"
            onClick={onClick}
            disabled={isDisabled}
            title={title}
            whileTap={isDisabled ? undefined : { scale: 0.99 }}
            transition={spring}
            data-testid="sliced-action-dock"
            data-edge={edge}
            data-segments="primary"
            className={cn(
              'inline-flex h-12 items-center justify-center gap-2.5 px-6 text-sm font-bold text-white outline-none transition-[filter] focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60',
              PILL_TRACK,
              isDisabled ? '' : 'hover:brightness-[0.96] active:brightness-[0.92]',
              solidBg,
              fullWidth ? 'w-full min-w-0' : 'max-w-full',
            )}
          >
            {leadingIcon}
            <span className="truncate">{label}</span>
          </motion.button>
        )}
      </div>
    </div>
  );
}
