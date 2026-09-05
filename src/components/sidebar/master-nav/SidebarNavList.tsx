'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
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
import { arrayMove } from '@dnd-kit/sortable';
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
  MASTER_NAV_PIN_EDGE_BOTTOM,
  MASTER_NAV_PIN_RETURN_ID,
  isPinDropOverId,
  isPinEdgeOverId,
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
  SPINE_SCROLLPORT_SCROLLBAR_CLASS,
  SPINE_SECTION_LABEL_STICKY_CLASS,
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
  if (pinHits.length > 0) {
    // Most specific target wins. The cluster CONTAINS its rows and its end
    // strips, so a pointer over the first row hits the container too — and the
    // container's only answer is "append". Ranking it last is what makes the
    // top of the shelf reachable at all.
    const rank = (id: string) =>
      isPinEdgeOverId(id) ? 0 : id.startsWith('pin:') ? 1 : 2;
    return [...pinHits].sort(
      (a, b) => rank(String(a.id)) - rank(String(b.id)),
    );
  }
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
  const { listeners, setNodeRef, isDragging } = useDraggable({
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
        // `listeners` only — NOT dnd-kit's `attributes`. Those carry
        // aria-roledescription="draggable" plus a describedby pointing at
        // "to pick up a draggable item, press the space bar", and with the
        // KeyboardSensor removed that instruction is false on every row. A
        // screen reader announcing a gesture that does nothing is worse than
        // announcing no gesture at all; the row is a link and says so.
        {...(draggable ? listeners : {})}
        isActive={active}
        onClick={onActivate}
        onMouseEnter={onMouseEnter}
        aria-label={ariaLabel}
        aria-current={active ? 'page' : undefined}
        // On the CONTROL, not the label span: in the icon rail that span is
        // `sr-only`, and a title on a hidden element names nothing.
        title={label}
        className={cn(draggable && 'touch-none', isDragging && 'cursor-grabbing')}
      >
        <RowIcon className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
        <span>{label}</span>
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
  // The map as an explicit drop surface. It no longer DECIDES the unpin —
  // anything that is not a pin target does that now — but registering it keeps
  // dnd-kit reporting a real `over` while the pointer is on the map, so the
  // drop reads as a landing rather than a release into nothing.
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

  /**
   * The map, as render blocks in the staff's arranged order.
   *
   * Consecutive unlabeled destinations merge into ONE group. Each
   * `SidebarGroup` carries its own padding, so a group per row surrounded every
   * lone 28px row with chrome and made a flat list read as a stack of one-row
   * sections. A run never crosses a labelled section, so merging cannot reorder
   * anything the operator arranged.
   */
  type SpineBlock =
    | { kind: 'stations' }
    | { kind: 'desks' }
    | { kind: 'studio'; page: SidebarPageNav }
    | { kind: 'loose'; pages: SidebarPageNav[] };

  const spineBlocks = useMemo<SpineBlock[]>(() => {
    const blocks: SpineBlock[] = [];
    for (const entry of mapEntries) {
      if (entry.kind === 'stations' || entry.kind === 'desks') {
        blocks.push({ kind: entry.kind });
        continue;
      }
      const page = entry.page;
      if (pinsCoverPageId(page.id, settings.pinned)) continue;
      if (page.id === 'studio' && (page.children?.length ?? 0) > 0) {
        blocks.push({ kind: 'studio', page });
        continue;
      }
      const tail = blocks[blocks.length - 1];
      if (tail?.kind === 'loose') tail.pages.push(page);
      else blocks.push({ kind: 'loose', pages: [page] });
    }
    return blocks;
  }, [mapEntries, settings.pinned]);

  /**
   * Pointer only, deliberately.
   *
   * dnd-kit's `KeyboardSensor` registers an activator that `preventDefault()`s
   * Space and Enter on every node these `listeners` are spread onto — which is
   * every destination row. With it mounted, a keyboard operator could not
   * activate a single row in the navigator: the key started a drag instead of
   * following the link, and the suppressed default meant no click ever fired.
   *
   * Navigating is what this list is FOR; arranging it is the accessory. So the
   * keyboard keeps the primary verb, and rearranging pins by keyboard goes
   * through ⌘1–9 and the row's own controls rather than a drag it hijacks.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // DISTANCE, not delay. A `delay` constraint arms a drag on any press held
      // past the threshold even with the pointer stationary — and dnd-kit then
      // suppresses the click — so a deliberate, slightly slow click on a row
      // (a gloved hand, a floor monitor) silently did nothing at all, on this
      // column's most repeated action. Requiring 6px of travel means a press
      // that never moves is always a navigation, and a drag is always intended.
      activationConstraint: { distance: 6 },
    }),
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
      const overId = over ? String(over.id) : null;
      const activeId = String(active.id);
      const data = active.data.current as NavPinDragData | { type: 'pin'; id: string } | undefined;

      if (data?.type === 'pin' || activeId.startsWith('pin:')) {
        const fromId = data?.type === 'pin' ? data.id : activeId.slice('pin:'.length);
        const oldIndex = pinIds.indexOf(fromId);
        if (oldIndex < 0) return;
        // OUT OF THE SHELF IS OFF THE SHELF (operator ruling 2026-09-05).
        //
        // Anywhere that is not a pin target unpins — the map, the header, dead
        // space, the workspace. It used to take an explicit drop onto the map,
        // and a release anywhere else was read as a cancelled drag, on the
        // reasoning that a mis-aimed gesture must not silently delete a slot
        // the operator arranged. That reasoning predates the undo: the row's
        // slot is now held open for 12s with a one-click restore, so a
        // mis-aim costs a click instead of a rebuild, and the gesture gets to
        // mean the obvious thing.
        //
        // The row reappears in whatever section the registry says is its home;
        // nothing about that home is stored on the pin, so it cannot come back
        // in the wrong place.
        if (!overId || !isPinDropOverId(overId)) {
          unpin(fromId);
          return;
        }
        const newIndex = pinIndexFromOverId(overId, pinIds);
        if (newIndex == null) return;
        const target =
          overId === MASTER_NAV_PIN_DROP_ID || overId === MASTER_NAV_PIN_EDGE_BOTTOM
            ? pinIds.length - 1
            : newIndex;
        if (oldIndex === target) return;
        reorder(arrayMove([...pinIds], oldIndex, Math.min(target, pinIds.length - 1)));
        return;
      }

      if (data?.type !== 'nav') return;
      if (!overId || !isPinDropOverId(overId)) return;
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
      <SidebarGroupLabel className={SPINE_SECTION_LABEL_STICKY_CLASS}>
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>{pages.map((page) => renderDraggablePage(page))}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));

  return (
    // No `role="menu"`: a menu must contain `menuitem`s, and this contains
    // groups, lists and links. The navigation landmark already lives on the
    // hosting <aside>; `data-spine-nav` is the styling hook the peek shell uses.
    <div data-spine-nav className={cn('flex h-full min-h-0 flex-col', className)}>
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
          className={cn(
            'min-h-0 flex-1 gap-0 overflow-y-auto overscroll-contain p-0',
            SPINE_SCROLLPORT_SCROLLBAR_CLASS,
          )}
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
          {spineBlocks.map((block) => {
            if (block.kind === 'stations') {
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
            if (block.kind === 'desks') {
              return (
                <div key={SPINE_DESKS_SLOT_ID}>
                  {renderLabeledGroup('spine-section-desks', desksGroup.label, deskPages)}
                </div>
              );
            }
            if (block.kind === 'studio') {
              const page = block.page;
              return (
                <SidebarGroup
                  key={page.id}
                  id="spine-section-studio"
                  role="group"
                  aria-label={page.label}
                >
                  <SidebarGroupLabel className={SPINE_SECTION_LABEL_STICKY_CLASS}>
                    {page.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {page.children?.map((child) => renderChild(page, child))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            }
            return (
              // One group per RUN of unlabeled destinations, not one per
              // destination: `SidebarGroup` carries `px-2 py-1`, so a group per
              // row put 8px of chrome around every single 28px row and made a
              // flat list read as N one-row sections. Runs keep the staff's
              // arranged order — they never hop a labelled section.
              <SidebarGroup key={`loose-${block.pages[0]!.id}`}>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {block.pages.map((page) => renderDraggablePage(page))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </SidebarContent>
        <DragOverlay dropAnimation={null}>
          {dragFace ? (
            // <DragOverlay> renders `position: fixed`, which escapes the
            // scrollport's clip — that, not a portal, is what keeps the gesture
            // visible. Flush ops chrome: a lifted copy of the row, not a new
            // card — same shell, same density, same glyph.
            <div
              className={cn(
                SPINE_ROW_SHELL_CLASS,
                SPINE_ROW_DENSITY.pointer.face,
                SPINE_ROW_DENSITY.pointer.label,
                'w-(--sidebar-width) cursor-grabbing border border-border-soft bg-surface-card text-text-default',
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
