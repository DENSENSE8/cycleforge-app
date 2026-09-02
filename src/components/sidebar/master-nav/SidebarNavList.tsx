'use client';

import { useCallback, useMemo, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
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
  SPINE_DESKS_SLOT_ID,
  SPINE_STATIONS_SLOT_ID,
} from '@/lib/nav/spine-slots';
import {
  DESK_GROUPS,
  SPINE_SECTIONS,
  applyChildTarget,
  hasDeskPageChrome,
  isSpineDeskItem,
  isSpineMapTopRow,
  spineSectionIdForPage,
  type SidebarIconComponent,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import {
  MASTER_NAV_PIN_DROP_ID,
  isPinDropOverId,
  isStructuralSpinePinHref,
  navPinDragId,
  pinIndexFromOverId,
  type NavPinDragData,
} from '@/lib/quick-access/nav-pin';
import { pinsCoverHref } from '@/lib/quick-access/storage';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import {
  SPINE_DRILL_SCROLL_END_CLASS,
  SPINE_LABEL_CLASS,
  SPINE_ROW_FACE_CLASS,
  SPINE_ROW_ICON_CLASS,
  SPINE_ROW_SHELL_CLASS,
} from '@/components/sidebar/sidebar-spine';
import { cn } from '@/utils/_cn';
import { StaffAccountFooter } from './StaffAccountFooter';
import { MasterNavPinnedCluster } from './MasterNavPinnedCluster';

/**
 * MasterNav page list — catalog is not sortable. Hold-drag a leaf onto Pinned
 * (or a pin row). Reorder only inside that cluster. Scan Stations / Desks
 * stay parent drills (not pin folders). Drill parents never take the
 * current-page fill — if the leaf is already in Pinned, they stay idle.
 */
/** Prefer the Pinned well / pin rows when the pointer is over them. */
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
  drillId: string | null;
  onDrillChange: (id: string | null) => void;
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
  accent,
  drill,
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
  accent: SpineAccentClasses;
  drill?: boolean;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: navPinDragId(id),
    data: { type: 'nav', href, label, iconKey: id } satisfies NavPinDragData,
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn('relative', isDragging && 'z-10 opacity-80')}
    >
      <button
        type="button"
        {...(draggable ? { ...attributes, ...listeners } : {})}
        onClick={onActivate}
        onMouseEnter={onMouseEnter}
        aria-label={ariaLabel}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'ds-raw-button flex w-full items-center gap-2 px-2 text-left',
          draggable && 'touch-none',
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
  className,
}: SidebarNavListProps) {
  const { settings, pinAt, reorder } = useQuickAccess();
  const pinIds = useMemo(() => settings.pinned.map((p) => p.id), [settings.pinned]);
  const currentPinned = pinsCoverHref(activePage.href, settings.pinned);
  const highlightedChildId = activeChildId ?? activePage.children?.[0]?.id ?? null;
  const topPages = spineStructuralTopPages(otherPages);
  const neutralAccent = spineAccentFor(null);
  const stationsSection = SPINE_SECTIONS.find((s) => s.id === 'floor');
  const desksGroup = DESK_GROUPS[0];
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const overId = String(over.id);
      const activeId = String(active.id);
      const data = active.data.current as NavPinDragData | { type: 'pin'; id: string } | undefined;
      const pinning = isPinDropOverId(overId);

      if (data?.type === 'pin' || activeId.startsWith('pin:')) {
        const fromId = data?.type === 'pin' ? data.id : activeId.slice('pin:'.length);
        const oldIndex = pinIds.indexOf(fromId);
        const newIndex = pinIndexFromOverId(overId, pinIds);
        if (oldIndex < 0 || newIndex == null) return;
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
    [pinAt, pinIds, reorder],
  );

  const renderPageHeader = (
    opts: {
      label: string;
      icon: SidebarPageNav['icon'];
      active: boolean;
      /** Parent of the current page — quieter fill, never aria-current. */
      owns?: boolean;
      ariaLabel: string;
      onClick: () => void;
      onMouseEnter?: () => void;
      drill?: boolean;
    },
    accent: SpineAccentClasses,
  ) => {
    const PageIcon = opts.icon;
    const face = opts.active
      ? accent.activePage
      : opts.owns
        ? accent.ownsActive
        : accent.idlePage;
    return (
      <button
        type="button"
        onClick={opts.onClick}
        onMouseEnter={opts.onMouseEnter}
        aria-label={opts.ariaLabel}
        aria-current={opts.active ? 'page' : undefined}
        className={cn(
          'ds-raw-button w-full items-center gap-2 px-2 text-left',
          SPINE_ROW_SHELL_CLASS,
          SPINE_ROW_FACE_CLASS,
          face,
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

  const renderDraggablePage = (
    page: SidebarPageNav,
    accent: SpineAccentClasses,
    opts?: { drill?: boolean; onActivate?: () => void },
  ) => {
    const drills =
      opts?.drill ??
      (!isSpineMapTopRow(page) &&
        page.kind !== 'station' &&
        !hasDeskPageChrome(page) &&
        (page.children?.length ?? 0) > 1);
    return (
      <DraggableTitleRow
        key={page.id}
        id={page.id}
        href={page.href}
        label={page.label}
        icon={page.icon}
        active={page.id === activePage.id}
        ariaLabel={drills ? `Open ${page.label}` : `Go to ${page.label}`}
        accent={accent}
        drill={drills}
        draggable
        onActivate={
          opts?.onActivate ??
          (() => {
            if (drills) onDrillChange(page.id);
            else onNavigate(page.id);
          })
        }
        onMouseEnter={onRowHover ? () => onRowHover(page) : undefined}
      />
    );
  };

  const renderDrillChild = (
    page: SidebarPageNav,
    child: NonNullable<SidebarPageNav['children']>[number],
    accent: SpineAccentClasses,
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
        accent={accent}
        draggable
        onActivate={() => onNavigate(page.id, child.id)}
      />
    );
  };

  const renderPageDrill = (page: SidebarPageNav) => {
    const accent = spineAccentFor(spineSectionIdForPage(page));
    return (
      <div data-spine-drill-pad className={SPINE_DRILL_SCROLL_END_CLASS}>
        {renderBackHeader(page.label, () => onDrillChange(null))}
        <div role="group" aria-label={page.label}>
          {page.children?.map((child) => renderDrillChild(page, child, accent))}
        </div>
      </div>
    );
  };

  const renderStationsDrill = () => {
    if (!stationsSection) return null;
    const accent = spineAccentFor('floor');
    return (
      <div data-spine-drill-pad className={SPINE_DRILL_SCROLL_END_CLASS}>
        {renderBackHeader(stationsSection.label, () => onDrillChange(null))}
        <div id="spine-section-floor" role="group" aria-label={stationsSection.label}>
          {floorPages.map((page) => (
            <div key={page.id}>{renderDraggablePage(page, accent, { drill: false })}</div>
          ))}
        </div>
      </div>
    );
  };

  const renderDesksDrill = () => (
    <div data-spine-drill-pad className={SPINE_DRILL_SCROLL_END_CLASS}>
      {renderBackHeader(desksGroup.label, () => onDrillChange(null))}
      <div id="spine-section-desks" role="group" aria-label={desksGroup.label}>
        {deskPages.map((page) => (
          <div key={page.id}>
            {renderDraggablePage(page, spineAccentFor(spineSectionIdForPage(page)), {
              drill: false,
            })}
          </div>
        ))}
      </div>
    </div>
  );

  const renderCatalogMap = () => (
    <div role="list" aria-label="Pages">
      {mapEntries.map((entry) => {
        if (entry.kind === 'stations') {
          if (!stationsSection) return null;
          const floorOwns = spineSectionIdForPage(activePage) === 'floor';
          // Never aria-current / activePage: Scan Stations is a parent drill.
          // When Unbox (etc.) is already current in Pinned, stay fully idle.
          return (
            <div key={SPINE_STATIONS_SLOT_ID}>
              {renderPageHeader(
                {
                  label: stationsSection.label,
                  icon: stationsSection.icon,
                  active: false,
                  owns: floorOwns && !currentPinned,
                  ariaLabel: `Open ${stationsSection.label}`,
                  onClick: () => onDrillChange(SPINE_STATIONS_SLOT_ID),
                  drill: true,
                },
                spineAccentFor('floor'),
              )}
            </div>
          );
        }

        if (entry.kind === 'desks') {
          const desksOwn = isSpineDeskItem(activePage);
          return (
            <div key={SPINE_DESKS_SLOT_ID}>
              {renderPageHeader(
                {
                  label: desksGroup.label,
                  icon: desksGroup.icon,
                  active: false,
                  owns: desksOwn && !currentPinned,
                  ariaLabel: `Open ${desksGroup.label}`,
                  onClick: () => onDrillChange(SPINE_DESKS_SLOT_ID),
                  drill: true,
                },
                neutralAccent,
              )}
            </div>
          );
        }

        const page = entry.page;
        const drills = !hasDeskPageChrome(page) && (page.children?.length ?? 0) > 1;
        return renderDraggablePage(page, spineAccentFor(spineSectionIdForPage(page)), {
          drill: drills,
        });
      })}
    </div>
  );

  const renderMap = () => {
    let drillBody: ReactNode = renderCatalogMap();
    if (drillId === SPINE_STATIONS_SLOT_ID) {
      drillBody = renderStationsDrill();
    } else if (drillId === SPINE_DESKS_SLOT_ID) {
      drillBody = renderDesksDrill();
    } else if (drillId != null) {
      const drilledPage = otherPages.find(
        (p) =>
          p.id === drillId &&
          p.kind !== 'station' &&
          !hasDeskPageChrome(p) &&
          (p.children?.length ?? 0) > 1,
      );
      if (drilledPage) drillBody = renderPageDrill(drilledPage);
    }

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={pinCollisionDetection}
        onDragEnd={handleDragEnd}
      >
        <div>
          {topPages.length > 0 ? (
            <div id="spine-section-top" role="group" aria-label="Home and Media Library">
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
                    neutralAccent,
                  )}
                </div>
              ))}
            </div>
          ) : null}
          <MasterNavPinnedCluster pinIds={pinIds} />
          {drillBody}
        </div>
      </DndContext>
    );
  };

  return (
    <div role="menu" aria-label="Pages" className={cn('flex h-full min-h-0 flex-col', className)}>
      <div data-spine-scrollport className="min-h-0 flex-1 overflow-y-auto p-0">
        {renderMap()}
      </div>
      <div data-spine-account-footer className="flex w-full shrink-0 flex-col">
        <StaffAccountFooter />
      </div>
    </div>
  );
}
