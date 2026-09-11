'use client';

import { useCallback, useMemo, type ReactNode } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  spineAccentFor,
  type SpineAccentClasses,
} from '@/lib/nav/spine-section-accent';
import {
  resolveSpineMapEntries,
  spineStructuralTopPages,
  SPINE_DESKS_SLOT_ID,
  SPINE_STATIONS_SLOT_ID,
} from '@/lib/nav/spine-slots';
import {
  DESK_GROUPS,
  SPINE_SECTIONS,
  isSpineDeskItem,
  isSpineMapTopRow,
  spineSectionIdForPage,
  type SidebarIconComponent,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import {
  SPINE_LABEL_CLASS,
  SPINE_ROW_FACE_CLASS,
  SPINE_ROW_ICON_CLASS,
  SPINE_ROW_SHELL_CLASS,
  SPINE_SCROLLPORT_SCROLLBAR_CLASS,
  SPINE_SECTION_LABEL_STICKY_CLASS,
} from '@/components/sidebar/sidebar-spine';
import { cn } from '@/utils/_cn';
import { StaffAccountFooter } from './StaffAccountFooter';
import { useSpineSectionCollapse } from './useSpineSectionCollapse';

/**
 * MasterNav page list — Home · Media Library stay structural. Stations and
 * Workspaces are in-place disclosures (not list-replace drills). Remaining L1
 * (Studio, Admin) are staff-ordered rows. Hold-drag reorders group slots and
 * loose L1 ids into `prefs.spineSlots`.
 */
interface SidebarNavListProps {
  activePage: SidebarPageNav;
  activeChildId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, childId?: string) => void;
  onRowHover?: (page: SidebarPageNav) => void;
  spineOrder: string[];
  onSpineOrderChange: (ids: string[]) => void;
  className?: string;
}

function SortableTitleRow({
  id,
  label,
  icon: RowIcon,
  active,
  ariaLabel,
  onActivate,
  onMouseEnter,
  accent,
}: {
  id: string;
  label: string;
  icon: SidebarIconComponent;
  active: boolean;
  ariaLabel: string;
  onActivate: () => void;
  onMouseEnter?: () => void;
  accent: SpineAccentClasses;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn('relative', isDragging && 'z-10 opacity-80')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={onActivate}
        onMouseEnter={onMouseEnter}
        aria-label={ariaLabel}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'ds-raw-button flex w-full items-center gap-2 px-2 text-left touch-none',
          SPINE_ROW_SHELL_CLASS,
          SPINE_ROW_FACE_CLASS,
          active ? accent.activePage : accent.idlePage,
          isDragging && 'cursor-grabbing ring-1 ring-inset ring-border-soft',
        )}
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
    </div>
  );
}

function SortableSectionTrigger({
  id,
  label,
  open,
  rowCount,
  ownsCurrent,
  bodyId,
  onToggle,
}: {
  id: string;
  label: string;
  open: boolean;
  rowCount: number;
  ownsCurrent: boolean;
  bodyId: string;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn('relative', isDragging && 'z-10 opacity-80')}
    >
      <button
        type="button"
        data-spine-section-trigger
        data-owns-current={ownsCurrent ? 'true' : undefined}
        aria-expanded={open}
        aria-controls={bodyId}
        {...attributes}
        {...listeners}
        onClick={onToggle}
        className={cn(
          'ds-raw-button relative flex w-full cursor-pointer items-center gap-1.5 px-2 text-left touch-none',
          SPINE_ROW_SHELL_CLASS,
          SPINE_ROW_FACE_CLASS,
          SPINE_SECTION_LABEL_STICKY_CLASS,
          'text-text-soft hover:text-text-default',
          focusRing('control', 'accent'),
          ownsCurrent &&
            "font-semibold text-text-default before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-text-default before:content-['']",
          isDragging && 'cursor-grabbing ring-1 ring-inset ring-border-soft',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)} title={label}>
          {label}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {open ? null : (
            <span className="tabular-nums text-role-micro text-text-soft">{rowCount}</span>
          )}
          <ChevronDown
            aria-hidden
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-text-faint transition-transform',
              open ? 'rotate-0' : '-rotate-90',
              open &&
                'opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100',
            )}
          />
        </span>
      </button>
    </div>
  );
}

