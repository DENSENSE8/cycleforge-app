'use client';

/**
 * MasterNav Pinned cluster — drop target + reorderable pin rows.
 * Catalog map rows are not sortable; they drag *into* this list.
 *
 * No disclosure. Pin rows are always listed. “Pinned” is a standing
 * SidebarGroupLabel; pin-this-page and the per-row X share one trail slot.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
  MASTER_NAV_PIN_EDGE_BOTTOM,
  MASTER_NAV_PIN_EDGE_TOP,
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

/**
 * A drop strip at one end of the shelf. Paints an insertion line while the
 * pointer is over it, so the landing slot is visible before release.
 */
function PinEdgeDropStrip({ id, label }: { id: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <li
      ref={setNodeRef}
      aria-label={label}
      data-spine-pin-edge
      className="relative -my-1 h-2 list-none"
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-2 top-1/2 h-px -translate-y-1/2 transition-colors',
          isOver ? 'bg-text-default' : 'bg-transparent',
        )}
      />
    </li>
  );
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
      {/* The chord is carried in the tooltip, not painted on the row. The
          shortcut-display cohort refuses standing keycaps, and the spine has no
          CTA strip to paint a HotkeyGlyph on — a tooltip is the one channel
          that law leaves open for teaching ⌘1–9. */}
      <HoverTooltip label={hint ? `${label} · ${hint}` : label} asChild>
        <SidebarMenuButton
          // `listeners` only — see the note in SidebarNavList: dnd-kit's
          // `attributes` announce a space-bar pickup that no longer exists.
          {...listeners}
          isActive={active}
          onClick={onNavigate}
          aria-label={hint ? `Go to ${label} (${hint})` : `Go to ${label}`}
          aria-current={active ? 'page' : undefined}
          className="touch-none"
        >
          <RowIcon className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
          <span>{label}</span>
        </SidebarMenuButton>
      </HoverTooltip>
      <HoverTooltip label={`Unpin ${label}`} asChild>
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
      </HoverTooltip>
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

  /**
   * The last unpin, held so it can be taken back.
   *
   * Unpinning is one click on a control that only appears on hover, and the
   * shelf it edits is an arrangement the operator built by hand — the cheapest
   * misclick in the spine destroys the most deliberate state in it. The row
   * does not vanish silently: its slot is held open by an undo row until the
   * operator moves on. Inline, in the slot it came from — not a toast, and not
   * a second surface to look at.
   */
  const [undoable, setUndoable] = useState<{ pin: PinnedPage; index: number } | null>(
    null,
  );
  const undoTimer = useRef<number | null>(null);
  const forgetUndo = useCallback(() => {
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setUndoable(null);
  }, []);
  useEffect(() => () => {
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
  }, []);

  const handleUnpin = useCallback(
    (pin: PinnedPage, index: number) => {
      unpin(pin.id);
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
      setUndoable({ pin, index });
      undoTimer.current = window.setTimeout(() => {
        undoTimer.current = null;
        setUndoable(null);
      }, 12_000);
    },
    [unpin],
  );

  const handleUndo = useCallback(() => {
    if (!undoable) return;
    const { pin, index } = undoable;
    forgetUndo();
    pinAt({ href: pin.href, label: pin.label, iconKey: pin.iconKey }, index);
  }, [undoable, forgetUndo, pinAt]);
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
            {pinned.length > 0 ? (
              <PinEdgeDropStrip
                id={MASTER_NAV_PIN_EDGE_TOP}
                label="Move to the top of Pinned"
              />
            ) : null}
            {pinned.length === 0 ? (
              // NOT hover-gated. An empty state that only appears once you are
              // already hovering the thing you do not know exists teaches
              // nobody — it is the one row in this cluster that has to speak
              // first. (The per-row X and pin-this-page stay on hover: those
              // are actions on rows you can already see.)
              <p
                data-spine-pin-empty
                className="px-2 py-1.5 text-role-caption text-text-soft"
              >
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
                  onUnpin={() => handleUnpin(p, index)}
                />
              ))
            )}
            {pinned.length > 0 ? (
              <PinEdgeDropStrip
                id={MASTER_NAV_PIN_EDGE_BOTTOM}
                label="Move to the bottom of Pinned"
              />
            ) : null}
          </SortableContext>
          {undoable ? (
            <SidebarMenuItem data-spine-pin-undo>
              <div className="flex w-full items-center gap-2 px-2 py-1">
                <span className="min-w-0 flex-1 truncate text-role-caption text-text-soft">
                  Unpinned {displayQuickAccessLabel(undoable.pin.href, undoable.pin.label)}
                </span>
                <button
                  type="button"
                  onClick={handleUndo}
                  className="ds-raw-button shrink-0 text-role-caption font-medium text-text-default underline-offset-2 hover:underline"
                >
                  Undo
                </button>
              </div>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
