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
 * {@link CopyChipHoverMenuPanel} is a thin ADAPTER over the one row renderer
 * ({@link ChipHoverMenuPanel}) — it maps this module's item shape onto the
 * shared rows and picks the roomier LedgerGrid pad. It used to re-implement the
 * rows, which meant the grid flyout and the carton bar drew the same anatomy
 * from two places. Hosts that already own hover (e.g. the photo launcher
 * toolbar) still compose it in place.
 */

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

/**
 * Adapter: this module's item shape → the shared row renderer.
 *
 * `denseLabel` (carton chips / photo toolbar) drops the dashboard's semibold
 * label emphasis so a row reads as the chip face that opened it. It does NOT
 * shout — the `uppercase tracking-widest` this flag once carried is banned on
 * chip menus (`carton-chrome-type-unity.guard.test.ts`): pick "Medium" off a
 * menu and it becomes a pill, so the word must not change voice on the way.
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
  const { mounted, triggerRef, bridge, activate, release } = useDeferredHoverMount<
    HTMLDivElement,
    ChipMenuHandle
  >();

  return (
    <div
      ref={triggerRef}
      className={cn('group relative inline-flex shrink-0 items-center', className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
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

/**
 * The menu machinery — hover registry, trigger rect, portal clamp, scroll and
 * resize teardown. ~25 hooks and a module-scope registry subscription, none of
 * which can paint before a pointer arrives, so it mounts on the first hover
 * (carrying that hover in) and stays mounted.
 *
 * The subscription is the reason this split is worth more than its hook count:
 * every mounted `useHoverSurface` re-renders when ANY surface opens anywhere.
 * At 62 order rows that was 62 re-renders per hover; now it is one per row the
 * operator has actually reached for.
 */
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
}) {
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
  }, [enabled, hover, triggerRef]);

  const close = useCallback(() => {
    hover.close();
    setAnchor(null);
    setPos(null);
  }, [hover]);

  const scheduleClose = hover.scheduleClose;

  // Publish the handle, then act on the hover that mounted us — the first reach
  // must open the menu, not merely pay for it. `readIntent` is non-destructive;
  // the trigger's `release` is what clears it, so a StrictMode remount
  // re-applies rather than swallows it.
  useDeferredHoverEngine(bridge, { open, scheduleClose }, (_intent, h) => h.open());

  // Evicted by another hover surface (a rail peek, a classify menu) — drop the
  // rect so the portal unmounts. Without this the registry would say "closed"
  // while this menu stayed painted.
  //
  // `isActive()` (the registry) rather than `isOpen` alone (React state).
  // `isOpen` lags the registry by a commit, and the mount effect above now opens
  // from a layout effect rather than from a pointer handler — so whether this
  // watcher ever observes the window where the registry says "ours" and `isOpen`
  // still says "no" depends on when React flushes the passive effect that
  // subscribes. Today's React flushes it first and the window never opens; this
  // guard is what keeps that an implementation detail instead of the reason the
  // first hover closes itself. Eviction by another surface is pinned in
  // `deferred-hover-activation.test.ts`.
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
  );
}
