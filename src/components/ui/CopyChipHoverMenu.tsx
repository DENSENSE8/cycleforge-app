'use client';

/** Hover-beside-chip secondary action menu — SoT for dense table identity chips and (via thin adapters) unbox carton chips. */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/_cn';
import {
  useDeferredHoverEngine,
  useDeferredHoverMount,
  type DeferredHoverBridge,
} from '@/components/ui/deferred-hover-mount';
import { zIndex } from '@/design-system/tokens/z-index';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { ChipHoverMenuPanel } from '@/components/ui/ChipHoverMenuSurface';
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

/** Adapter: this module's item shape → the shared row renderer. */
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
    <ChipHoverMenuPanel
      menuLabel={menuLabel}
      className={className}
      data-testid={dataTestId}
      itemPad={itemPad === 'chip' ? 'chip' : 'roomy'}
      emphasizeLabel={!denseLabel}
      rows={items.map((item) => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
        tone: item.tone,
        disabled: item.disabled,
        onSelect: () => {
          item.onSelect();
          onItemSelect?.(item);
        },
      }))}
    />
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
  gap,
  onActivate,
  activateLabel,
}: {
  children: ReactNode;
  items: CopyChipHoverMenuItem[];
  menuLabel: string;
  className?: string;
  /** Drop the dashboard's semibold label emphasis — carton chip-face parity. */
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
   * Vertical menus (`top` / `bottom`): horizontal align (`start` = trigger left, `end` = trigger right).
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
  /** Space between the face and the menu, px — `0` sits the menu flush against the face. Default: the house side / below gap. */
  gap?: number;
  /**
   * The face itself is a control: a click (or ↵ / Space when focused) runs this
   * — e.g. copy the order id — and the menu of the other actions opens beside
   * it. Absent, the face is plain and only hover opens the menu.
   */
  onActivate?: () => void;
  /** Accessible name of the face while `onActivate` is set ("Copy CF-1"). */
  activateLabel?: string;
}) {
  const enabled = items.length > 0;
  const { mounted, triggerRef, bridge, activate, release } = useDeferredHoverMount<
    HTMLDivElement,
    ChipMenuHandle
  >();

  const run = () => {
    onActivate?.();
    if (enabled) activate('focus', (h) => h.open());
  };
  return (
    <div
      ref={triggerRef}
      className={cn('group relative inline-flex shrink-0 items-center', onActivate && cn('cursor-copy', focusRing('control')), className)}
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      aria-label={onActivate ? activateLabel : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (onActivate) run();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (onActivate && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          run();
        }
      }}
      onMouseEnter={() => {
        if (!enabled) return;
        activate('hover', (h) => h.open());
      }}
      onMouseLeave={() => release((h) => h.scheduleClose())}
    >
      {children}
      {mounted ? (
        <ChipMenuPortal
          bridge={bridge}
          triggerRef={triggerRef}
          enabled={enabled}
          items={items}
          menuLabel={menuLabel}
          denseLabel={denseLabel}
          itemPad={itemPad}
          placement={placement}
          align={align}
          avoidCollisions={avoidCollisions}
          onOpenChange={onOpenChange}
          gap={gap}
        />
      ) : null}
    </div>
  );
}

/** What the trigger shell may ask of a mounted menu. */
type ChipMenuHandle = {
  open: () => void;
  scheduleClose: () => void;
};

/** The menu machinery — hover registry, trigger rect, portal clamp, scroll and resize teardown. */
function ChipMenuPortal({
  bridge,
  triggerRef,
  enabled,
  items,
  menuLabel,
  denseLabel,
  itemPad,
  placement,
  align,
  avoidCollisions,
  onOpenChange,
  gap,
}: {
  bridge: DeferredHoverBridge<ChipMenuHandle>;
  triggerRef: MutableRefObject<HTMLDivElement | null>;
  enabled: boolean;
  items: CopyChipHoverMenuItem[];
  menuLabel: string;
  denseLabel: boolean;
  itemPad: 'default' | 'chip';
  placement: PortalSideMenuPlacement;
  align: PortalSideMenuAlign;
  avoidCollisions: boolean;
  onOpenChange?: (open: boolean) => void;
  gap?: number;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const placementRef = useRef(placement);
  placementRef.current = placement;
  const alignRef = useRef(align);
  alignRef.current = align;
  const avoidCollisionsRef = useRef(avoidCollisions);
  avoidCollisionsRef.current = avoidCollisions;
  const gapRef = useRef(gap);
  gapRef.current = gap;

  // Trigger rect captured on open; the menu is positioned off-screen+hidden
  // first so we can measure it, then clamped into view in the layout effect.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  /** Timing + eviction come from {@link useHoverSurface} — the ONE hover engine (0ms open, 150ms close, one surface open anywhere). */
  const hover = useHoverSurface({ disabled: !enabled });

  const open = useCallback(() => {
    if (!enabled) return;
    hover.open();
    const r = readTrustedTriggerRect(triggerRef.current);
    if (r) {
      setAnchor(r);
      setPos(null);
    }
  }, [enabled, hover, triggerRef]);

  const close = useCallback(() => {
    hover.close();
    setAnchor(null);
    setPos(null);
  }, [hover]);

  const scheduleClose = hover.scheduleClose;

  // Publish the handle, then act on the hover that mounted us — the first reach must open the menu, not merely pay for it.
  useDeferredHoverEngine(bridge, { open, scheduleClose }, (_intent, h) => h.open());

  // Evicted by another hover surface (a rail peek, a classify menu) — drop the rect so the portal unmounts.
  const isRegistryActive = hover.isActive;
  useEffect(() => {
    if (anchor && !hover.isOpen && !isRegistryActive()) {
      setAnchor(null);
      setPos(null);
    }
  }, [hover.isOpen, isRegistryActive, anchor]);

  // Notify the host on open/close transitions (keyed on the boolean, not the rect).
  // The mount pass is skipped: this component now mounts on the hover that
  // opens it, so firing `false` first would report a close that never happened.
  const isOpen = anchor != null;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current === isOpen) return;
    wasOpenRef.current = isOpen;
    onOpenChangeRef.current?.(isOpen);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return;
    const b = menuRef.current.getBoundingClientRect();
    const next = clampPortalSideMenuPosition({
      anchor,
      bubble: b,
      gap:
        gapRef.current ??
        (placementRef.current === 'bottom' || placementRef.current === 'top' ? PORTAL_BELOW_MENU_GAP : PORTAL_SIDE_MENU_GAP),
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

  if (!anchor || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        zIndex: zIndex.panelPopover,
      }}
      // No appear transition.
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
  );
}
