'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem, NavSection } from '@/lib/nav/context/schema';
import { getSidebarPageNav } from '@/lib/sidebar-navigation';
import { AnimatePresence, motion } from '@/design-system/motion';
import { aiPresence, aiTransition } from '@/design-system/ai';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { elevationClass } from '@/design-system/tokens/shadows';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { ChevronsUpDown } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { cn } from '@/utils/_cn';
import { LIST_KEY_OWNER_ATTR } from '@/lib/keyboard/list-key-scope';
import { GO_HINT_LEAD, goHintRows, KeyHintPopover, useKeyHintAnchor } from './NavGoKeys';
import { useGoKeys } from './go-keys-store';
import { NAV_VIEW_ICONS } from './nav-view-icons';
import { CountChip, useViewCounts } from './NavViewSwitcher';

/**
 * A modes section, built by the resolver: a door lane's pages
 * (`<page>.<lane>.modes`) or a page's own modes (`<page>.modes`,
 * `NavPageDecl.modes`).
 */
export function isNavModeSection(section: NavSection): boolean {
  return section.id.endsWith('.modes');
}

/** No items: a lane's modes are pages, which carry no view counts. */
const NO_COUNTED_MODES: readonly NavItem[] = [];

/**
 * A mode's icon and colour. A lane's mode is a page (its registry icon and
 * tone); a page's own mode is one of its views' glyphs (`NAV_VIEW_ICONS`).
 */
function modeGlyph(item: NavItem, ownerPageId: string | null) {
  const view = ownerPageId ? NAV_VIEW_ICONS[`${ownerPageId}.${item.id}`] : undefined;
  if (view) return { icon: view.icon, tone: view.tone, alertCount: view.alertCount };
  const page = getSidebarPageNav(item.id);
  return page ? { icon: page.icon, tone: page.tone, alertCount: undefined } : null;
}

/** One row of the parent card — the trigger and every mode share it, so icons and labels stack in one column. */
const MODE_ROW_CLASS = cn(
  'ds-raw-button flex w-full min-w-0 items-center gap-2 px-2 text-left text-role-body text-text-default',
  'transition-[background-color,transform] duration-100 ease-out active:translate-y-px',
  focusRing('control', 'accent'),
);

/**
 * The PARENT tier, its own dropdown, never the view's (operator 2026-09-27):
 * a door lane's MODES (Shipping · FBA · Labels & docs), or a page's OWN modes
 * (`NavPageDecl.modes` — Exceptions: Fulfillment · Inventory · Receiving,
 * each with its count). One raised card under `‹ <Lane>`: the
 * current mode in its colour, semibold, ⇅.
 *
 * - HOVER teaches the keys: instantly, a card beside the sidebar reads
 *   `[G] then` over `[S] Shipping · [F] FBA · [L] Label intake`, each in its
 *   mode colour. The page never shades.
 * - CLICK (Enter / Space / ↓) hangs an OVERLAY under the card — the card
 *   keeps its height, nothing below moves — listing the OTHER modes: the one
 *   you are in is already the card, so it is never listed twice. Rows sit in
 *   the card's column (icon under icon, label under label), coloured, text
 *   only (the keys were taught on hover). ↑/↓ move; Esc ALWAYS closes it
 *   (wherever focus is) and a press outside or a URL change closes it too.
 */
