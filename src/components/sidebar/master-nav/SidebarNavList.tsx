'use client';

import { useCallback, useMemo } from 'react';
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
import { ChevronLeft, ChevronsRight } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  spineAccentFor,
  type SpineAccentClasses,
} from '@/lib/nav/spine-section-accent';
import {
  resolveSpineMapEntries,
  spineStructuralTopPages,
  SPINE_STATIONS_SLOT_ID,
} from '@/lib/nav/spine-slots';
import {
  SPINE_SECTIONS,
  hasDeskPageChrome,
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
} from '@/components/sidebar/sidebar-spine';
import { cn } from '@/utils/_cn';
import { StaffAccountFooter } from './StaffAccountFooter';

/**
 * MasterNav page list — full catalog, hold-drag to reorder.
 *
 * Home · Media Library stay fixed at the top. Scan Stations is one parent
 * row that list-replaces into floor benches. Every other reachable L1 is a
 * sortable row: short click navigates (or opens a child drill); hold ~180ms
 * anywhere on the title row then drag reorders and persists to
 * `prefs.spineSlots`. No grip chrome — the whole label row is the handle.
 */
interface SidebarNavListProps {
  activePage: SidebarPageNav;
  activeChildId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, childId?: string) => void;
  onRowHover?: (page: SidebarPageNav) => void;
  drillId: string | null;
  onDrillChange: (id: string | null) => void;
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
  drill,
}: {
  id: string;
  label: string;
  icon: SidebarIconComponent;
  active: boolean;
  ariaLabel: string;
  onActivate: () => void;
  onMouseEnter?: () => void;
  accent: SpineAccentClasses;
  drill?: boolean;
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
        {drill ? (
          <ChevronsRight className={cn(SPINE_ROW_ICON_CLASS, 'text-text-faint')} aria-hidden />
        ) : null}
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
  drillId,
  onDrillChange,
  spineOrder,
  onSpineOrderChange,
  className,
}: SidebarNavListProps) {
  const highlightedChildId = activeChildId ?? activePage.children?.[0]?.id ?? null;
  const topPages = spineStructuralTopPages(otherPages);
  const neutralAccent = spineAccentFor(null);
  const stationsSection = SPINE_SECTIONS.find((s) => s.id === 'floor');
  const floorPages = useMemo(
    () => otherPages.filter((p) => spineSectionIdForPage(p) === 'floor'),
    [otherPages],
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
      drill?: boolean;
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
        {opts.drill ? (
          <ChevronsRight className={cn(SPINE_ROW_ICON_CLASS, 'text-text-faint')} aria-hidden />
        ) : null}
      </button>
    );
  };

  const renderBackHeader = (title: string, onBack: () => void) => (
    <button
      type="button"
      onClick={onBack}
      aria-label="Back to pages"
      className={cn(
        'ds-raw-button grid w-full grid-cols-[1rem_1fr_1rem] items-center gap-2 rounded-none px-2 text-text-default transition-colors duration-150 hover:bg-surface-hover',
        SPINE_ROW_FACE_CLASS,
      )}
    >
      <ChevronLeft className={cn(SPINE_ROW_ICON_CLASS, 'justify-self-start')} aria-hidden />
      <span className={cn('min-w-0 truncate text-center', SPINE_LABEL_CLASS)} title={title}>
        {title}
      </span>
      <span className={SPINE_ROW_ICON_CLASS} aria-hidden />
    </button>
  );

  const renderRow = (
    page: SidebarPageNav,
    keyPrefix: string,
    accent: SpineAccentClasses,
    opts?: { pinned?: boolean },
  ) => {
    const isPageActive = page.id === activePage.id;
    // Floor benches (incl. Testing) stay flat — modes live on HeaderPageSwitcher,
    // never a second drill inside Scan Stations. Desk-chrome pages stay flat too
    // (`hasDeskPageChrome`): the desk draws those children as in-page tabs, so a
    // drill here would be the nav tabbing them a second time.
    const drills =
      !opts?.pinned &&
      !isSpineMapTopRow(page) &&
      page.kind !== 'station' &&
      !hasDeskPageChrome(page) &&
      (page.children?.length ?? 0) > 1;
    return (
      <div key={`${keyPrefix}-${page.id}`}>
        {renderPageHeader(
          {
            label: page.label,
            icon: page.icon,
            active: isPageActive,
            ariaLabel: drills ? `Open ${page.label}` : `Go to ${page.label}`,
            onClick: () => {
              if (drills) {
                onDrillChange(page.id);
                return;
              }
              onNavigate(page.id);
            },
            onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
            drill: drills,
          },
          accent,
        )}
      </div>
    );
  };

  const renderDrillChild = (
    pageId: string,
    child: NonNullable<SidebarPageNav['children']>[number],
    accent: SpineAccentClasses,
  ) => (
    <div key={`${pageId}-${child.id}`}>
      {renderPageHeader(
        {
          label: child.label,
          icon: child.icon,
          active: pageId === activePage.id && highlightedChildId === child.id,
          ariaLabel: `Go to ${child.label}`,
          onClick: () => onNavigate(pageId, child.id),
        },
        accent,
      )}
    </div>
  );

  const renderPageDrill = (page: SidebarPageNav) => {
    const accent = spineAccentFor(spineSectionIdForPage(page));
    return (
      <div>
        {renderBackHeader(page.label, () => onDrillChange(null))}
        <div role="group" aria-label={page.label}>
          {page.children?.map((child) => renderDrillChild(page.id, child, accent))}
        </div>
      </div>
    );
  };

  /** Scan Stations list-replace — Back + flat benches (no nested drills). */
  const renderStationsDrill = () => {
    if (!stationsSection) return null;
    const accent = spineAccentFor('floor');
    return (
      <div>
        {renderBackHeader(stationsSection.label, () => onDrillChange(null))}
        <div id="spine-section-floor" role="group" aria-label={stationsSection.label}>
          {floorPages.map((page) => (
            <div key={page.id}>{renderRow(page, 'floor', accent)}</div>
          ))}
        </div>
      </div>
    );
  };

  const renderMap = () => {
    if (drillId === SPINE_STATIONS_SLOT_ID) {
      return renderStationsDrill();
    }

    if (drillId != null) {
      const drilledPage = otherPages.find(
        (p) =>
          p.id === drillId &&
          p.kind !== 'station' &&
          !hasDeskPageChrome(p) &&
          (p.children?.length ?? 0) > 1,
      );
      if (drilledPage) return renderPageDrill(drilledPage);
    }

    return (
      <div>
        {topPages.length > 0 ? (
          <div id="spine-section-top" role="group" aria-label="Pinned">
            {topPages.map((page) => (
              <div key={page.id}>{renderRow(page, 'top', neutralAccent, { pinned: true })}</div>
            ))}
          </div>
        ) : null}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={spineOrder} strategy={verticalListSortingStrategy}>
            <div role="list" aria-label="Pages">
              {mapEntries.map((entry) => {
                if (entry.kind === 'stations') {
                  if (!stationsSection) return null;
                  const floorActive = spineSectionIdForPage(activePage) === 'floor';
                  return (
                    <SortableTitleRow
                      key={SPINE_STATIONS_SLOT_ID}
                      id={SPINE_STATIONS_SLOT_ID}
                      label={stationsSection.label}
                      icon={stationsSection.icon}
                      active={floorActive}
                      ariaLabel={`Open ${stationsSection.label}`}
                      accent={spineAccentFor('floor')}
                      drill
                      onActivate={() => onDrillChange(SPINE_STATIONS_SLOT_ID)}
                    />
                  );
                }

                const page = entry.page;
                const drills = !hasDeskPageChrome(page) && (page.children?.length ?? 0) > 1;
                return (
                  <SortableTitleRow
                    key={page.id}
                    id={page.id}
                    label={page.label}
                    icon={page.icon}
                    active={page.id === activePage.id}
                    ariaLabel={drills ? `Open ${page.label}` : `Go to ${page.label}`}
                    accent={spineAccentFor(spineSectionIdForPage(page))}
                    drill={drills}
                    onActivate={() => {
                      if (drills) onDrillChange(page.id);
                      else onNavigate(page.id);
                    }}
                    onMouseEnter={onRowHover ? () => onRowHover(page) : undefined}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    );
  };

  return (
    <div role="menu" aria-label="Pages" className={cn('flex h-full min-h-0 flex-col', className)}>
      <div data-spine-scrollport className="min-h-0 flex-1 overflow-y-auto p-0">
        {renderMap()}
      </div>
      <div className="flex w-full shrink-0 flex-col">
        <StaffAccountFooter />
      </div>
    </div>
  );
}
