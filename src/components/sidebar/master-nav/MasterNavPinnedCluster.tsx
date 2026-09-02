'use client';

/**
 * MasterNav Pinned cluster — drop target + reorderable pin rows.
 * Catalog map rows are not sortable; they drag *into* this list.
 *
 * No disclosure. Pin rows are always listed. “Pinned” is a standing
 * sentence-case title; pin-this-page and the per-row X share one trail slot.
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
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { spineAccentFor } from '@/lib/nav/spine-section-accent';
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
  SPINE_LABEL_CLASS,
  SPINE_PINNED_CLUSTER_CLASS,
  SPINE_PINNED_CLUSTER_HOVER_CLASS,
  SPINE_PINNED_ROW_ACTION_CLASS,
  SPINE_PINNED_TITLE_CLASS,
  SPINE_PINNED_TITLE_ROW_CLASS,
  SPINE_PINNED_TRAIL_CLASS,
  SPINE_PINNED_TRAIL_GLYPH_CLASS,
  SPINE_ROW_FACE_CLASS,
  SPINE_ROW_ICON_CLASS,
  SPINE_ROW_SHELL_CLASS,
} from '@/components/sidebar/sidebar-spine';
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
  const accent = spineAccentFor(null);
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
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn('relative', isDragging && 'z-10 opacity-80')}
    >
      <div
        className={cn(
          'relative',
          SPINE_ROW_SHELL_CLASS,
          SPINE_ROW_FACE_CLASS,
          active ? accent.activePage : accent.idlePage,
          isDragging && 'cursor-grabbing ring-1 ring-inset ring-border-soft',
        )}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={onNavigate}
          aria-label={hint ? `Go to ${label} (${hint})` : `Go to ${label}`}
          aria-current={active ? 'page' : undefined}
          className="ds-raw-button flex min-w-0 flex-1 items-center gap-2 text-left touch-none"
        >
          <RowIcon
            className={navIconStrokeClass(
              cn(
                SPINE_ROW_ICON_CLASS,
                active ? accent.activePageIcon : accent.idlePageIcon,
              ),
            )}
          />
          <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)} title={label}>
            {label}
          </span>
        </button>
        <IconButton
          size="xs"
          tone="neutral"
          ariaLabel={`Unpin ${label}`}
          className={cn(SPINE_PINNED_TRAIL_CLASS, SPINE_PINNED_ROW_ACTION_CLASS)}
          icon={<X className={SPINE_PINNED_TRAIL_GLYPH_CLASS} />}
          onClick={(e) => {
            e.stopPropagation();
            onUnpin();
          }}
        />
      </div>
    </div>
  );
}

export function MasterNavPinnedCluster({ pinIds }: { pinIds: readonly string[] }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { settings, pinAt, unpin, isHrefPinned } = useQuickAccess();
  const { setNodeRef, isOver } = useDroppable({ id: MASTER_NAV_PIN_DROP_ID });
  const currentHref = resolveQuickAccessHref(pathname, searchParams);
  const canPinCurrent =
    Boolean(currentHref) &&
    !isStructuralSpinePinHref(currentHref) &&
    !isHrefPinned(currentHref);
  const pinned = settings.pinned;

  const handlePinCurrent = useCallback(() => {
    if (!currentHref || isStructuralSpinePinHref(currentHref)) return;
    pinAt({
      label: resolveQuickAccessLabelFromLocation(
        pathname,
        searchParams,
        user?.organizationName,
      ),
      href: currentHref,
      iconKey: getMasterNavItem(getSidebarNavPageId(pathname, searchParams))?.id,
    });
  }, [currentHref, pathname, searchParams, pinAt, user?.organizationName]);

  return (
    <div
      ref={setNodeRef}
      id="spine-section-pinned"
      role="group"
      aria-label="Pinned"
      className={cn(SPINE_PINNED_CLUSTER_CLASS, isOver && 'bg-surface-hover')}
    >
      <div className={SPINE_PINNED_TITLE_ROW_CLASS}>
        <span className={cn('min-w-0 flex-1 truncate', SPINE_PINNED_TITLE_CLASS)}>
          Pinned
        </span>
        {canPinCurrent ? (
          <HoverTooltip label="Pin this page" asChild>
            <IconButton
              size="xs"
              tone="neutral"
              ariaLabel="Pin this page"
              className={cn(SPINE_PINNED_TRAIL_CLASS, SPINE_PINNED_CLUSTER_HOVER_CLASS)}
              icon={<Pin className={SPINE_PINNED_TRAIL_GLYPH_CLASS} />}
              onClick={handlePinCurrent}
            />
          </HoverTooltip>
        ) : null}
      </div>
      <div id="spine-pinned-rows">
        <SortableContext
          items={pinIds.map((id) => pinRowDragId(id))}
          strategy={verticalListSortingStrategy}
        >
          {pinned.length === 0 ? (
            <p
              className={cn(
                'px-2 py-1.5 text-role-micro text-text-faint',
                SPINE_PINNED_CLUSTER_HOVER_CLASS,
              )}
            >
              Drag a page here, or pin this page.
            </p>
          ) : (
            pinned.map((p, index) => (
              <SortablePinRow
                key={p.id}
                pin={p}
                slot={index + 1}
                active={p.href === currentHref}
                onNavigate={() => {
                  router.push(p.href);
                }}
                onUnpin={() => unpin(p.id)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
