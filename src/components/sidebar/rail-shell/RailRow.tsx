'use client';

import { useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { Variants } from '@/design-system/motion';
import { motion, AnimatePresence } from '@/design-system/motion';
import { framerPresence, framerTransition, motionBezier } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { SIDEBAR_RAIL_INSET_LEFT } from '@/components/layout/header-shell';
import { Check, ChevronDown } from '@/components/Icons';
import { CompactActivityRow } from '@/components/ui/CompactActivityRow';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { NAV_KEY_HINT_CLASS } from '@/lib/keyboard/nav-keys';
import { cn } from '@/utils/_cn';
import type { SidebarRailRowContext } from './sidebar-rail-shared';
import { RailPopover } from './RailPopover';
import { useRailHoverPreview } from './useRailHoverPreview';

/**
 * No-op `onUpdate` — its mere presence forces framer to run the row's reveal on
 * the MAIN-THREAD (JS) animator instead of the compositor (WAAPI). The WAAPI path
 * has a one-frame commit gap on completion that flashed the `hidden` opacity:0
 * back through as each row's fade-in finished; the JS animator writes the value
 * every frame and commits cleanly, so the "appear from nothing" fade has no blink.
 */
const keepOnMainThread = () => {};

export function RailRow<TRow>({
  row, index, isSelected, isFocused, editActive, isChecked, isDisabled, groupSize, groupIndex, isCollapsed, showInlinePkgChip,
  staggerItemVariants, onToggleGroup, getStatusDot, getStatusDotLabel, getActivityAt, renderRowMain, renderPopover, onClick, navKey,
}: {
  row: TRow;
  index: number;
  /** Reveal-on-arm nav-key letter — present only while this rail's region is armed. */
  navKey?: string | null;
  isSelected: boolean;
  isFocused: boolean;
  editActive: boolean;
  isChecked: boolean;
  isDisabled?: boolean;
  groupSize: number;
  groupIndex: number;
  isCollapsed: boolean;
  showInlinePkgChip: boolean;
  /** Present on stagger rails — the row rides the parent ul's `show` timeline via
   * these variants. Never pair with Framer `layout` — projection rubber-bands
   * every row when the context column resizes (Displays dual-rail / sash). */
  staggerItemVariants?: Variants;
  onToggleGroup?: () => void;
  getStatusDot: (row: TRow) => string;
  getStatusDotLabel?: (row: TRow) => string;
  getActivityAt?: (row: TRow) => string | null | undefined;
  renderRowMain: (row: TRow, ctx: SidebarRailRowContext) => ReactNode;
  renderPopover?: (row: TRow, ctx: { groupSize: number; openWorkspace: () => void; dismiss: () => void }) => ReactNode;
  /** Event is absent when invoked synthetically (popover "Open →"). */
  onClick: (e?: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const isGrouped = groupSize > 1;
  const isGroupLast = isGrouped && groupIndex === groupSize - 1;
  const isLeader = isGrouped && groupIndex === 0;
  const railIsFirst = isCollapsed ? isLeader : false;
  const railIsLast = isCollapsed ? isLeader : isGroupLast;

  const rowRef = useRef<HTMLLIElement | null>(null);
  // Shared hover-preview engine. Disabled in edit mode — that surface is for
  // picking rows, and the popover's "Open →" CTA contradicts click-to-check.
  const { isOpen: previewOpen, scheduleOpen, scheduleClose, dismiss } = useRailHoverPreview({
    enabled: Boolean(renderPopover) && !editActive && !isDisabled,
  });

  const crudPresence = useMotionPresence(framerPresence.sidebarRailRow);
  const crudTransition = useMotionTransition(framerTransition.sidebarRailRowMount);

  const pkgChip = showInlinePkgChip ? (
    <HoverTooltip label={`Expand — show ${groupSize - 1} more in this package`} asChild focusable={false}>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onToggleGroup?.(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggleGroup?.(); } }}
        aria-expanded={false}
        aria-label="Expand package"
        className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded bg-indigo-100 px-1 py-px text-role-micro uppercase tracking-widest text-indigo-700 transition-colors hover:bg-indigo-200"
      >
        <motion.span animate={{ rotate: -90 }} transition={{ duration: 0.18, ease: motionBezier.easeOut }} className="inline-flex">
          <ChevronDown className="h-2.5 w-2.5" />
        </motion.span>
        PKG · {groupSize}
        <span className="ml-0.5 text-indigo-500/80">·</span>
        <span className="text-indigo-500/80">+{groupSize - 1}</span>
      </span>
    </HoverTooltip>
  ) : null;

  const activityAt = getActivityAt?.(row);

  // Stagger rails: the row carries only `variants` for its whole mount and rides
  // the parent <ul>'s `show` timeline by inheritance — the container orchestrates
  // the first-load cascade, then simply holds `show`, and the row rests there. We
  // never swap this row to an explicit initial/animate contract mid-mount: doing
  // so re-touched `initial="hidden"` on the settled row and flickered it back
  // toward `hidden` for a frame. The variant's own `exit` left-slides on dismiss
  // (matches CRUD presence), and a scan-in row entering the same AnimatePresence
  // slides in from `hidden`. Non-stagger rails have no variants and use CRUD
  // presence for scan-in / dismiss.
  const motionProps = staggerItemVariants
    ? { variants: staggerItemVariants, onUpdate: keepOnMainThread }
    : {
        initial: crudPresence.initial,
        animate: crudPresence.animate,
        exit: { ...crudPresence.exit, pointerEvents: 'none' as const },
        transition: crudTransition,
      };

  return (
    <motion.li
      ref={rowRef}
      role="option"
      aria-selected={editActive ? isChecked : isSelected}
      // Presence only (scan-in / dismiss) — NEVER Framer `layout`. Layout
      // projection FLIPs every row when the context column width changes
      // (sash / Displays dual-rail), so the recent rail rubber-bands while
      // Displays snaps. Sibling reflow on dismiss is instant CSS — same as
      // the right panel.
      {...motionProps}
      // Full-bleed host: selection wash / ring paints edge-to-edge. Content
      // column pad nests inside (gutter + SIDEBAR_SCAN_DOCK_LEADING_ROW) so
      // titles still share the dense scan-dock column with the scan bar.
      className="relative"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      {isGrouped ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute left-0 z-10 w-[2px] bg-indigo-300 ${
            railIsFirst
              ? railIsLast ? 'top-1 bottom-1 rounded-full' : 'top-1 bottom-0 rounded-t-full'
              : railIsLast ? 'top-0 bottom-1 rounded-b-full' : 'inset-y-0'
          }`}
        />
      ) : null}
      <button
        type="button"
        data-rail-row
        data-rail-index={index}
        tabIndex={-1}
        disabled={isDisabled}
        aria-disabled={isDisabled || undefined}
        onClick={onClick}
        onMouseDown={(e) => { if (editActive && e.shiftKey) e.preventDefault(); }}
        className={cn(
          'ds-raw-button group relative w-full text-left transition-colors',
          isDisabled ? 'cursor-wait opacity-80' : '',
          (editActive ? isChecked : isSelected)
            ? cn(QUEUE_ROW.selectedClass, 'py-1')
            : `py-1 ${isFocused ? 'bg-surface-canvas ring-1 ring-inset ring-border-soft' : 'hover:bg-surface-hover'}`,
        )}
      >
        {/* Nested pads ADD (outer gutter + leading pl-2) — never stack both pl-*
            on one node or Tailwind collapses them. CompactActivityRow owns the
            status-mark · title/meta · short-age face (SoT). */}
        <span className={cn(SIDEBAR_RAIL_INSET_LEFT, 'block w-full')}>
          <CompactActivityRow
            leading={
              editActive ? (
                <span
                  aria-hidden
                  data-rail-select-box
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                    isChecked ? 'border-blue-600 bg-blue-600 text-white' : 'border-border-default bg-surface-card'
                  }`}
                >
                  {isChecked ? <Check className="h-2.5 w-2.5" /> : null}
                </span>
              ) : getStatusDotLabel ? (
                <HoverTooltip label={getStatusDotLabel(row)} focusable={false} asChild>
                  <span
                    data-rail-status-dot
                    className={`block h-2 w-2 shrink-0 rounded-full ${getStatusDot(row)}`}
                    aria-label={getStatusDotLabel(row)}
                  />
                </HoverTooltip>
              ) : (
                <span
                  data-rail-status-dot
                  className={`h-2 w-2 shrink-0 rounded-full ${getStatusDot(row)}`}
                  aria-hidden
                />
              )
            }
            activityAt={getActivityAt ? activityAt : undefined}
            showAgeColumn={Boolean(getActivityAt)}
          >
            <div data-rail-row-title className="min-w-0">
              {renderRowMain(row, { isSelected, isFocused, pkgChip })}
            </div>
          </CompactActivityRow>
        </span>
      </button>
      {/* Reveal-on-arm nav-key keycap — absolute so it never reflows the row;
          present only while this rail's region is armed by the leader. */}
      {navKey ? (
        <span
          aria-hidden
          data-rail-nav-key=""
          className={cn(
            NAV_KEY_HINT_CLASS,
            'pointer-events-none absolute right-1.5 top-1/2 z-raised -translate-y-1/2',
          )}
        >
          {navKey}
        </span>
      ) : null}
      <AnimatePresence>
        {previewOpen && renderPopover ? (
          <RailPopover anchorEl={rowRef.current} onMouseEnter={scheduleOpen} onMouseLeave={scheduleClose} onDismiss={dismiss}>
            {renderPopover(row, { groupSize, openWorkspace: onClick, dismiss })}
          </RailPopover>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}
