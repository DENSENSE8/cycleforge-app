'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Variants } from '@/design-system/motion';
import { markSurfacePainted } from '@/lib/observability/paint-timing';
import {
  SIDEBAR_GUTTER,
  SIDEBAR_RAIL_DOT_TRACK,
  SIDEBAR_RAIL_INSET_LEFT,
  SIDEBAR_RAIL_INSET_X,
  SIDEBAR_RAIL_TRAILING_TRACK_CLASS,
  SIDEBAR_SCAN_DOCK_LEADING_ROW,
  STATION_SECONDARY_BAND_FACE,
} from '@/components/layout/header-shell';
import { CONTEXT_PANEL_COLLAPSE } from '@/components/sidebar/context-panel-column';
import {
  usePublishCollapsePins,
  type CollapseStripPeekCtx,
} from '@/components/sidebar/context-panel-collapse-context';
import { appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
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
import { RailEditPencil } from './rail-shell/RailEditPencil';
import { RailRow } from './rail-shell/RailRow';
import { PkgGroupHeader } from './rail-shell/PkgGroupHeader';
import {
  railRelativeTime,
  type SidebarRailShellProps,
} from './rail-shell/sidebar-rail-shared';

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
    onVisibleRowsChange,
    publishCollapseMru = false,
    getCollapsePinLabel,
    getCollapsePinMeta,
    getCollapsePinFacts,
    getId, getReconcileId, getActivityAt, onSelect, getStatusDot, getStatusDotLabel,
    renderRowMain, renderPopover, navRegionId,
    selectedRow, getGroupId,
  } = props;

  // Carton-aware selection (SoT default): a recent rail grouped by a parent
  // (`getGroupId` = carton `receiving_id`) must keep the parent's row lit while
  // the active CHILD moves between siblings — matching only `getId(row) ===
  // selectedId` drops the glow the moment a sibling (whose line id is not the
  // rail's representative row) becomes active. Whenever the surface exposes both
  // a `selectedRow` and a `getGroupId`, we also match by group; a rail that
  // exposes neither is unchanged (strict per-row id highlight).
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

  const {
    editMode, showSkeleton, isFetching, rows, topCount, grouped,
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
  // Pin hover always opens a RailPopover card: the rail's own `renderPopover`
  // when it has one (Receiving), else the shared `RailPeekCard` built from the
  // feed's typed identity facts. Never a text-only twin.
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
  // there is no settle-time flicker. Rows never carry Framer `layout` —
  // projection rubber-bands the feed on every context-column resize (see RailRow).
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
  // scanDock: list host is flush (`SIDEBAR_RAIL_INSET_X` = px-0) so selection
  // washes edge-to-edge; eyebrow matches. Content column pad lives inside each
  // RailRow / the dense scan bar (gutter + SIDEBAR_SCAN_DOCK_LEADING_ROW).
  const listInsetX = railInset === 'scanDock' ? SIDEBAR_RAIL_INSET_X : SIDEBAR_GUTTER;
  const eyebrowOuterX = railInset === 'scanDock' ? SIDEBAR_RAIL_INSET_X : SIDEBAR_GUTTER;

  return (
    <section className={cn('min-w-0 border-t border-border-hairline', appSurfaceFillClass('chrome'))}>
      {!hideEyebrow ? (
        <div
          className={cn(
            'flex items-center justify-between',
            STATION_SECONDARY_BAND_FACE,
            eyebrowOuterX,
          )}
        >
          {/* Nested gutter + leading track — same content column as RailRow. */}
          <div className={cn(railInset === 'scanDock' ? SIDEBAR_RAIL_INSET_LEFT : null, 'min-w-0')}>
            <div className={SIDEBAR_SCAN_DOCK_LEADING_ROW}>
              <span className={cn(SIDEBAR_RAIL_DOT_TRACK, 'shrink-0')} aria-hidden />
              <p data-rail-eyebrow className="text-role-eyebrow uppercase tracking-widest text-text-soft">
                {eyebrowTitle} · {topCount}
              </p>
            </div>
          </div>
          <div
            className={cn(
              'flex items-center gap-2',
              railInset === 'scanDock' ? SIDEBAR_RAIL_TRAILING_TRACK_CLASS : null,
            )}
          >
            {eyebrowAction
              ? eyebrowAction
              : eyebrowSuffix && (
                  // leading-none: without it the 8.5px suffix inherits the base
                  // line-height (1.5 ≈ 12.75px), taller than the 9px/lh-1.2 eyebrow
                  // title — which made the suffixed rail (Unfound) ~2px taller than
                  // the action-button rail (Found). Tight leading lets the title
                  // govern the row height so both eyebrows align.
                  <p className="text-role-micro uppercase leading-none tracking-widest text-text-faint">{eyebrowSuffix}</p>
                )}
            {editMode.enabled ? (
              <RailEditPencil active={editMode.active} onToggle={editMode.toggleActive} />
            ) : null}
          </div>
        </div>
      ) : null}
      {showSkeleton ? (
        // Column-scoped: the field sizes to the rail, so the rail sweeps on its
        // own clock instead of showing a slice of the middle's pass. It replaced
        // four pulsing bars — the last drawn skeleton in the rail engine.
        <div className="relative min-h-40 flex-1">
          <UniversalLoader isLoading label="Loading recent activity" />
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
                `sync` (not popLayout) — popLayout runs layout projection and
                rubber-bands the feed when the column width changes mid-session. */}
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