export function SidebarNavList({
  activePage,
  activeChildId,
  otherPages,
  onNavigate,
  onRowHover,
  spineOrder,
  onSpineOrderChange,
  className,
}: SidebarNavListProps) {
  const highlightedChildId = activeChildId ?? activePage.children?.[0]?.id ?? null;
  const topPages = spineStructuralTopPages(otherPages);
  const neutralAccent = spineAccentFor(null);
  const stationsSection = SPINE_SECTIONS.find((s) => s.id === 'floor');
  const desksGroup = DESK_GROUPS[0];
  const { closedSections, setSectionOpen } = useSpineSectionCollapse();

  const floorPages = useMemo(
    () => otherPages.filter((p) => spineSectionIdForPage(p) === 'floor'),
    [otherPages],
  );
  const deskPages = useMemo(
    () => otherPages.filter((p) => isSpineDeskItem(p)),
    [otherPages],
  );

  const mapEntries = useMemo(
    () => resolveSpineMapEntries(spineOrder, otherPages),
    [spineOrder, otherPages],
  );

  type SpineBlock =
    | { kind: 'stations' }
    | { kind: 'desks' }
    | { kind: 'parent'; page: SidebarPageNav }
    | { kind: 'loose'; pages: SidebarPageNav[] };

  const spineBlocks = useMemo<SpineBlock[]>(() => {
    const blocks: SpineBlock[] = [];
    for (const entry of mapEntries) {
      if (entry.kind === 'stations' || entry.kind === 'desks') {
        blocks.push({ kind: entry.kind });
        continue;
      }
      const page = entry.page;
      if ((page.children?.length ?? 0) > 0 && !page.spineFlat) {
        blocks.push({ kind: 'parent', page });
        continue;
      }
      const tail = blocks[blocks.length - 1];
      if (tail?.kind === 'loose') tail.pages.push(page);
      else blocks.push({ kind: 'loose', pages: [page] });
    }
    return blocks;
  }, [mapEntries]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = spineOrder.indexOf(String(active.id));
      const newIndex = spineOrder.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      onSpineOrderChange(arrayMove(spineOrder, oldIndex, newIndex));
    },
    [spineOrder, onSpineOrderChange],
  );

  const renderPageHeader = (
    opts: {
      label: string;
      icon: SidebarPageNav['icon'];
      active: boolean;
      ariaLabel: string;
      onClick: () => void;
      onMouseEnter?: () => void;
    },
    accent: SpineAccentClasses,
  ) => {
    const PageIcon = opts.icon;
    return (
      <button
        type="button"
        onClick={opts.onClick}
        onMouseEnter={opts.onMouseEnter}
        aria-label={opts.ariaLabel}
        aria-current={opts.active ? 'page' : undefined}
        className={cn(
          SPINE_ROW_SHELL_CLASS,
          SPINE_ROW_FACE_CLASS,
          opts.active ? accent.activePage : accent.idlePage,
        )}
      >
        <PageIcon
          className={navIconStrokeClass(
            cn(
              SPINE_ROW_ICON_CLASS,
              opts.active ? accent.activePageIcon : accent.idlePageIcon,
            ),
          )}
        />
        <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)} title={opts.label}>
          {opts.label}
        </span>
      </button>
    );
  };

  const renderLeaf = (page: SidebarPageNav, accent: SpineAccentClasses) => {
    const isPageActive = page.id === activePage.id;
    return (
      <div key={page.id}>
        {renderPageHeader(
          {
            label: page.label,
            icon: page.icon,
            active: isPageActive,
            ariaLabel: `Go to ${page.label}`,
            onClick: () => onNavigate(page.id),
            onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
          },
          accent,
        )}
      </div>
    );
  };

  const renderSection = (
    sectionKey: string,
    sortableId: string,
    domId: string,
    label: string,
    rows: ReactNode,
    rowCount: number,
    ownsCurrent: boolean,
  ) => {
    if (rowCount === 0) return null;
    const open = !closedSections.has(sectionKey);
    const bodyId = `${domId}-body`;
    return (
      <div id={domId} role="group" aria-label={label} className="group/section">
        <SortableSectionTrigger
          id={sortableId}
          label={label}
          open={open}
          rowCount={rowCount}
          ownsCurrent={ownsCurrent}
          bodyId={bodyId}
          onToggle={() => setSectionOpen(sectionKey, !open)}
        />
        {open ? (
          <div id={bodyId} role="group" aria-label={label}>
            {rows}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      data-spine-nav
      aria-label="Pages"
      className={cn('flex h-full min-h-0 flex-col', className)}
    >
      <div
        data-spine-scrollport
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain p-0',
          SPINE_SCROLLPORT_SCROLLBAR_CLASS,
        )}
      >
        {topPages.length > 0 ? (
          <div id="spine-section-top" role="group" aria-label="Pinned">
            {topPages.map((page) => (
              <div key={page.id}>
                {renderPageHeader(
                  {
                    label: page.label,
                    icon: page.icon,
                    active: page.id === activePage.id,
                    ariaLabel: `Go to ${page.label}`,
                    onClick: () => onNavigate(page.id),
                    onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
                  },
                  isSpineMapTopRow(page) ? neutralAccent : spineAccentFor(spineSectionIdForPage(page)),
                )}
              </div>
            ))}
          </div>
        ) : null}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={spineOrder} strategy={verticalListSortingStrategy}>
            {spineBlocks.map((block) => {
              if (block.kind === 'stations') {
                if (!stationsSection) return null;
                const accent = spineAccentFor('floor');
                return (
                  <div key={SPINE_STATIONS_SLOT_ID}>
                    {renderSection(
                      'floor',
                      SPINE_STATIONS_SLOT_ID,
                      'spine-section-floor',
                      stationsSection.label,
                      floorPages.map((page) => renderLeaf(page, accent)),
                      floorPages.length,
                      floorPages.some((page) => page.id === activePage.id),
                    )}
                  </div>
                );
              }
              if (block.kind === 'desks') {
                return (
                  <div key={SPINE_DESKS_SLOT_ID}>
                    {renderSection(
                      'desks',
                      SPINE_DESKS_SLOT_ID,
                      'spine-section-desks',
                      desksGroup.label,
                      deskPages.map((page) =>
                        renderLeaf(page, spineAccentFor(spineSectionIdForPage(page))),
                      ),
                      deskPages.length,
                      deskPages.some((page) => page.id === activePage.id),
                    )}
                  </div>
                );
              }
              if (block.kind === 'parent') {
                const page = block.page;
                const children = page.children ?? [];
                const accent = spineAccentFor(spineSectionIdForPage(page));
                return (
                  <div key={page.id}>
                    {renderSection(
                      page.id,
                      page.id,
                      `spine-section-${page.id}`,
                      page.label,
                      children.map((child) => (
                        <div key={`${page.id}-${child.id}`}>
                          {renderPageHeader(
                            {
                              label: child.label,
                              icon: child.icon,
                              active:
                                page.id === activePage.id && highlightedChildId === child.id,
                              ariaLabel: `Go to ${child.label}`,
                              onClick: () => onNavigate(page.id, child.id),
                            },
                            accent,
                          )}
                        </div>
                      )),
                      children.length,
                      page.id === activePage.id,
                    )}
                  </div>
                );
              }
              return (
                <div key={`loose-${block.pages[0]!.id}`}>
                  {block.pages.map((page) => (
                    <SortableTitleRow
                      key={page.id}
                      id={page.id}
                      label={page.label}
                      icon={page.icon}
                      active={page.id === activePage.id}
                      ariaLabel={`Go to ${page.label}`}
                      accent={spineAccentFor(spineSectionIdForPage(page))}
                      onActivate={() => onNavigate(page.id)}
                      onMouseEnter={onRowHover ? () => onRowHover(page) : undefined}
                    />
                  ))}
                </div>
              );
            })}
          </SortableContext>
        </DndContext>
      </div>
      <div className="flex w-full shrink-0 flex-col">
        <StaffAccountFooter />
      </div>
    </div>
  );
}
