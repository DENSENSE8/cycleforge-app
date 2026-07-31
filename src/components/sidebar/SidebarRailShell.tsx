'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';
import { markSurfacePainted } from '@/lib/observability/paint-timing';
import {
  SIDEBAR_GUTTER,
  SIDEBAR_RAIL_DOT_TRACK,
  SIDEBAR_RAIL_INSET_LEFT,
  SIDEBAR_RAIL_INSET_X,
  SIDEBAR_RAIL_ROW_PAD_RIGHT,
  SIDEBAR_SCAN_DOCK_LEADING_ROW,
} from '@/components/layout/header-shell';
import { appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
import { cn } from '@/utils/_cn';
import {
  STAGGER_REVEAL_STEP,
  staggerRevealContainer,
  staggerRevealRiseItem,
  staggerRevealSidebarItem,
  staggerRevealSidebarSlideItem,
} from '@/design-system/primitives/StaggerReveal';
import { useSidebarRail } from './rail-shell/useSidebarRail';
import { RailEditPencil } from './rail-shell/RailEditPencil';
import { RailRow } from './rail-shell/RailRow';
import { PkgGroupHeader } from './rail-shell/PkgGroupHeader';
import type { SidebarRailShellProps } from './rail-shell/sidebar-rail-shared';

/**
 * Generic sidebar "recent activity" rail skeleton. Owns the reusable shell —
 * data fetch, optimistic patch, query invalidation, top-N + pinned-selection,
 * package grouping, keyboard nav, and the hover-preview popover positioning —
 * and pushes all domain-specific rendering out to render-prop slots.
 *
 * Receiving/Testing consume this via RecentActivityRailBase (which supplies the
 * ReceivingLineRow renderers); FBA supplies its own row + popover content.
 *
 * Thin composition shell: the engine lives in {@link useSidebarRail}; rows /
 * group headers / popover are presentational components under `./rail-shell/`.
 */

export { railRelativeTime, type SidebarRailRowContext, type SidebarRailShellProps } from './rail-shell/sidebar-rail-shared';
export { RailPopover } from './rail-shell/RailPopover';

/**
 * Rails that have already played their first-load reveal THIS SESSION, keyed by a
 * stable rail identity. The first-load cascade must be a genuine one-shot: a rail
 * subtree can REMOUNT shortly after its first paint (a parent Suspense boundary or
 * dynamic-import chunk resolving, a query-key churn), and a fresh mount would
 * otherwise replay `initial="hidden" animate="show"` and re-flash every row. We
 * freeze "already revealed" at mount from this registry, so any later mount
 * renders rows at rest instead. Cleared only by a full reload — exactly when a
 * fresh cascade is wanted.
 */
const revealedRails = new Set<string>();

export function SidebarRailShell<TRow>(props: SidebarRailShellProps<TRow>) {
  const {
    // `queryKey` is consumed by the engine hook via `props`; not destructured here.
    selectedId,
    eyebrowTitle, eyebrowSuffix, eyebrowAction, hideEyebrow = false,
    emptyText = 'No recent activity yet.',
    staggerReveal = false,
    // House default for every recent-activity rail: the left→right slide that
    // fades each row in from nothing (`staggerRevealSidebarSlideItem`). Rails opt
    // out to `sidebar` (y-settle) or `rise` only when a surface needs it.
    staggerRevealMotion = 'slide',
    railInset = 'gutter',
    contentPaintSurface,
    getId, getReconcileId, getActivityAt, onSelect, getStatusDot, getStatusDotLabel,
    renderRowMain, renderPopover,
  } = props;
  // Durable render key (see SidebarRailShellProps.getReconcileId): keeps an
  // optimistic stub and its resolved row as the SAME element so the swap is an
  // in-place update, not a remount. Defaults to the numeric id.
  const rowKey = (row: TRow): string | number => (getReconcileId ? getReconcileId(row) : getId(row));

  const {
    editMode, showSkeleton, isFetching, rows, topCount, grouped,
    collapsedGroups, toggleGroup, listRef, focusIndex, setFocusIndex,
    handleKeyDown, handleEditClick, getRowDisabled,
  } = useSidebarRail(props);

  useEffect(() => {
    if (contentPaintSurface && !showSkeleton) markSurfacePainted(contentPaintSurface);
  }, [contentPaintSurface, showSkeleton]);

  // Latches TRUE the moment this feed first paints rows, and stays true for the
  // component's whole life. Two jobs: (1) keep the list host mounted for the last
  // row's exit slide after the feed empties, and (2) let the host mount FRESH the
  // moment rows first arrive so it carries `initial="hidden" animate="show"` on
  // mount — which is what actually orchestrates the cascade. A host that mounted
  // empty first (snapshot rails skip the skeleton) never runs the mount-time
  // stagger for its late-arriving children, so it sat frozen at `hidden`.
  //
  // Deliberately NOT reset on a queryKey change: a feed's key can churn shortly
  // after mount (a staff/filter param resolving) with a transient 0-row window,
  // and resetting the latch there unmounted + remounted the whole `motion.ul`,
  // replaying the cascade from `hidden` (a full re-flash). A genuine feed switch
  // remounts this component from its parent key, so the latch re-inits anyway.
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

  // The container drives the cascade for the whole mount and then simply HOLDS
  // `show` — it is never disarmed. Rows inherit `show` and rest there; a scan-in
  // row entering the same AnimatePresence slides in from `hidden`, and a dismiss
  // exits via the variant `exit`. Nothing swaps the row's contract mid-mount, so
  // there is no settle-time flicker. (Stagger rows also carry no `layout` prop —
  // toggling `layout` on mid-reveal made framer re-project every row and flashed
  // them to opacity 0 for a frame; see RailRow.)
  const staggerActive = staggerReveal && rows.length > 0 && !showSkeleton && !alreadyRevealed;

  const reduceMotion = useReducedMotion();
  // STABLE identity across renders. A fresh variants object each render makes
  // framer treat a mid-cascade re-render (e.g. the authoritative fetch replacing
  // the snapshot rows) as a NEW animation target and restart the reveal from
  // `hidden` — flashing every row to opacity 0 for a frame. Memoizing pins the
  // identity so a re-render never re-triggers the container's `show` orchestration.
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
  // scanDock: list + eyebrow share SIDEBAR_RAIL_INSET_LEFT (sidebar gutter) so
  // selection rings clear the pane edge; leading `pad → track → gap` then lands
  // titles on the dense scan-dock column with the scan bar above.
  const listInsetX = railInset === 'scanDock' ? SIDEBAR_RAIL_INSET_X : SIDEBAR_GUTTER;
  const eyebrowOuterX =
    railInset === 'scanDock'
      ? cn(SIDEBAR_RAIL_INSET_LEFT, SIDEBAR_RAIL_ROW_PAD_RIGHT)
      : SIDEBAR_GUTTER;

  return (
    <section className={cn('min-w-0 border-t border-border-hairline', appSurfaceFillClass('chrome'))}>
      {!hideEyebrow ? (
        <div className={cn('flex items-center justify-between py-1', eyebrowOuterX)}>
          {/* Leading spacer = RailRow's dot track (pad → w-4 → gap) so the
              eyebrow title shares the row-title x. */}
          <div className={SIDEBAR_SCAN_DOCK_LEADING_ROW}>
            <span className={cn(SIDEBAR_RAIL_DOT_TRACK, 'shrink-0')} aria-hidden />
            <p data-rail-eyebrow className="text-role-eyebrow uppercase tracking-widest text-text-soft">
              {eyebrowTitle} · {topCount}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {eyebrowAction
              ? eyebrowAction
              : eyebrowSuffix && (
                  // leading-none: without it the 8.5px suffix inherits the base
                  // line-height (1.5 ≈ 12.75px), taller than the 9px/lh-1.2 eyebrow
                  // title — which made the suffixed rail (Unfound) ~2px taller than
                  // the action-button rail (Found). Tight leading lets the title
                  // govern the row height so both eyebrows align.
                  <p className="text-[8.5px] font-semibold uppercase leading-none tracking-widest text-text-faint">{eyebrowSuffix}</p>
                )}
            {editMode.enabled ? (
              <RailEditPencil active={editMode.active} onToggle={editMode.toggleActive} />
            ) : null}
          </div>
        </div>
      ) : null}
      {showSkeleton ? (
        <div className={`space-y-1 ${listInsetX} py-2`}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-9 w-full animate-pulse rounded-md bg-surface-sunken" />)}
        </div>
      ) : (
        <>
          {/*
            Mount the list host only once rows have painted (`listPainted` latches
            on the first non-empty render and stays true so the last carton can
            still finish its exit slide after the feed empties). Mounting FRESH at
            the first rows — rather than mounting empty at render 0 and gaining
            children later — is what lets `initial="hidden" animate="show"`
            actually orchestrate the first-load cascade. Empty copy sits below.
          */}
          {listPainted || rows.length > 0 ? (
          <motion.ul
            ref={listRef}
            className={`${listInsetX} overflow-x-clip py-0.5 outline-none ${isFetching ? 'opacity-90' : ''}`}
            role="listbox"
            aria-label={`${eyebrowTitle} activity`}
            aria-busy={isFetching || undefined}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            {...(staggerActive
              ? { initial: 'hidden' as const, animate: 'show' as const, variants: staggerContainerVariants }
              : {})}
          >
            {/* `initial` enabled only for the reveal so the first-load cascade plays;
                otherwise AnimatePresence suppresses the initial mount animation.
                popLayout lets siblings reflow while a dismissed row slides out. */}
            <AnimatePresence initial={staggerActive} mode="popLayout">
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
                    row={row}
                    index={idx}
                    staggerItemVariants={staggerItemVariants}
                    isDisabled={getRowDisabled?.(row) ?? false}
                    isSelected={getId(row) === selectedId}
                    isFocused={idx === focusIndex}
                    editActive={editMode.active}
                    isChecked={editMode.active && editMode.selectedIds.has(getId(row))}
                    groupSize={g.groupSize}
                    groupIndex={g.groupIndex}
                    isCollapsed={isCollapsed}
                    showInlinePkgChip={isLeaderOfMulti && isCollapsed}
                    onToggleGroup={isLeaderOfMulti ? () => toggleGroup(g.groupId as number) : undefined}
                    getStatusDot={getStatusDot}
                    getStatusDotLabel={getStatusDotLabel}
                    getActivityAt={getActivityAt}
                    renderRowMain={renderRowMain}
                    renderPopover={renderPopover}
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
