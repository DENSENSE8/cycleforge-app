'use client';

/**
 * MasterNav Pinned cluster — drop target + reorderable pin rows.
 * Catalog map rows are not sortable; they drag *into* this list.
 *
 * No disclosure. Pin rows are always listed. “Pinned” is a standing
 * SidebarGroupLabel; pin-this-page and the per-row X share one trail slot.
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pin, X } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  MASTER_NAV_PIN_DROP_ID,
  isStructuralSpinePinHref,
  pinRowDragId,
} from '@/lib/quick-access/nav-pin';
import {
  pinHotkeyLabel,
} from '@/lib/quick-access/pin-hotkeys';
import {
  resolveQuickAccessHref,
  resolveQuickAccessLabelFromLocation,
  displayQuickAccessLabel,
  masterNavFaceForPinHref,
  pinMatchesLocation,
  resolveActivePinHref,
} from '@/lib/quick-access/page-label';
import type { PinnedPage } from '@/lib/quick-access/types';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import {
  APP_SIDEBAR_NAV,
  getMasterNavItem,
  getSidebarNavPageId,
  getSidebarPageNav,
  type SidebarIconComponent,
} from '@/lib/sidebar-navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  SPINE_PINNED_CLUSTER_CLASS,
  SPINE_PINNED_CLUSTER_HOVER_CLASS,
  SPINE_PINNED_ROW_ACTION_CLASS,
  SPINE_PINNED_TRAIL_GLYPH_CLASS,
  SPINE_ROW_ICON_CLASS,
  SPINE_SECTION_LABEL_STICKY_CLASS,
} from '@/components/sidebar/sidebar-spine';
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/utils/_cn';

function resolvePinIcon(pin: PinnedPage): SidebarIconComponent {
  const fromHref = masterNavFaceForPinHref(pin.href)?.icon;
  if (fromHref) return fromHref;
  if (pin.iconKey && pin.iconKey !== 'unknown') {
    const fromNav = getMasterNavItem(pin.iconKey)?.icon
      ?? getSidebarPageNav(pin.iconKey)?.icon
      ?? APP_SIDEBAR_NAV.find((item) => item.id === pin.iconKey)?.icon;
    if (fromNav) return fromNav;
  }
  return Pin;
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
  const RowIcon = resolvePinIcon(pin);
  const label = displayQuickAccessLabel(pin.href, pin.label);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: pinRowDragId(pin.id),
    data: { type: 'pin', id: pin.id },
  });
  const hint = pinHotkeyLabel(slot);

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={{
        // Siblings shift to open the slot; the dragged row itself stays put and
        // dims, because the portalled <DragOverlay> is what follows the pointer
        // (a transform here would be clipped by the scrollport).
        transform: isDragging ? undefined : CSS.Transform.toString(transform),
        transition,
      }}
      className={cn('relative', isDragging && 'opacity-40')}
    >
      <SidebarMenuButton
        {...attributes}
        {...listeners}
        isActive={active}
        onClick={onNavigate}
        aria-label={hint ? `Go to ${label} (${hint})` : `Go to ${label}`}
        aria-current={active ? 'page' : undefined}
        className="touch-none"
      >
        <RowIcon className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
        <span title={label}>{label}</span>
      </SidebarMenuButton>
      <SidebarMenuAction
        showOnHover
        aria-label={`Unpin ${label}`}
        className={SPINE_PINNED_ROW_ACTION_CLASS}
        onClick={(e) => {
          e.stopPropagation();
          onUnpin();
        }}
      >
        <X className={SPINE_PINNED_TRAIL_GLYPH_CLASS} />
      </SidebarMenuAction>
    </SidebarMenuItem>
  );
}

export function MasterNavPinnedCluster({
  pinIds,
}: {
  pinIds: readonly string[];
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { settings, pinAt, unpin } = useQuickAccess();
  const { setNodeRef, isOver } = useDroppable({ id: MASTER_NAV_PIN_DROP_ID });
  const pinned = settings.pinned;
  const currentHref = resolveQuickAccessHref(pathname, searchParams);
  const locationPinned = pinned.some((p) =>
    pinMatchesLocation(p.href, pathname, searchParams),
  );
  const activePinHref = resolveActivePinHref(
    pinned,
    currentHref,
    pathname,
    searchParams,
  );
  const canPinCurrent =
    Boolean(currentHref) &&
    !isStructuralSpinePinHref(currentHref) &&
    !locationPinned;

  const handlePinCurrent = useCallback(() => {
    if (!currentHref || isStructuralSpinePinHref(currentHref)) return;
    const face = getMasterNavItem(getSidebarNavPageId(pathname, searchParams));
    pinAt({
      label: resolveQuickAccessLabelFromLocation(
        pathname,
        searchParams,
        user?.organizationName,
      ),
      href: face?.href ?? currentHref,
      iconKey: face?.id,
    });
  }, [currentHref, pathname, searchParams, pinAt, user?.organizationName]);

  return (
    <SidebarGroup
      ref={setNodeRef}
      id="spine-section-pinned"
      role="group"
      aria-label="Pinned"
      className={cn(SPINE_PINNED_CLUSTER_CLASS, isOver && 'bg-surface-hover')}
    >
      <SidebarGroupLabel className={SPINE_SECTION_LABEL_STICKY_CLASS}>
        Pinned
      </SidebarGroupLabel>
      {canPinCurrent ? (
        <HoverTooltip label="Pin this page" asChild>
          <SidebarGroupAction
            aria-label="Pin this page"
            className={SPINE_PINNED_CLUSTER_HOVER_CLASS}
            onClick={handlePinCurrent}
          >
            <Pin className={SPINE_PINNED_TRAIL_GLYPH_CLASS} />
          </SidebarGroupAction>
        </HoverTooltip>
      ) : null}
      <SidebarGroupContent id="spine-pinned-rows">
        <SidebarMenu>
          <SortableContext
            items={pinIds.map((id) => pinRowDragId(id))}
            strategy={verticalListSortingStrategy}
          >
            {pinned.length === 0 ? (
              // NOT hover-gated. An empty state that only appears once you are
              // already hovering the thing you do not know exists teaches
              // nobody — it is the one row in this cluster that has to speak
              // first. (The per-row X and pin-this-page stay on hover: those
              // are actions on rows you can already see.)
              <p className="px-2 py-1.5 text-role-caption text-text-soft">
                Drag any page here to pin it.
              </p>
            ) : (
              pinned.map((p, index) => (
                <SortablePinRow
                  key={p.id}
                  pin={p}
                  slot={index + 1}
                  active={p.href === activePinHref}
                  onNavigate={() => {
                    router.push(p.href);
                  }}
                  onUnpin={() => unpin(p.id)}
                />
              ))
            )}
          </SortableContext>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
