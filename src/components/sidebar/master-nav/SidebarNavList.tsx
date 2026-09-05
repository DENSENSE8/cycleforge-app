'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Pin } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  resolveSpineMapEntries,
  spineStructuralTopPages,
  SPINE_DESKS_SLOT_ID,
  SPINE_STATIONS_SLOT_ID,
} from '@/lib/nav/spine-slots';
import {
  DESK_GROUPS,
  SPINE_SECTIONS,
  applyChildTarget,
  isSpineDeskItem,
  spineSectionIdForPage,
  type SidebarIconComponent,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import {
  MASTER_NAV_PIN_DROP_ID,
  MASTER_NAV_PIN_RETURN_ID,
  isPinDropOverId,
  isStructuralSpinePinHref,
  navPinDragId,
  pinIndexFromOverId,
  type NavPinDragData,
} from '@/lib/quick-access/nav-pin';
import {
  displayQuickAccessLabel,
  masterNavFaceForPinHref,
  pagesNotPinned,
  pinsCoverPageId,
} from '@/lib/quick-access/page-label';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import {
  SPINE_ROW_DENSITY,
  SPINE_ROW_ICON_CLASS,
  SPINE_ROW_SHELL_CLASS,
} from '@/components/sidebar/sidebar-spine';
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/utils/_cn';
import { StaffAccountFooter } from './StaffAccountFooter';
import { MasterNavPinnedCluster } from './MasterNavPinnedCluster';

/**
 * MasterNav page list on the shadcn Sidebar. Catalog is not sortable.
 * Hold-drag a leaf onto Pinned. Stations / Desks / Operations Studio are
 * standing group labels — never list-replace drills.
 */
const pinCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const pinHits = pointerHits.filter((hit) => isPinDropOverId(String(hit.id)));
  if (pinHits.length > 0) return pinHits;
  if (pointerHits.length > 0) return pointerHits;
  return closestCenter(args);
};

interface SidebarNavListProps {
  activePage: SidebarPageNav;
  activeChildId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, childId?: string) => void;
  onRowHover?: (page: SidebarPageNav) => void;
  spineOrder: string[];
  className?: string;
}

