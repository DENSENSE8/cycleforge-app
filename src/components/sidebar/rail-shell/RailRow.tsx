'use client';

import { useState, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { Variants } from '@/design-system/motion';
import { motion } from '@/design-system/motion';
import { motionPresence, motionTransition, motionBezier } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { SIDEBAR_RAIL_INSET_LEFT } from '@/components/layout/header-shell';
import { Check, ChevronDown } from '@/components/Icons';
import { CompactActivityRow } from '@/components/ui/CompactActivityRow';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { NAV_KEY_HINT_CLASS } from '@/lib/keyboard/nav-keys';
import { cn } from '@/utils/_cn';
import type { SidebarRailRowContext } from './sidebar-rail-shared';
import { RailPopover } from './RailPopover';
import { RailRowMenu } from './RailRowMenu';
import type { RailRowAction } from './rail-row-actions';
import { useRailHoverPreview } from './useRailHoverPreview';

/** No-op `onUpdate` — its mere presence forces Motion to run the row's reveal on the MAIN-THREAD (JS) animator instead of the compositor… */
const keepOnMainThread = () => {};

/** Hides the row's trailing age while the ⋮ is showing. */
const AGE_YIELDS_TO_ROW_MENU = cn(
  '[&_[data-compact-activity-age]]:transition-opacity [&_[data-compact-activity-age]]:duration-100',
  'group-hover/railrow:[&_[data-compact-activity-age]]:opacity-0',
  'group-focus-within/railrow:[&_[data-compact-activity-age]]:opacity-0',
  'group-data-[rail-row-menu-armed]/railrow:[&_[data-compact-activity-age]]:opacity-0',
  'coarse:[&_[data-compact-activity-age]]:opacity-0',
);

export function RailRow<TRow>({
  row, index, isSelected, isFocused, editActive, isChecked, isDisabled, groupSize, groupIndex, isCollapsed, showInlinePkgChip,
  staggerItemVariants, onToggleGroup, getStatusDot, getStatusDotLabel, getActivityAt, renderRowMain, renderPopover, onClick, navKey, reconcileKey,
  rowActions, rowLabel,
}: {
  row: TRow;
  index: number;
  /** The row's durable React key, mirrored onto the DOM. */
  reconcileKey?: string | number;
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
   * these variants. Never pair with Motion `layout` — projection rubber-bands
   * every row when the context column resizes (Displays dual-rail / sash). */
  staggerItemVariants?: Variants;
  onToggleGroup?: () => void;
  getStatusDot: (row: TRow) => string;
  getStatusDotLabel?: (row: TRow) => string;
  getActivityAt?: (row: TRow) => string | null | undefined;
  renderRowMain: (row: TRow, ctx: SidebarRailRowContext) => ReactNode;
  renderPopover?: (row: TRow, ctx: { groupSize: number; openWorkspace: () => void; dismiss: () => void }) => ReactNode;
  /**
   * This row's overflow (⋮) menu items, already resolved by the shell. Empty
   * (the default) paints no trigger at all — see {@link RailRowMenu}.
   */
  rowActions?: RailRowAction[];
  /** Row identity for the ⋮ trigger's accessible name (`Actions for {rowLabel}`). */
  rowLabel?: string;
  /** Event is absent when invoked synthetically (popover "Open →"). */
  onClick: (e?: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const isGrouped = groupSize > 1;
  const isGroupLast = isGrouped && groupIndex === groupSize - 1;
  const isLeader = isGrouped && groupIndex === 0;
  const railIsFirst = isCollapsed ? isLeader : false;
  const railIsLast = isCollapsed ? isLeader : isGroupLast;

  const rowRef = useRef<HTMLLIElement | null>(null);
  const hasRowMenu = (rowActions?.length ?? 0) > 0 && !editActive && !isDisabled;
  const [menuOpen, setMenuOpen] = useState(false);
  // Shared hover-preview engine.
  const { isOpen: previewOpen, scheduleOpen, scheduleClose, dismiss } = useRailHoverPreview({
    enabled: Boolean(renderPopover) && !editActive && !isDisabled && !menuOpen,
  });

  const crudPresence = useMotionPresence(motionPresence.sidebarRailRow);
  const crudTransition = useMotionTransition(motionTransition.sidebarRailRowMount);

  const pkgChip = showInlinePkgChip ? (
    <HoverTooltip label={`Expand — show ${groupSize - 1} more in this package`} asChild focusable={false}>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onToggleGroup?.(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggleGroup?.(); } }}
        aria-expanded={false}
        aria-label="Expand package"
        className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded bg-indigo-100 px-1 py-px text-role-micro text-indigo-700 transition-colors hover:bg-indigo-200"
      >
        <motion.span animate={{ rotate: -90 }} transition={{ duration: 0.18, ease: motionBezier.easeOut }} className="inline-flex">
          <ChevronDown className="h-2.5 w-2.5" />
        </motion.span>
        Pkg · {groupSize}
        <span className="ml-0.5 text-indigo-500/80">·</span>
        <span className="text-indigo-500/80">+{groupSize - 1}</span>
      </span>
    </HoverTooltip>
  ) : null;

  const activityAt = getActivityAt?.(row);

  // Stagger rails:
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
      // Presence only (scan-in / dismiss) — NEVER Motion `layout`.
      {...motionProps}
      // Full-bleed host:
      className="group/railrow relative"
      // Set while the ⋮ menu is OPEN, so the age stays hidden after the pointer
      // has left the row to travel into the menu. Hover and focus cover the
      // other two entrances; this covers the one CSS cannot see.
      data-rail-row-menu-armed={hasRowMenu && menuOpen ? '' : undefined}
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
        data-rail-key={reconcileKey}
        tabIndex={-1}
        disabled={isDisabled}
        aria-disabled={isDisabled || undefined}
        onClick={onClick}
        onMouseDown={(e) => { if (editActive && e.shiftKey) e.preventDefault(); }}
        // Shift+F10 / the ContextMenu key is the ARIA APG invocation for a
        // context-specific menu, and the rail's keyboard model focuses THIS
        // button (roving tabindex), so it is where the shortcut has to land.
        onKeyDown={(e) => {
          if (!hasRowMenu) return;
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen(true);
          }
        }}
        className={cn(
          'ds-raw-button group relative w-full text-left transition-colors',
          isDisabled ? 'cursor-wait opacity-80' : '',
          // HARD CONSTRAINT (2026-08-24):
          'py-1',
          (editActive ? isChecked : isSelected)
            ? QUEUE_ROW.selectedClass
            : isFocused ? 'bg-surface-canvas ring-1 ring-inset ring-border-soft' : 'hover:bg-surface-hover',
        )}
      >
        {/* SIDEBAR_RAIL_INSET_LEFT is zero (2026-08-24) — the leading row's own `pl-2` is the ONE gutter, matching GlobalHeader's nav icon inset. */}
        <span
          className={cn(
            SIDEBAR_RAIL_INSET_LEFT,
            'block w-full',
            // The ⋮ shares the trailing track with the age, and it carries no plate of its own — so the age yields the column whenever the ⋮ is up.
            hasRowMenu && AGE_YIELDS_TO_ROW_MENU,
          )}
        >
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
            // Keep the trailing cell even on a feed with no age stamp:
            showAgeColumn={Boolean(getActivityAt) || hasRowMenu}
          >
            <div data-rail-row-title className="min-w-0">
              {renderRowMain(row, { isSelected, isFocused, pkgChip })}
            </div>
          </CompactActivityRow>
        </span>
      </button>
      {/* Row overflow menu — a SIBLING of the row button (never nested: */}
      {hasRowMenu && rowActions ? (
        <RailRowMenu
          actions={rowActions}
          rowLabel={rowLabel ?? String(reconcileKey ?? index + 1)}
          open={menuOpen}
          peekOpen={previewOpen}
          onOpenChange={(next) => {
            if (next) {
              dismiss();
              requestAnimationFrame(() => setMenuOpen(true));
              return;
            }
            setMenuOpen(false);
          }}
          isFocusedRow={isFocused}
        />
      ) : null}
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
      {/* No AnimatePresence: the peek reveals instantly and has no exit. */}
      {previewOpen && renderPopover ? (
        <RailPopover anchorEl={rowRef.current} onMouseEnter={scheduleOpen} onMouseLeave={scheduleClose} onDismiss={dismiss}>
          {renderPopover(row, { groupSize, openWorkspace: onClick, dismiss })}
        </RailPopover>
      ) : null}
    </motion.li>
  );
}
