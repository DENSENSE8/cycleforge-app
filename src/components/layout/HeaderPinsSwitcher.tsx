'use client';

/** Header pin stations — GlobalHeader SoT for Quick Access pins. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  AnchoredLayer,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  IconButton,
} from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { KeyboardChord } from '@/design-system/primitives/KeyboardKey';
import { ExternalLink, GripVertical, Pencil, Pin, Star, X } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import {
  MAX_PIN_HOTKEY_SLOTS,
  type PinnedPage,
} from '@/lib/quick-access/types';
import {
  pinHotkeyLabel,
  pinSlotFromKeyboardEvent,
} from '@/lib/quick-access/pin-hotkeys';
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
  HeaderChromeMenu,
  HeaderChromeMenuEmpty,
  HeaderChromeMenuItem,
} from './header-chrome-menu';
import {
  HEADER_CONTROL_CORNER,
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
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
        label={pin.label}
        active={active}
        onClick={onNavigate}
        leading={
          <span
            className="inline-flex shrink-0 cursor-grab touch-none text-text-faint active:cursor-grabbing"
            aria-label={`Reorder ${pin.label}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden />
          </span>
        }
        trailing={
          <span className="flex shrink-0 items-center gap-1">
            {hotkey ? <KeyboardChord chord={hotkey} size="xs" tone="default" /> : null}
            <IconButton
              type="button"
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onUnpin();
              }}
              ariaLabel={`Unpin ${pin.label}`}
              className="text-text-faint hover:text-rose-600"
              icon={<X className="h-3.5 w-3.5" />}
            />
          </span>
        }
      />
    </div>
  );
}

function HeaderPinChip({
  pin,
  active,
  onNavigate,
  onRename,
  onUnpin,
}: {
  pin: PinnedPage;
  active: boolean;
  onNavigate: () => void;
  onRename: () => void;
  onUnpin: () => void;
}) {
  const Icon = resolvePinIcon(pin);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          aria-current={active ? 'page' : undefined}
          aria-label={`Open pinned page ${pin.label}`}
          onClick={onNavigate}
          className={cn(
            // A 32px rounded key on the beam, like the icon keys beside it
            // (owner 2026-09-27: triage corners and a pressable face; this
            // supersedes the 2026-09-22 full-band-height underline tab).
            'hidden h-8 max-w-[10rem] min-w-0 items-center gap-1.5 px-2 text-left text-role-caption font-medium transition-colors active:translate-y-px xl:flex',
            HEADER_CONTROL_CORNER,
            active
              ? 'bg-surface-sunken text-text-default ring-1 ring-inset ring-border-hairline'
              : 'text-text-muted hover:bg-surface-sunken hover:text-text-default',
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate" title={pin.label}>{pin.label}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onNavigate}>
          <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open page
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => window.open(pin.href, '_blank', 'noopener,noreferrer')}>
          <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open in new tab
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onRename}>
          <Pencil className="mr-2 h-3.5 w-3.5" /> Rename pin
        </ContextMenuItem>
        <ContextMenuItem tone="danger" onSelect={onUnpin}>
          <X className="mr-2 h-3.5 w-3.5" /> Remove bookmark
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
  const { settings, pin, unpin, rename, reorder, isHrefPinned } = useQuickAccess();
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
      iconKey: getSidebarRouteKey(pathname),
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

  // ⌘/Ctrl+1–9 — order owns the slot. Hooks above any early return so the
  // chord stays live whenever GlobalHeader mounts this switcher.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const slot = pinSlotFromKeyboardEvent(e);
      if (slot == null) return;
      const target = settings.pinned[slot - 1];
      if (!target) return;
      e.preventDefault();
      router.push(target.href);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router, settings.pinned]);

  const showGroup = canPin || pinned.length > 0;
  if (!showGroup) return null;

  const tipSlots = Math.min(pinned.length, MAX_PIN_HOTKEY_SLOTS);
  const tipLabel =
    tipSlots > 0
      ? `Pins (${pinHotkeyLabel(1)}–${pinHotkeyLabel(tipSlots)})`
      : 'Pins';

  return (
    <div ref={wrapRef} className="flex h-full min-w-0 shrink-0 items-center">
      {/*
 * The Pin CONTROL leads the group (operator 2026-09-16:
 * The Pin CONTROL leads the group (operator 2026-09-16: "the pinned icon
 */}
      <div className={HEADER_ICON_WRAP}>
        <HoverTooltip label={tipLabel} asChild>
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
      </div>
      <div className="flex h-full min-w-0 items-center gap-0.5">
        {pinned.slice(0, 5).map((p) => (
          <HeaderPinChip
            key={p.id}
            pin={p}
            active={p.href === currentHref}
            onNavigate={() => router.push(p.href)}
            onRename={() => {
              const next = window.prompt('Rename pinned page', p.label)?.trim();
              if (next) rename(p.id, next);
            }}
            onUnpin={() => unpin(p.id)}
          />
        ))}
      </div>

      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={wrapRef}
        placement="bottom-start"
        gap={4}
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
      </AnchoredLayer>
    </div>
  );
}
