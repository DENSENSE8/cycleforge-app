'use client';

/**
 * Retired header pin menu. Staff pins paint on {@link MasterNavPinnedCluster}
 * in the MasterNav spine. Do not remount this in GlobalHeader.
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { GripVertical, Pin, Star, X } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import {
  MAX_PIN_HOTKEY_SLOTS,
  type PinnedPage,
} from '@/lib/quick-access/types';
import {
  pinHotkeyLabel,
} from '@/lib/quick-access/pin-hotkeys';
import {
  resolveQuickAccessHref,
  resolveQuickAccessLabelFromLocation,
  displayQuickAccessLabel,
  masterNavFaceForPinHref,
} from '@/lib/quick-access/page-label';
import {
  APP_SIDEBAR_NAV,
  getMasterNavItem,
  getSidebarNavPageId,
  getSidebarPageNav,
  type SidebarIconComponent,
} from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import {
  HeaderChromeMenu,
  HeaderChromeMenuEmpty,
  HeaderChromeMenuItem,
  HeaderChromeMenuLayer,
} from './header-chrome-menu';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from './header-shell';

function resolvePinIcon(pin: PinnedPage): SidebarIconComponent {
  const fromHref = masterNavFaceForPinHref(pin.href)?.icon;
  if (fromHref) return fromHref;
  if (pin.iconKey && pin.iconKey !== 'unknown') {
    const fromNav = getMasterNavItem(pin.iconKey)?.icon
      ?? getSidebarPageNav(pin.iconKey)?.icon
      ?? APP_SIDEBAR_NAV.find((item) => item.id === pin.iconKey)?.icon;
    if (fromNav) return fromNav;
  }
  return Star;
}

function SortablePinRow({
  pin,
  slot,
  active,
  onNavigate,
  onUnpin,
}: {
  pin: PinnedPage;
  slot: number;
  active: boolean;
  onNavigate: () => void;
  onUnpin: () => void;
}) {
  const Icon = resolvePinIcon(pin);
  const label = displayQuickAccessLabel(pin.href, pin.label);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pin.id });

  const hotkey = pinHotkeyLabel(slot);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn('relative', isDragging && 'opacity-80')}
    >
      <HeaderChromeMenuItem
        icon={<Icon />}
        label={label}
        active={active}
        onClick={onNavigate}
        leading={
          <span
            className="inline-flex shrink-0 cursor-grab touch-none text-text-faint active:cursor-grabbing"
            aria-label={`Reorder ${label}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden />
          </span>
        }
        trailing={
          <span className="flex shrink-0 items-center gap-1">
            {hotkey ? (
              <kbd className="rounded px-1 font-mono text-role-micro text-text-faint">
                {hotkey}
              </kbd>
            ) : null}
            <IconButton
              type="button"
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onUnpin();
              }}
              ariaLabel={`Unpin ${label}`}
              className="text-text-faint hover:text-rose-600"
              icon={<X className="h-3.5 w-3.5" />}
            />
          </span>
        }
      />
    </div>
  );
}

export function HeaderPinsSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { settings, pin, unpin, reorder, isHrefPinned } = useQuickAccess();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const currentHref = resolveQuickAccessHref(pathname, searchParams);
  const canPin = Boolean(currentHref) && !isHrefPinned(currentHref);
  const pinned = settings.pinned;
  const pinIds = useMemo(() => pinned.map((p) => p.id), [pinned]);

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
      iconKey: getMasterNavItem(getSidebarNavPageId(pathname, searchParams))?.id,
    });
  }, [currentHref, pathname, searchParams, user?.organizationName, pin]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = pinIds.indexOf(String(active.id));
      const newIndex = pinIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      reorder(arrayMove(pinned, oldIndex, newIndex).map((p) => p.id));
    },
    [pinIds, pinned, reorder],
  );

  const showGroup = canPin || pinned.length > 0;
  if (!showGroup) return null;

  const tipSlots = Math.min(pinned.length, MAX_PIN_HOTKEY_SLOTS);
  const tipLabel =
    tipSlots > 0
      ? `Pins (${pinHotkeyLabel(1)}–${pinHotkeyLabel(tipSlots)})`
      : 'Pins';

  return (
    <div ref={wrapRef} className={HEADER_ICON_WRAP}>
      <HoverTooltip label={tipLabel} disabled={open} asChild>
        <IconButton
          size="md"
          ariaLabel="Pins"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((o) => !o)}
          className={cn(HEADER_ICON_BTN_CLASS, open && HEADER_ICON_BTN_OPEN_CLASS)}
          icon={<Pin className={TOP_CHROME_ICON_FACE} />}
        />
      </HoverTooltip>

      <HeaderChromeMenuLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={wrapRef}
        placement="bottom-start"
      >
        <HeaderChromeMenu ariaLabel="Pinned pages" className="min-w-[14rem]">
          {canPin ? (
            <HeaderChromeMenuItem
              icon={<Pin />}
              label="Pin this page"
              onClick={handlePinCurrent}
            />
          ) : null}

          {pinned.length === 0 ? (
            <HeaderChromeMenuEmpty>No pins yet</HeaderChromeMenuEmpty>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={pinIds} strategy={verticalListSortingStrategy}>
                {pinned.map((p, index) => (
                  <SortablePinRow
                    key={p.id}
                    pin={p}
                    slot={index + 1}
                    active={p.href === currentHref}
                    onNavigate={() => {
                      setOpen(false);
                      router.push(p.href);
                    }}
                    onUnpin={() => unpin(p.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </HeaderChromeMenu>
      </HeaderChromeMenuLayer>
    </div>
  );
}