export function NavModeSwitcher({ section, currentPageId }: { section: NavSection; currentPageId: string }) {
  const pathname = usePathname();
  const listId = useId();
  const { targets } = useGoKeys();
  const [open, setOpen] = useState(false);
  const focusFirst = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const modeIds = new Set(section.items.map((item) => item.id));
  // A page's own modes stamp the current one; a lane's current mode is the page.
  const currentId = section.items.find((item) => item.active)?.id ?? (modeIds.has(currentPageId) ? currentPageId : section.items[0]?.id);
  const ownerPageId = section.id === `${currentPageId}.modes` ? currentPageId : null;
  const counts = useViewCounts(currentPageId, ownerPageId ? section.items : NO_COUNTED_MODES);
  const hint = goHintRows(targets.filter((target) => modeIds.has(target.id))).map((row) => ({ ...row, current: row.id === currentId }));
  const hintAnchor = useKeyHintAnchor(!open && hint.length > 0);
  const presence = useMotionPresence(aiPresence.fade);
  const transition = useMotionTransition(aiTransition.fade);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open || !focusFirst.current) return;
    focusFirst.current = false;
    cardRef.current?.querySelector<HTMLAnchorElement>('a[data-nav-mode-item]')?.focus();
  }, [open]);
  // Esc closes the overlay from anywhere; a press outside the card does too.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      const inside = cardRef.current?.contains(document.activeElement) ?? false;
      setOpen(false);
      if (inside) triggerRef.current?.focus({ preventScroll: true });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !cardRef.current?.contains(event.target)) setOpen(false);
    };
    // Capture: the overlay is the innermost thing open, so its Esc goes first.
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  if (section.items.length === 0) return null;
  const current = section.items.find((item) => item.id === currentId);
  const others = section.items.filter((item) => item.id !== currentId);
  const currentGlyph = current ? modeGlyph(current, ownerPageId) : null;

  const moveFocus = (step: number) => {
    const links = Array.from(cardRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-nav-mode-item]') ?? []);
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

  return (
    <div
      ref={cardRef}
      data-nav-mode-card
      data-open={open ? '' : undefined}
      // Owns ↑/↓ while focus is inside, so the desk's record cursor stands down.
      {...{ [LIST_KEY_OWNER_ATTR]: '' }}
      className={cn(
        'relative flex flex-col bg-surface-card shadow-sm ring-1 ring-border-soft',
        SIDEBAR_CONTROL_CORNER,
        open && others.length > 0 && 'rounded-b-none',
      )}
    >
      <button
        ref={triggerRef}
        type="button"
        data-nav-switcher="mode"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${section.label ?? 'Mode'}: ${current?.label ?? ''}`}
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
        className={cn(MODE_ROW_CLASS, 'h-9 font-semibold hover:bg-surface-sunken/60', SIDEBAR_CONTROL_CORNER, open && 'rounded-b-none')}
      >
        {currentGlyph ? (
          <currentGlyph.icon aria-hidden className={navIconStrokeClass(cn('size-4 shrink-0', currentGlyph.tone ?? 'text-text-default'))} />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{current?.label ?? section.label ?? 'Mode'}</span>
        {current && current.id in counts ? <CountChip id={current.id} count={counts[current.id]} alert={currentGlyph?.alertCount} /> : null}
        <ChevronsUpDown aria-hidden className={cn('size-3.5 shrink-0', open ? 'text-text-default' : 'text-text-muted')} />
      </button>
      <AnimatePresence>
        {open && others.length > 0 ? (
          <motion.div
            key="modes"
            id={listId}
            role="group"
            aria-label={section.label ?? 'Mode'}
            data-nav-switcher-list="parent"
            onKeyDown={onListKeyDown}
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            // An OVERLAY welded to the card: no gap, the card's square bottom
            // meets its square top on ONE shared hairline (1px down, so the
            // two rings coincide), and the pair reads as one surface. Ring,
            // not border, so each row's icon sits at the head icon's x.
            // Nothing below moves.
            className={cn(
              'absolute inset-x-0 top-[calc(100%+1px)] z-dropdown flex flex-col gap-px bg-surface-card ring-1 ring-border-soft',
              SIDEBAR_CONTROL_CORNER,
              'rounded-t-none',
              elevationClass('overlay'),
            )}
          >
            {others.map((item) => {
              const glyph = modeGlyph(item, ownerPageId);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={false}
                  data-nav-mode-item={item.id}
                  onClick={() => setOpen(false)}
                  className={cn(MODE_ROW_CLASS, item.description ? 'min-h-8 py-1' : 'h-8', 'font-medium hover:bg-surface-sunken', SIDEBAR_CONTROL_CORNER)}
                >
                  {glyph ? (
                    <glyph.icon aria-hidden className={navIconStrokeClass(cn('size-4 shrink-0', glyph.tone ?? 'text-text-muted'))} />
                  ) : null}
                  {item.description ? (
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{item.label}</span>
                      <span className="truncate text-role-caption font-normal text-text-muted">{item.description}</span>
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  )}
                  {item.id in counts ? <CountChip id={item.id} count={counts[item.id]} alert={glyph?.alertCount} /> : null}
                </Link>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <KeyHintPopover id="parent" at={hintAnchor.at} rows={hint} lead={GO_HINT_LEAD} />
    </div>
  );
}
