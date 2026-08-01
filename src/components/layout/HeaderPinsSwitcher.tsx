'use client';

/**
 * Header pin stations — GlobalHeader SoT for Quick Access pins.
 * Layout: hairline after Recents → Pin-current → sortable icon strip → overflow.
 * Data = {@link useQuickAccess} / `cf.quickAccess`. Never remount a pin list in
 * the avatar Quick Access popover.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AnchoredLayer,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  IconButton,
} from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { MoreHorizontal, Pin, Star, X } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import {
  MAX_HEADER_PIN_ICONS,
  type PinnedPage,
} from '@/lib/quick-access/types';
import {
  resolveQuickAccessHref,
  resolveQuickAccessLabelFromLocation,
} from '@/lib/quick-access/page-label';
import {
  APP_SIDEBAR_NAV,
  getSidebarPageNav,
  getSidebarRouteKey,
  type SidebarIconComponent,
} from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import {
  HEADER_CLUSTER_HAIRLINE,
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_CLUSTER,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_GLYPH,
} from './header-shell';

function resolvePinIcon(pin: PinnedPage): SidebarIconComponent {
  let key = pin.iconKey;
  if (!key) {
    try {
      key = getSidebarRouteKey(new URL(pin.href, 'http://local').pathname);
    } catch {
      key = undefined;
    }
  }
  if (key && key !== 'unknown') {
    const fromPage = getSidebarPageNav(key)?.icon;
    if (fromPage) return fromPage;
    const fromNav = APP_SIDEBAR_NAV.find((item) => item.id === key)?.icon;
    if (fromNav) return fromNav;
  }
  return Star;
}

function HeaderPinIcon({
  pin,
  active,
  onNavigate,
  onUnpin,
}: {
  pin: PinnedPage;
  active: boolean;
  onNavigate: () => void;
  onUnpin: () => void;
}) {
  const Icon = resolvePinIcon(pin);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pin.id,
  });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={{
            transform: CSS.Transform.toString(transform),
            transition,
          }}
          className={cn(
            'group relative',
            HEADER_ICON_WRAP,
            isDragging && 'opacity-80',
          )}
        >
          <HoverTooltip label={pin.label} asChild>
            <IconButton
              size="md"
              ariaLabel={pin.label}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                HEADER_ICON_BTN_CLASS,
                active && HEADER_ICON_BTN_OPEN_CLASS,
                isDragging && 'cursor-grabbing',
              )}
              icon={<Icon className={TOP_CHROME_ICON_GLYPH} />}
              {...attributes}
              {...listeners}
            />
          </HoverTooltip>
          <HoverTooltip label="Unpin" asChild focusable={false}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUnpin();
              }}
              aria-label={`Unpin ${pin.label}`}
              className={cn(
                'ds-raw-button ds-allow-control-size absolute -right-0.5 -top-0.5 inline-flex h-4 w-4',
                'items-center justify-center rounded-full border border-border-soft bg-surface-card',
                'text-text-faint shadow-sm',
                'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                'hover:bg-rose-50 hover:text-rose-600',
              )}
            >
              <X className="h-2.5 w-2.5" aria-hidden />
            </button>
          </HoverTooltip>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem tone="danger" onSelect={onUnpin}>
          Unpin
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function HeaderPinsSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { settings, pin, unpin, reorder, isHrefPinned } = useQuickAccess();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  const currentHref = resolveQuickAccessHref(pathname, searchParams);
  const canPin = Boolean(currentHref) && !isHrefPinned(currentHref);
  const pinned = settings.pinned;

  const strip = useMemo(() => pinned.slice(0, MAX_HEADER_PIN_ICONS), [pinned]);
  const overflow = useMemo(() => pinned.slice(MAX_HEADER_PIN_ICONS), [pinned]);
  const stripIds = useMemo(() => strip.map((p) => p.id), [strip]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handlePinCurrent = useCallback(() => {
    if (!currentHref) return;
    const label = resolveQuickAccessLabelFromLocation(
      pathname,
      searchParams,
      user?.organizationName,
    );
    pin({
      label,
      href: currentHref,
      iconKey: getSidebarRouteKey(pathname),
    });
  }, [currentHref, pathname, searchParams, user?.organizationName, pin]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = stripIds.indexOf(String(active.id));
      const newIndex = stripIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const nextStrip = arrayMove(strip, oldIndex, newIndex);
      reorder([...nextStrip, ...overflow].map((p) => p.id));
    },
    [strip, stripIds, overflow, reorder],
  );

  const showGroup = canPin || pinned.length > 0;
  if (!showGroup) return null;

  return (
    <div className={cn(HEADER_ICON_CLUSTER, 'min-w-0')}>
      <div className={HEADER_CLUSTER_HAIRLINE} aria-hidden />

      {canPin ? (
        <div className={HEADER_ICON_WRAP}>
          <HoverTooltip label="Pin page" asChild>
            <IconButton
              size="md"
              ariaLabel="Pin page"
              onClick={handlePinCurrent}
              className={HEADER_ICON_BTN_CLASS}
              icon={<Pin className={TOP_CHROME_ICON_GLYPH} />}
            />
          </HoverTooltip>
        </div>
      ) : null}

      {strip.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stripIds} strategy={horizontalListSortingStrategy}>
            <div className={HEADER_ICON_CLUSTER}>
              {strip.map((p) => (
                <HeaderPinIcon
                  key={p.id}
                  pin={p}
                  active={p.href === currentHref}
                  onNavigate={() => router.push(p.href)}
                  onUnpin={() => unpin(p.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}

      {overflow.length > 0 ? (
        <div ref={overflowRef} className={HEADER_ICON_WRAP}>
          <HoverTooltip label="More pins" asChild>
            <IconButton
              size="md"
              ariaLabel={`More pins (${overflow.length})`}
              aria-expanded={overflowOpen}
              aria-haspopup="menu"
              onClick={() => setOverflowOpen((o) => !o)}
              className={cn(HEADER_ICON_BTN_CLASS, overflowOpen && HEADER_ICON_BTN_OPEN_CLASS)}
              icon={<MoreHorizontal className={TOP_CHROME_ICON_GLYPH} />}
            />
          </HoverTooltip>
          <AnchoredLayer
            open={overflowOpen}
            onClose={() => setOverflowOpen(false)}
            anchorRef={overflowRef}
            placement="bottom-start"
            gap={8}
          >
            <div
              role="menu"
              aria-label="More pinned pages"
              className="min-w-[12rem] overflow-hidden rounded-xl border border-border-soft bg-surface-card p-1 shadow-[0_12px_40px_rgba(20,30,55,0.16)]"
            >
              {overflow.map((p) => {
                const Icon = resolvePinIcon(p);
                const active = p.href === currentHref;
                return (
                  <div
                    key={p.id}
                    className="group flex items-center gap-0.5 rounded-lg hover:bg-surface-sunken"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        setOverflowOpen(false);
                        router.push(p.href);
                      }}
                      className={cn(
                        'ds-raw-button flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-role-eyebrow text-text-default',
                        active && 'font-semibold',
                      )}
                    >
                      <Icon className={cn(TOP_CHROME_ICON_GLYPH, 'shrink-0 text-text-muted')} />
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.label}</span>
                    </button>
                    <IconButton
                      type="button"
                      size="xs"
                      onClick={() => unpin(p.id)}
                      ariaLabel={`Unpin ${p.label}`}
                      className="mr-1 shrink-0 text-text-faint opacity-0 group-hover:opacity-100 hover:text-rose-600"
                      icon={<X className="h-3.5 w-3.5" />}
                    />
                  </div>
                );
              })}
            </div>
          </AnchoredLayer>
        </div>
      ) : null}
    </div>
  );
}
