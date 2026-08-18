'use client';

/**
 * Hover-beside-chip secondary action menu — SoT for dense table identity chips
 * and (via thin adapters) unbox carton chips.
 *
 * Pattern (IdentityLinkChip / SerialChipWithMenu):
 *   • Chip click = primary (copy or open) — parent supplies the chip child.
 *   • Hover the group → menu beside the chip (prefer trailing/right; flip left).
 *   • stopPropagation so table rows don't open detail on menu clicks.
 *
 * Side placement is load-bearing for LedgerGrid / queue sheets: a below-chip
 * menu sits in the vertical row-scan path and blocks travel to the next row.
 * Default `placement` stays `auto` (side flyout). Carton identity may pass
 * `placement="bottom"` + `avoidCollisions={false}` + `itemPad="chip"`.
 *
 * The full-ID SiteTooltip stays above (`pointer-events-none`); OPEN/EDIT exit
 * horizontally so the column stays traversable.
 *
 * The menu renders in a **body portal** (like {@link HoverTooltip}) positioned
 * from the trigger's rect via {@link clampPortalSideMenuPosition}. This is also
 * load-bearing: dashboard order rows apply a `transform` to the chip cluster on
 * row-hover, and `transform` creates a stacking context — an in-flow `absolute`
 * menu would be trapped inside it and painted over by the next row (a later DOM
 * sibling), regardless of its `z-index`. A body portal escapes every row
 * stacking context so the menu is never clipped or covered.
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
import {
  CHIP_HOVER_MENU_ICON_CLASS,
  CHIP_HOVER_MENU_ITEM_CLASS,
  CHIP_HOVER_MENU_ITEM_SEAM_CLASS,
  CHIP_HOVER_MENU_ITEM_TONE,
  CHIP_HOVER_MENU_PANEL_CLASS,
} from '@/components/ui/copy-chip-hover-menu-chrome';
import {
  clampPortalSideMenuPosition,
  PORTAL_BELOW_MENU_GAP,
  PORTAL_SIDE_MENU_GAP,
  readTrustedTriggerRect,
  type PortalSideMenuAlign,
  type PortalSideMenuPlacement,
} from '@/lib/ui/portal-anchor';
import { useHoverSurface } from '@/hooks/useHoverSurface';

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
  itemPad = 'default',
  onItemSelect,
  'data-testid': dataTestId,
}: {
  items: CopyChipHoverMenuItem[];
  menuLabel: string;
  className?: string;
  denseLabel?: boolean;
  /**
   * `chip` — carton / photo-toolbar rows match the chip face (`px-1.5` `gap-1.5`).
   * Default keeps LedgerGrid menu breathing room (`px-3` `gap-2`).
   */
  itemPad?: 'default' | 'chip';
  /** Extra hook after a successful select (e.g. close the hover portal). */
  onItemSelect?: (item: CopyChipHoverMenuItem) => void;
  'data-testid'?: string;
}) {
  return (
    <div
      role="menu"
      aria-label={menuLabel}
      data-testid={dataTestId}
      className={cn(CHIP_HOVER_MENU_PANEL_CLASS, className)}
    >
      {items.map((item, i) => {
        const toneClass =
          item.tone === 'danger'
            ? CHIP_HOVER_MENU_ITEM_TONE.danger
            : item.tone === 'accent'
              ? CHIP_HOVER_MENU_ITEM_TONE.accent
              : CHIP_HOVER_MENU_ITEM_TONE.default;
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
              CHIP_HOVER_MENU_ITEM_CLASS,
              itemPad === 'default' && 'gap-2 px-3',
              i > 0 ? CHIP_HOVER_MENU_ITEM_SEAM_CLASS : '',
              toneClass,
            )}
          >
            {item.icon ? (
              <span className={cn(CHIP_HOVER_MENU_ICON_CLASS, iconClass)}>{item.icon}</span>
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
  denseLabel = false,
  itemPad = 'default',
  placement = 'auto',
  align = 'start',
  avoidCollisions = true,
  onOpenChange,
}: {
  children: ReactNode;
  items: CopyChipHoverMenuItem[];
  menuLabel: string;
  className?: string;
  /**
   * Short verbs inherit button `uppercase tracking-widest` (OPEN / EDIT face) —
   * carton IdentityLinkChip parity. Default keeps sentence-case dashboard labels.
   */
  denseLabel?: boolean;
  itemPad?: 'default' | 'chip';
  /**
   * Side flyout for dense tables — prefer trailing (`auto`/`end`), flip leading.
   * Never default to below: that blocks vertical row travel in LedgerGrid.
   * Carton identity passes `bottom` + `avoidCollisions={false}`.
   */
  placement?: PortalSideMenuPlacement;
  /**
   * Side menus: vertical align vs the chip (`start` keeps OPEN/EDIT on the row).
   * `placement="bottom"`: horizontal align (`start` = trigger left, `end` = trigger right).
   */
  align?: PortalSideMenuAlign;
  /**
   * When false, a `bottom` menu stays under the trigger and does not flip to
   * left/right. Default true for LedgerGrid.
   */
  avoidCollisions?: boolean;
  /** Fires when the dropdown opens (true) / closes (false) — lets a host row keep
   *  its hover-expanded chrome (chevron + shifted chips) while the menu is up. */
  onOpenChange?: (open: boolean) => void;
}) {
  const enabled = items.length > 0;
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const placementRef = useRef(placement);
  placementRef.current = placement;
  const alignRef = useRef(align);
  alignRef.current = align;
  const avoidCollisionsRef = useRef(avoidCollisions);
  avoidCollisionsRef.current = avoidCollisions;

  // Trigger rect captured on open; the menu is positioned off-screen+hidden
  // first so we can measure it, then clamped into view in the layout effect.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  /**
   * Timing + eviction come from {@link useHoverSurface} — the ONE hover engine
   * (0ms open, 150ms close, one surface open anywhere). This component keeps
   * only what is genuinely its own: capturing the trigger rect and clamping the
   * portal into view. It owns no timers.
   */
  const hover = useHoverSurface({ disabled: !enabled });

  const open = useCallback(() => {
    if (!enabled) return;
    hover.open();
    const r = readTrustedTriggerRect(triggerRef.current);
    if (r) {
      setAnchor(r);
      setPos(null);
    }
  }, [enabled, hover]);

  const close = useCallback(() => {
    hover.close();
    setAnchor(null);
    setPos(null);
  }, [hover]);

  const scheduleClose = hover.scheduleClose;

  // Evicted by another hover surface (a rail peek, a classify menu) — drop the
  // rect so the portal unmounts. Without this the registry would say "closed"
  // while this menu stayed painted.
  useEffect(() => {
    if (!hover.isOpen && anchor) {
      setAnchor(null);
      setPos(null);
    }
  }, [hover.isOpen, anchor]);

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
    const next = clampPortalSideMenuPosition({
      anchor,
      bubble: b,
      gap:
        placementRef.current === 'bottom' ? PORTAL_BELOW_MENU_GAP : PORTAL_SIDE_MENU_GAP,
      placement: placementRef.current,
      align: alignRef.current,
      avoidCollisions: avoidCollisionsRef.current,
    });
    // Keep hidden (pos null) when clamp rejects — never paint at ~(MARGIN,MARGIN)
    // from a bad/stale anchor.
    setPos(next ? { top: next.top, left: next.left } : null);
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


  const menu =
    anchor && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? 'visible' : 'hidden',
              zIndex: zIndex.panelPopover,
            }}
            // No appear transition. The bench reads the panel the instant it
            // exists; a 100ms fade is latency between the reach and the answer,
            // and it made this menu behave differently from every other hover
            // surface on the same row.
            onClick={(e) => e.stopPropagation()}
            {...hover.surfaceProps}
          >
            <CopyChipHoverMenuPanel
              items={items}
              menuLabel={menuLabel}
              denseLabel={denseLabel}
              itemPad={itemPad}
              onItemSelect={() => close()}
            />
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
