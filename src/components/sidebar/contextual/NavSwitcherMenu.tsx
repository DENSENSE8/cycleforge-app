'use client';

import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from '@/design-system/motion';
import { aiPresence, aiTransition } from '@/design-system/ai';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { ChevronDown } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { cn } from '@/utils/_cn';
import { LIST_KEY_OWNER_ATTR } from '@/lib/keyboard/list-key-scope';
import { NAV_BLOCK_CLASS, NAV_CHOICE_SELECTED_CLASS } from './nav-block';
import { KeyHintPopover, useKeyHintAnchor, type KeyHintRow } from './NavGoKeys';

/** One view in the overlay: TEXT only — its key was taught on hover. */
export type NavSwitcherRow = {
  id: string;
  href: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  iconTone?: string;
  /** Right-aligned extra (the view's count). */
  trailing?: ReactNode;
  selected: boolean;
};

/**
 * The page's VIEW switcher — the CHILD tier (Exceptions · PO paired · Pick
 * list · To ship · Shipped). The parent tier (the lane's mode) has its own
 * dropdown (`NavModeSwitcher`); the two never share one. At rest ONE hairline
 * block naming the view you are on. Hover and click do different jobs
 * (operator 2026-09-27):
 *
 * - HOVER teaches the keys: instantly, a card beside the sidebar lists every
 *   view with its digit (`KeyHintPopover`, popping like the AI chat's context
 *   ring card). The page behind never shades.
 * - CLICK (Enter / Space / ↓) hangs an OVERLAY card under the block — same
 *   edges, icons in the block's column, text rows with counts; the block
 *   keeps its height and nothing below moves. ↑/↓ move; Esc ALWAYS closes it
 *   (wherever focus is), as do a press outside and any URL change. The host
 *   owns the list keys while focused, so the desk's record cursor stands down.
 */
export function NavSwitcherMenu({
  current,
  rows,
  hint,
}: {
  current: {
    label: string;
    icon?: ComponentType<{ className?: string }>;
    iconTone?: string;
    /**
     * Secondary marks (other views' alert beacons) that only use the room the
     * label leaves: whole marks that do not fit drop out, the name never
     * truncates for them (owner 2026-10-04, "Que…" under ↩6 ⏱1).
     */
    aside?: ReactNode;
    trailing?: ReactNode;
  };
  rows: readonly NavSwitcherRow[];
  /** The hover card's rows; empty = no hint (no keys bound here). */
  hint: readonly KeyHintRow[];
}) {
  const pathname = usePathname();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const focusFirst = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hintAnchor = useKeyHintAnchor(!open && hint.length > 0);
  const hostRef = useRef<HTMLDivElement>(null);
  const presence = useMotionPresence(aiPresence.fade);
  const transition = useMotionTransition(aiTransition.fade);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open || !focusFirst.current) return;
    focusFirst.current = false;
    listRef.current?.querySelector<HTMLAnchorElement>('a[data-nav-switcher-item]')?.focus();
  }, [open]);
  // Esc closes the overlay from anywhere; a press outside the block does too.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      const inside = hostRef.current?.contains(document.activeElement) ?? false;
      setOpen(false);
      if (inside) triggerRef.current?.focus({ preventScroll: true });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !hostRef.current?.contains(event.target)) setOpen(false);
    };
    // Capture: the overlay is the innermost thing open, so its Esc goes first.
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const moveFocus = (step: number) => {
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-nav-switcher-item]') ?? []);
    if (links.length === 0) return;
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    links[(at + step + links.length) % links.length]?.focus();
  };
  const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') moveFocus(1);
    else if (event.key === 'ArrowUp') moveFocus(-1);
    else if (event.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    } else return;
    event.preventDefault();
  };

  const CurrentIcon = current.icon;
  // One view is no choice: the block names where you are, with no menu or chevron to open.
  if (rows.length === 0) {
    return (
      <div data-nav-switcher="view" className={cn(NAV_BLOCK_CLASS, 'h-8 cursor-default text-role-body font-medium ring-1 ring-border-hairline')}>
        {CurrentIcon ? (
          <span aria-hidden className="flex shrink-0">
            <CurrentIcon className={navIconStrokeClass(cn('size-4', current.iconTone ?? 'text-text-default'))} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{current.label}</span>
        {current.trailing}
      </div>
    );
  }
  return (
    // Owns ↑/↓ while focus is inside, so the desk's record cursor stands down.
    <div
      ref={hostRef}
      data-nav-switcher-host="child"
      {...{ [LIST_KEY_OWNER_ATTR]: '' }}
      className="relative flex flex-col"
    >
      <button
        ref={triggerRef}
        type="button"
        data-nav-switcher="view"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`View: ${current.label}`}
        onClick={() => {
          hintAnchor.hide();
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusFirst.current = true;
            if (open) moveFocus(1);
            else setOpen(true);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
        onPointerEnter={hintAnchor.onPointerEnter}
        onPointerLeave={hintAnchor.onPointerLeave}
        className={cn(
          NAV_BLOCK_CLASS,
          'h-8 text-role-body font-medium ring-1 ring-border-hairline',
          open && 'rounded-b-none bg-surface-card shadow-sm ring-border-soft',
        )}
      >
        {CurrentIcon ? (
          <span aria-hidden className="flex shrink-0">
            <CurrentIcon className={navIconStrokeClass(cn('size-4', current.iconTone ?? 'text-text-default'))} />
          </span>
        ) : null}
        <span className={cn('min-w-0 truncate', current.aside ? 'shrink' : 'flex-1')}>{current.label}</span>
        {current.aside ? (
          // One line tall: a mark past the room wraps onto the hidden second line, so marks drop whole (only a lone first mark can clip).
          <span className="flex h-5 min-w-0 flex-1 flex-wrap items-center justify-end gap-1 overflow-hidden">{current.aside}</span>
        ) : null}
        {current.trailing}
        {/* text-muted, not -faint: the chevron is the menu's only affordance and -faint read 2.6:1 on the light sidebar. */}
        <ChevronDown aria-hidden className={cn('size-3.5 shrink-0 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            ref={listRef}
            id={listId}
            role="group"
            aria-label="View"
            onKeyDown={onListKeyDown}
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            data-nav-switcher-list="child"
            // An OVERLAY welded to the block: no gap, the block's square
            // bottom meets its square top on ONE shared hairline (1px down,
            // so the two rings coincide). Same edges as the block, row icons
            // at the block icon's x. Nothing below moves; only opacity animates.
            className={cn(
              'absolute inset-x-0 top-[calc(100%+1px)] z-dropdown flex flex-col gap-px bg-surface-card ring-1 ring-border-soft',
              SIDEBAR_CONTROL_CORNER,
              'rounded-t-none',
              elevationClass('overlay'),
            )}
          >
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <Link
                  key={row.id}
                  href={row.href}
                  prefetch={false}
                  data-nav-switcher-item={row.id}
                  aria-current={row.selected ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(NAV_BLOCK_CLASS, 'h-8 text-role-body', row.selected && NAV_CHOICE_SELECTED_CLASS)}
                >
                  {Icon ? (
                    <span aria-hidden className="flex shrink-0">
                      <Icon className={navIconStrokeClass(cn('size-4', row.iconTone ?? 'text-text-muted'))} />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  {row.trailing}
                </Link>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <KeyHintPopover id="child" at={hintAnchor.at} rows={hint} />
    </div>
  );
}
