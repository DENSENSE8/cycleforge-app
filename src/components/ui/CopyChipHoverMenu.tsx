'use client';

/**
 * Hover-under-chip secondary action menu — SoT for dense table identity chips
 * and (via thin adapters) unbox carton chips.
 *
 * Pattern (IdentityLinkChip / SerialChipWithMenu):
 *   • Chip click = primary (copy or open) — parent supplies the chip child.
 *   • Hover the group → menu below chip.
 *   • stopPropagation so table rows don't open detail on menu clicks.
 *
 * The menu renders in a **body portal** (like {@link HoverTooltip}) positioned
 * from the trigger's rect. This is load-bearing: the dashboard order rows apply
 * a `transform` to the chip cluster on row-hover, and `transform` creates a
 * stacking context — an in-flow `absolute` menu would be trapped inside it and
 * painted over by the next row (a later DOM sibling), regardless of its
 * `z-index`. A body portal escapes every row stacking context so the menu is
 * never clipped or covered.
 *
 * {@link CopyChipHoverMenuPanel} is the presentational chrome + rows — also
 * composed in-place by hosts that already own hover (e.g. photo launcher toolbar).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/_cn';
import { zIndex } from '@/design-system/tokens/z-index';

const MARGIN = 8;
/** Gap between the chip and the menu — also the pointer-bridge the portal must cover. */
const GAP = 4;
/** Grace period so crossing the chip→menu gap doesn't close the menu. */
const CLOSE_DELAY_MS = 120;

export type CopyChipHoverMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Destructive rows (delete) use rose tone. */
  tone?: 'default' | 'accent' | 'danger';
};

/**
 * Presentational drop panel — same chrome / menuitem rows as the hover portal.
 *
 * `denseLabel` (carton chips / photo toolbar): short verbs inherit button
 * `uppercase tracking-widest` (OPEN / EDIT face). Default keeps sentence-case
 * dashboard labels.
 */
export function CopyChipHoverMenuPanel({
  items,
  menuLabel,
  className,
  denseLabel = false,
  onItemSelect,
  'data-testid': dataTestId,
}: {
  items: CopyChipHoverMenuItem[];
  menuLabel: string;
  className?: string;
  denseLabel?: boolean;
  /** Extra hook after a successful select (e.g. close the hover portal). */
  onItemSelect?: (item: CopyChipHoverMenuItem) => void;
  'data-testid'?: string;
}) {
  return (
    <div
      role="menu"
      aria-label={menuLabel}
      data-testid={dataTestId}
      className={cn(
        'min-w-35 overflow-hidden rounded-lg border border-border-soft bg-surface-card shadow-lg',
        className,
      )}
    >
      {items.map((item, i) => {
        const toneClass =
          item.tone === 'danger'
            ? 'text-rose-600 hover:bg-rose-50'
            : item.tone === 'accent'
              ? 'text-blue-700 hover:bg-blue-50'
              : 'text-text-muted hover:bg-surface-hover';
        const iconClass =
          item.tone === 'danger'
            ? 'text-rose-600'
            : item.tone === 'accent'
              ? 'text-blue-600'
              : 'text-text-soft';
        return (
          // ds-raw-button: text-left dropdown menuitem row (icon + label)
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (item.disabled) return;
              item.onSelect();
              onItemSelect?.(item);
            }}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-role-caption font-semibold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40',
              i > 0 ? 'border-t border-border-hairline' : '',
              toneClass,
            )}
          >
            {item.icon ? (
              <span
                className={cn(
                  'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5',
                  iconClass,
                )}
              >
                {item.icon}
              </span>
            ) : null}
            {denseLabel ? (
              item.label
            ) : (
              <span className="min-w-0 truncate normal-case tracking-normal font-semibold">
                {item.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function CopyChipHoverMenu({
  children,
  items,
  menuLabel,
  className,
  onOpenChange,
}: {
  children: ReactNode;
  items: CopyChipHoverMenuItem[];
  menuLabel: string;
  className?: string;
  /** Fires when the dropdown opens (true) / closes (false) — lets a host row keep
   *  its hover-expanded chrome (chevron + shifted chips) while the menu is up. */
  onOpenChange?: (open: boolean) => void;
}) {
  const enabled = items.length > 0;
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trigger rect captured on open; the menu is positioned off-screen+hidden
  // first so we can measure it, then clamped into view in the layout effect.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const clearClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const open = useCallback(() => {
    if (!enabled) return;
    clearClose();
    const r = triggerRef.current?.getBoundingClientRect();
    if (r && r.width >= 2 && r.height >= 2) {
      setAnchor(r);
      setPos(null);
    }
  }, [enabled, clearClose]);

  const close = useCallback(() => {
    clearClose();
    setAnchor(null);
    setPos(null);
  }, [clearClose]);

  const scheduleClose = useCallback(() => {
    clearClose();
    closeTimer.current = setTimeout(() => {
      setAnchor(null);
      setPos(null);
    }, CLOSE_DELAY_MS);
  }, [clearClose]);

  // Notify the host on open/close transitions (keyed on the boolean, not the rect).
  const isOpen = anchor != null;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    onOpenChangeRef.current?.(isOpen);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return;
    const b = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const roomBelow = vh - anchor.bottom - MARGIN;
    // Prefer below the chip; flip above only when there isn't room below.
    const below = roomBelow >= b.height || roomBelow >= anchor.top - MARGIN;
    const rawTop = below ? anchor.bottom + GAP : anchor.top - b.height - GAP;
    const top = Math.min(Math.max(rawTop, MARGIN), Math.max(MARGIN, vh - b.height - MARGIN));

    const rawLeft = anchor.left + anchor.width / 2 - b.width / 2;
    const left = Math.min(Math.max(rawLeft, MARGIN), Math.max(MARGIN, vw - b.width - MARGIN));

    setPos({ top, left });
  }, [anchor]);

  // Close on scroll (the fixed portal would otherwise leak over unrelated
  // regions) and on unmount.
  useEffect(() => {
    if (!anchor) return;
    const onScroll = () => close();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [anchor, close]);

  useEffect(() => () => clearClose(), [clearClose]);

  const menu =
    anchor && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? 'visible' : 'hidden',
              zIndex: zIndex.panelPopover,
            }}
            className="fixed transition-opacity duration-100"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={clearClose}
            onMouseLeave={scheduleClose}
          >
            <CopyChipHoverMenuPanel items={items} menuLabel={menuLabel} onItemSelect={() => close()} />
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={triggerRef}
      className={cn('group relative inline-flex shrink-0 items-center', className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
    >
      {children}
      {menu}
    </div>
  );
}