function DraggableTitleRow({
  id,
  href,
  label,
  icon: RowIcon,
  active,
  ariaLabel,
  onActivate,
  onMouseEnter,
  draggable,
}: {
  id: string;
  href: string;
  label: string;
  icon: SidebarIconComponent;
  active: boolean;
  ariaLabel: string;
  onActivate: () => void;
  onMouseEnter?: () => void;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: navPinDragId(id),
    data: { type: 'nav', href, label, iconKey: id } satisfies NavPinDragData,
    disabled: !draggable,
  });

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      // No in-flow transform: the scrollport is a real `overflow-y-auto` box,
      // and a transformed child of one is CLIPPED at its edge — a row dragged
      // up toward Pinned would disappear on the way. The gesture is carried by
      // the portalled <DragOverlay> below; this row just dims in place.
      className={cn('relative', isDragging && 'opacity-40')}
    >
      <SidebarMenuButton
        {...(draggable ? { ...attributes, ...listeners } : {})}
        isActive={active}
        onClick={onActivate}
        onMouseEnter={onMouseEnter}
        aria-label={ariaLabel}
        aria-current={active ? 'page' : undefined}
        className={cn(draggable && 'touch-none', isDragging && 'cursor-grabbing')}
      >
        <RowIcon className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
        <span title={label}>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function SidebarNavList({
  activePage,
  activeChildId,
  otherPages,
  onNavigate,
  onRowHover,
  spineOrder,
  className,
}: SidebarNavListProps) {
  // Drop target for a pin dragged OUT of the cluster — see
  // MASTER_NAV_PIN_RETURN_ID. Scoped to the whole scrollport so the gesture
  // works dropping above the shelf (into the top rows) or below it (into the
  // map), which is where the row is about to reappear either way.
  const { setNodeRef: setPinReturnRef } = useDroppable({ id: MASTER_NAV_PIN_RETURN_ID });
  const { settings, pinAt, reorder, unpin } = useQuickAccess();
  const pinIds = useMemo(() => settings.pinned.map((p) => p.id), [settings.pinned]);
  const currentPinned = pinsCoverPageId(activePage.id, settings.pinned);
  const highlightedChildId = activeChildId ?? activePage.children?.[0]?.id ?? null;
  // Filtered like every other section: a pinned row moves onto the shelf, it
  // does not also stay here. Without this, pinning Media Library would render
  // it twice — the duplication the pin is supposed to REPLACE.
  const topPages = useMemo(
    () => pagesNotPinned(spineStructuralTopPages(otherPages), settings.pinned),
    [otherPages, settings.pinned],
  );
  const stationsSection = SPINE_SECTIONS.find((s) => s.id === 'floor');
  const desksGroup = DESK_GROUPS[0];
  const floorPages = useMemo(
    () =>
      pagesNotPinned(
        otherPages.filter((p) => spineSectionIdForPage(p) === 'floor'),
        settings.pinned,
      ),
    [otherPages, settings.pinned],
  );
  const deskPages = useMemo(
    () => pagesNotPinned(otherPages.filter((p) => isSpineDeskItem(p)), settings.pinned),
    [otherPages, settings.pinned],
  );

  const mapEntries = useMemo(
    () => resolveSpineMapEntries(spineOrder, otherPages),
    [spineOrder, otherPages],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * What the pointer carries while dragging. Resolved once on drag start so the
   * overlay never re-reads a list that is reordering underneath it.
   */
  const [dragFace, setDragFace] = useState<{
    label: string;
    icon: SidebarIconComponent;
  } | null>(null);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as
        | NavPinDragData
        | { type: 'pin'; id: string }
        | undefined;
      if (data?.type === 'nav') {
        setDragFace({
          label: data.label,
          icon: masterNavFaceForPinHref(data.href)?.icon ?? Pin,
        });
        return;
      }
      if (data?.type === 'pin') {
        const pin = settings.pinned.find((p) => p.id === data.id);
        if (!pin) return;
        setDragFace({
          label: displayQuickAccessLabel(pin.href, pin.label),
          icon: masterNavFaceForPinHref(pin.href)?.icon ?? Pin,
        });
      }
    },
    [settings.pinned],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragFace(null);
      const { active, over } = event;
      if (!over) return;
      const overId = String(over.id);
      const activeId = String(active.id);
      const data = active.data.current as NavPinDragData | { type: 'pin'; id: string } | undefined;
      const pinning = isPinDropOverId(overId);

      if (data?.type === 'pin' || activeId.startsWith('pin:')) {
        const fromId = data?.type === 'pin' ? data.id : activeId.slice('pin:'.length);
        const oldIndex = pinIds.indexOf(fromId);
        if (oldIndex < 0) return;
        // Dragged clear of the shelf — unpin. The row reappears in whatever
        // section the registry says is its home; nothing about that home is
        // stored on the pin, so it cannot be restored to the wrong place.
        //
        // Only an explicit drop ONTO the map counts. A release over dead space
        // (`over` is null, handled above) is treated as a cancelled drag rather
        // than an unpin — a mis-aimed gesture must not silently delete a shelf
        // slot the operator arranged.
        if (!isPinDropOverId(overId)) {
          if (overId === MASTER_NAV_PIN_RETURN_ID) unpin(fromId);
          return;
        }
        const newIndex = pinIndexFromOverId(overId, pinIds);
        if (newIndex == null) return;
        const target = overId === MASTER_NAV_PIN_DROP_ID ? pinIds.length - 1 : newIndex;
        if (oldIndex === target) return;
        reorder(arrayMove([...pinIds], oldIndex, Math.min(target, pinIds.length - 1)));
        return;
      }

      if (data?.type !== 'nav') return;
      if (!pinning) return;
      if (isStructuralSpinePinHref(data.href)) return;
      const at = pinIndexFromOverId(overId, pinIds);
      pinAt(
        { href: data.href, label: data.label, iconKey: data.iconKey },
        at ?? pinIds.length,
      );
    },
    [pinAt, pinIds, reorder, unpin],
  );

  const renderDraggablePage = (page: SidebarPageNav) => (
    <DraggableTitleRow
      key={page.id}
      id={page.id}
      href={page.href}
      label={page.label}
      icon={page.icon}
      active={page.id === activePage.id && !currentPinned}
      ariaLabel={`Go to ${page.label}`}
      draggable
      onActivate={() => onNavigate(page.id)}
      onMouseEnter={onRowHover ? () => onRowHover(page) : undefined}
    />
  );

  const renderChild = (
    page: SidebarPageNav,
    child: NonNullable<SidebarPageNav['children']>[number],
  ) => {
    const { pathname, search } = applyChildTarget(
      { pathname: page.href, params: new URLSearchParams() },
      child.to(),
    );
    const href = search ? `${pathname}?${search}` : pathname;
    return (
      <DraggableTitleRow
        key={`${page.id}-${child.id}`}
        id={`${page.id}:${child.id}`}
        href={href}
        label={child.label}
        icon={child.icon}
        active={page.id === activePage.id && highlightedChildId === child.id}
        ariaLabel={`Go to ${child.label}`}
        draggable
        onActivate={() => onNavigate(page.id, child.id)}
      />
    );
  };

  const renderLabeledGroup = (
    id: string,
    label: string,
    pages: SidebarPageNav[],
  ) => (pages.length === 0 ? null : (
    <SidebarGroup id={id} role="group" aria-label={label}>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>{pages.map((page) => renderDraggablePage(page))}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));

  return (
    <div role="menu" aria-label="Pages" className={cn('flex h-full min-h-0 flex-col', className)}>
      <DndContext
        sensors={sensors}
        collisionDetection={pinCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragFace(null)}
      >
        <SidebarContent
          ref={setPinReturnRef}
          data-spine-scrollport
          className="min-h-0 flex-1 gap-0 overflow-y-auto overscroll-contain p-0"
        >
          {topPages.length > 0 ? (
            <SidebarGroup
              id="spine-section-top"
              role="group"
              // Labelled by ROLE, not by roster. This used to announce "Home and
              // Media Library"; now that Media Library can be pinned away, that
              // label named a row a screen-reader user might not find here.
              aria-label="Top pages"
            >
              <SidebarGroupContent>
                <SidebarMenu>
                  {topPages.map((page) => (
                    <DraggableTitleRow
                      key={page.id}
                      id={page.id}
                      href={page.href}
                      label={page.label}
                      icon={page.icon}
                      active={page.id === activePage.id}
                      ariaLabel={`Go to ${page.label}`}
                      // Home is the one row that cannot be pinned (it is the
                      // spine's root); everything else up here drags onto the
                      // shelf like any map row.
                      draggable={!isStructuralSpinePinHref(page.href)}
                      onActivate={() => onNavigate(page.id)}
                      onMouseEnter={onRowHover ? () => onRowHover(page) : undefined}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
          <MasterNavPinnedCluster pinIds={pinIds} />
          {mapEntries.map((entry) => {
            if (entry.kind === 'stations') {
              if (!stationsSection) return null;
              return (
                <div key={SPINE_STATIONS_SLOT_ID}>
                  {renderLabeledGroup(
                    'spine-section-floor',
                    stationsSection.label,
                    floorPages,
                  )}
                </div>
              );
            }
            if (entry.kind === 'desks') {
              return (
                <div key={SPINE_DESKS_SLOT_ID}>
                  {renderLabeledGroup('spine-section-desks', desksGroup.label, deskPages)}
                </div>
              );
            }
            const page = entry.page;
            if (pinsCoverPageId(page.id, settings.pinned)) return null;
            if (page.id === 'studio' && (page.children?.length ?? 0) > 0) {
              return (
                <SidebarGroup
                  key={page.id}
                  id="spine-section-studio"
                  role="group"
                  aria-label={page.label}
                >
                  <SidebarGroupLabel>{page.label}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {page.children?.map((child) => renderChild(page, child))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            }
            return (
              <SidebarGroup key={page.id}>
                <SidebarGroupContent>
                  <SidebarMenu>{renderDraggablePage(page)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </SidebarContent>
        <DragOverlay dropAnimation={null}>
          {dragFace ? (
            // Portalled to the body, so the gesture is not clipped by the
            // scrollport it started in. Flush ops chrome — a lifted copy of the
            // row, not a new card: same shell, same density, same glyph.
            <div
              className={cn(
                SPINE_ROW_SHELL_CLASS,
                SPINE_ROW_DENSITY.pointer.face,
                SPINE_ROW_DENSITY.pointer.label,
                'w-[--sidebar-width] cursor-grabbing border border-border-soft bg-surface-card text-text-default',
              )}
            >
              <dragFace.icon className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
              <span className="min-w-0 flex-1 truncate">{dragFace.label}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <SidebarFooter data-spine-account-footer className="shrink-0 p-0">
        <StaffAccountFooter />
      </SidebarFooter>
    </div>
  );
}
