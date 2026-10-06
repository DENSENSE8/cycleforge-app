'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Variants } from '@/design-system/motion';
import { markSurfacePainted } from '@/lib/observability/paint-timing';
import {
  SIDEBAR_GUTTER,
  SIDEBAR_RAIL_INSET_X,
} from '@/components/layout/header-shell';
import { CONTEXT_PANEL_COLLAPSE } from '@/components/sidebar/context-panel-column';
import {
  usePublishCollapsePins,
  type CollapseStripPeekCtx,
} from '@/components/sidebar/context-panel-collapse-context';
import { appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
import { useNavRegion } from '@/lib/keyboard/nav-keys';
import { cn } from '@/utils/_cn';
import {
  STAGGER_REVEAL_STEP,
  staggerRevealContainer,
  staggerRevealRiseItem,
  staggerRevealSidebarItem,
  staggerRevealSidebarSlideItem,
} from '@/design-system/primitives/StaggerReveal';
import { RailPeekCard } from './rail-shell/RailPeekCard';
import { useSidebarRail } from './rail-shell/useSidebarRail';
import { RailRow } from './rail-shell/RailRow';
import { PkgGroupHeader } from './rail-shell/PkgGroupHeader';
import {
  railRelativeTime,
  type SidebarRailShellProps,
} from './rail-shell/sidebar-rail-shared';

/** Generic sidebar "recent activity" rail skeleton. */

export { railRelativeTime, type SidebarRailRowContext, type SidebarRailShellProps } from './rail-shell/sidebar-rail-shared';
export { RailPopover } from './rail-shell/RailPopover';

/** Rails that have already played their first-load reveal THIS SESSION, keyed by a stable rail identity. */
const revealedRails = new Set<string>();

export function SidebarRailShell<TRow>(props: SidebarRailShellProps<TRow>) {
  const {
    // `queryKey` is consumed by the engine hook via `props`; not destructured here.
    selectedId,
    eyebrowTitle,
    emptyText = 'No recent activity yet.',
    staggerReveal = false,
    // House default for every recent-activity rail: the left→right slide that
    // fades each row in from nothing (`staggerRevealSidebarSlideItem`). Rails opt
    // out to `sidebar` (y-settle) or `rise` only when a surface needs it.
    staggerRevealMotion = 'slide',
    railInset = 'gutter',
    contentPaintSurface,
    onVisibleRowsChange,
    publishCollapseMru = false,
    getCollapsePinLabel,
    getCollapsePinMeta,
    getCollapsePinFacts,
    getId, getReconcileId, getActivityAt, onSelect, getStatusDot, getStatusDotLabel,
    renderRowMain, renderPopover, rowActions, navRegionId,
    selectedRow, getGroupId,
  } = props;

  // Carton-aware selection (SoT default):
  const selectedGroupId =
    selectedRow != null && getGroupId ? getGroupId(selectedRow) : null;
  const rowSelected = useCallback(
    (row: TRow): boolean => {
      if (selectedId != null && getId(row) === selectedId) return true;
      if (selectedGroupId != null && getGroupId) {
        const g = getGroupId(row);
        return g != null && g === selectedGroupId;
      }
      return false;
    },
    [selectedId, selectedGroupId, getId, getGroupId],
  );
  // Durable render key (see SidebarRailShellProps.getReconcileId): keeps an
  // optimistic stub and its resolved row as the SAME element so the swap is an
  // in-place update, not a remount. Defaults to the numeric id.
  const rowKey = (row: TRow): string | number => (getReconcileId ? getReconcileId(row) : getId(row));
  // Operator-facing row identity — the SAME chain the parked collapse-pin peek uses, so the ⋮ trigger's accessible name ("Actions for …")…
  const rowLabel = (row: TRow): string =>
    getCollapsePinLabel?.(row) ?? getStatusDotLabel?.(row) ?? String(getId(row));

  const {
    editMode, showSkeleton, isFetching, rows, grouped,
    collapsedGroups, toggleGroup, listRef, focusIndex, setFocusIndex,
    handleKeyDown, handleEditClick, getRowDisabled,
  } = useSidebarRail(props);

  // Nav-keys (opt-in). Recent rows carry no stable identity letter, so the
  // resolver assigns them deterministically in visible order. Inert unless the
  // rail passed `navRegionId`. Commit runs the same `onSelect` a click would.
  const navTargets = useMemo(() => rows.map((r) => ({ id: String(getId(r)) })), [rows, getId]);
  const { armed: navArmed, keymap: navKeymap } = useNavRegion({
    id: navRegionId,
    targets: navTargets,
    onCommit: (targetId) => {
      const row = rows.find((r) => String(getId(r)) === targetId);
      if (row && !(getRowDisabled?.(row) ?? false)) onSelect(row);
    },
  });

  useEffect(() => {
    if (contentPaintSurface && !showSkeleton) markSurfacePainted(contentPaintSurface);
  }, [contentPaintSurface, showSkeleton]);

  useEffect(() => {
    onVisibleRowsChange?.(rows);
  }, [rows, onVisibleRowsChange]);

  // Parked mid-strip MRU peek — same visible top-N the open rail paints.
  const collapseMru = useMemo(() => {
    if (!publishCollapseMru) return null;
    const top = rows.slice(0, CONTEXT_PANEL_COLLAPSE.mruPinCount);
    if (top.length === 0) return null;
    return {
      totalCount: rows.length,
      pins: top.map((row, i) => {
        const numericId = getId(row);
        const id = getReconcileId ? getReconcileId(row) : numericId;
        const statusLabel = getStatusDotLabel?.(row);
        const meta = getCollapsePinMeta?.(row)?.trim() || undefined;
        const ageRaw = getActivityAt?.(row);
        const age = ageRaw ? (railRelativeTime(ageRaw) ?? undefined) : undefined;
        const groupSize = grouped[i]?.groupSize ?? 1;
        return {
          id,
          label: getCollapsePinLabel?.(row) ?? statusLabel ?? String(numericId),
          statusDotClass: getStatusDot(row),
          statusLabel,
          meta,
          age: age && age !== '—' ? age : undefined,
          selected: rowSelected(row),
          onSelect: () => onSelect(row),
          renderPeek: (ctx: CollapseStripPeekCtx) =>
            renderPopover ? (
              renderPopover(row, {
                groupSize,
                openWorkspace: ctx.openWorkspace,
                dismiss: ctx.dismiss,
              })
            ) : (
              <RailPeekCard
                title={getCollapsePinLabel?.(row) ?? statusLabel ?? String(numericId)}
                statusLabel={statusLabel}
                statusDotClass={getStatusDot(row)}
                meta={meta}
                facts={getCollapsePinFacts?.(row) ?? []}
                age={age && age !== '—' ? age : undefined}
                onOpen={ctx.openWorkspace}
              />
            ),
        };
      }),
    };
  }, [
    publishCollapseMru,
    rows,
    grouped,
    rowSelected,
    getId,
    getReconcileId,
    getCollapsePinLabel,
    getCollapsePinMeta,
    getCollapsePinFacts,
    getActivityAt,
    getStatusDot,
    getStatusDotLabel,
    onSelect,
    renderPopover,
  ]);
  usePublishCollapsePins(collapseMru);

  // Latches TRUE the moment this feed first paints rows, and stays true for the component's whole life.
  const [listPainted, setListPainted] = useState(false);
  useEffect(() => {
    if (rows.length > 0) setListPainted(true);
  }, [rows.length]);

  // One-shot guard: freeze "has this rail already revealed this session" at mount
  // (a `useState` initializer runs once), so it can NEVER flip mid-mount and cut
  // the cascade — and a REMOUNT reads the registry fresh and skips the reveal.
  const revealKey = contentPaintSurface ?? eyebrowTitle;
  const [alreadyRevealed] = useState(() => revealedRails.has(revealKey));
  useEffect(() => {
    if (staggerReveal) revealedRails.add(revealKey);
  }, [staggerReveal, revealKey]);

  // The container drives the cascade for the whole mount and then simply HOLDS `show` — it is never disarmed.
  const staggerActive = staggerReveal && rows.length > 0 && !showSkeleton && !alreadyRevealed;

  const reduceMotion = useReducedMotion();
  // STABLE identity across renders.
  const staggerItemVariants = useMemo<Variants | undefined>(() => {
    if (!staggerReveal) return undefined;
    if (reduceMotion) {
      return { hidden: { opacity: 1 }, show: { opacity: 1, transition: { duration: 0.001 } }, exit: { opacity: 0 } };
    }
    return staggerRevealMotion === 'slide'
      ? staggerRevealSidebarSlideItem
      : staggerRevealMotion === 'rise'
        ? staggerRevealRiseItem
        : staggerRevealSidebarItem;
  }, [staggerReveal, reduceMotion, staggerRevealMotion]);
  const staggerContainerVariants = useMemo(
    () => staggerRevealContainer(reduceMotion ? 0 : STAGGER_REVEAL_STEP),
    [reduceMotion],
  );
  // scanDock: list host is flush (`SIDEBAR_RAIL_INSET_X` = px-0) so selection
  // washes edge-to-edge. Content column pad lives inside each RailRow / the
  // dense scan bar (gutter + SIDEBAR_SCAN_DOCK_LEADING_ROW).
  const listInsetX = railInset === 'scanDock' ? SIDEBAR_RAIL_INSET_X : SIDEBAR_GUTTER;
  // scanDock rails sit directly under a scan band (`receivingScanBandClass`), which already paints its own bottom hairline…
  const sectionTopRule = railInset === 'scanDock' ? null : 'border-t border-border-hairline';
  // HARD CONSTRAINTS (2026-08-24):

  return (
    // No eyebrow band.
    // an edit pencil at its right; the operator removed it 2026-08-22. It spent a
    <section className={cn('min-w-0', sectionTopRule, appSurfaceFillClass('chrome'))}>
      {showSkeleton ? null : (
        <>
          {/* Mount the list host only once rows have painted (`listPainted` latches on the first non-empty render and stays true so the last carton… */}
          {listPainted || rows.length > 0 ? (
          <motion.ul
            ref={listRef}
            // No vertical pad on the list itself — see the hard-constraints
            // note above. The first row's own uniform `py-1` is the only
            // clearance under the scan band.
            className={`${listInsetX} overflow-x-clip outline-none ${isFetching ? 'opacity-90' : ''}`}
            role="listbox"
            aria-label={`${eyebrowTitle} activity`}
            aria-busy={isFetching || undefined}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            {...(staggerActive
              ? { initial: 'hidden' as const, animate: 'show' as const, variants: staggerContainerVariants }
              : {})}
          >
            {/* `initial` enabled only for the reveal so the first-load cascade plays; otherwise AnimatePresence suppresses the initial mount animation. */}
            <AnimatePresence initial={staggerActive} mode="sync">
              {rows.flatMap((row, idx) => {
                const g = grouped[idx];
                const isCollapsed = g.groupId != null && collapsedGroups.has(g.groupId);
                if (isCollapsed && g.groupIndex > 0) return [];
                const isLeaderOfMulti = g.groupSize > 1 && g.groupIndex === 0 && g.groupId != null;
                const showExpandedHeader = isLeaderOfMulti && !isCollapsed;
                const nodes: React.ReactElement[] = [];
                if (showExpandedHeader) {
                  nodes.push(
                    <PkgGroupHeader key={`pkg-${g.groupId}`} groupSize={g.groupSize} isCollapsed={false} staggerItemVariants={staggerItemVariants} onToggle={() => toggleGroup(g.groupId as number)} />,
                  );
                }
                nodes.push(
                  <RailRow
                    key={rowKey(row)}
                    reconcileKey={rowKey(row)}
                    row={row}
                    index={idx}
                    staggerItemVariants={staggerItemVariants}
                    isDisabled={getRowDisabled?.(row) ?? false}
                    isSelected={rowSelected(row)}
                    isFocused={idx === focusIndex}
                    editActive={editMode.active}
                    isChecked={editMode.active && editMode.selectedIds.has(getId(row))}
                    groupSize={g.groupSize}
                    groupIndex={g.groupIndex}
                    isCollapsed={isCollapsed}
                    showInlinePkgChip={isLeaderOfMulti && isCollapsed}
                    navKey={navArmed ? navKeymap.get(String(getId(row))) : undefined}
                    onToggleGroup={isLeaderOfMulti ? () => toggleGroup(g.groupId as number) : undefined}
                    getStatusDot={getStatusDot}
                    getStatusDotLabel={getStatusDotLabel}
                    getActivityAt={getActivityAt}
                    renderRowMain={renderRowMain}
                    renderPopover={renderPopover}
                    rowLabel={rowLabel(row)}
                    rowActions={rowActions?.(row, {
                      openWorkspace: () => onSelect(row),
                      rowLabel: rowLabel(row),
                    })}
                    onClick={(e) => {
                      if (getRowDisabled?.(row)) return;
                      setFocusIndex(idx);
                      if (editMode.active) handleEditClick(idx, e?.shiftKey ?? false);
                      else onSelect(row);
                    }}
                  />,
                );
                return nodes;
              })}
            </AnimatePresence>
          </motion.ul>
          ) : null}
          {rows.length === 0 && !isFetching ? (
            <p className={`${listInsetX} py-3 text-role-micro font-semibold text-text-faint`}>{emptyText}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
