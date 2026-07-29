'use client';

/**
 * Workbench page-shell recipe — the shared "padded + tabbed" body used by the
 * golden pages (Dashboard · Shipping) and the convergence target for every
 * full-bleed workbench surface (Outbound, Receiving incoming/history/repair).
 * See `docs/todo/display-convergence-log.md` → Axis 5.
 *
 * Compose with {@link DashboardScrollShell}:
 *   <DashboardScrollShell
 *     chrome={<div className={WORKBENCH_CHROME_COLUMN}><WorkbenchChromeHeader … /></div>}
 *   >
 *     <div className={WORKBENCH_BODY_COLUMN}> KPI (scrolls away) · framed table </div>
 *   </DashboardScrollShell>
 *
 * The collection table sits in the gutter column inside the ops table-surface
 * shell (`TABLE_SURFACE_*` — rounded-xl, raised lift, strong frozen header).
 * Do not hand-roll a second card around it; KPI tiles + the chrome strip are
 * sibling raised surfaces, not nested wrappers.
 */

import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { MONITOR_SECTION_CARD_SCROLL_CLASS } from '@/design-system/components/monitor';
// Dependency-free geometry module on purpose — importing the capsule component
// itself would pull framer-motion + the icon set into every layout consumer.
import { SELECTION_BAR_SCROLL_INSET } from '@/design-system/components/selection-bar-geometry';
import { cn } from '@/utils/_cn';

/** Centered max-width gutter column — the one horizontal-inset SoT (chrome + body share it). */
export const WORKBENCH_GUTTERS = 'mx-auto w-full max-w-[1440px] min-w-0 px-4 sm:px-6 lg:px-8';
/** Chrome-slot wrapper: the pinned header band lives here (outside the scroll port). */
export const WORKBENCH_CHROME_COLUMN = cn(WORKBENCH_GUTTERS, 'py-2');
/** Scroll-body column: KPI strip (scrolls away) then the framed ops table. */
export const WORKBENCH_BODY_COLUMN = cn('relative flex flex-col', WORKBENCH_GUTTERS, 'pb-8 pt-4');

/**
 * Bounded host for a framed ops table that sits **under the KPI strip**
 * (Pending · Packed · Shipped · Labels). Sizes the grid to the viewport
 * remainder so the table owns Y scroll internally and the page does not grow.
 *
 * This is a depth contract, not just layout. `TABLE_SURFACE_*` frames the grid
 * as a raised card; an unbounded host lets that card grow past the fold, so its
 * bottom edge — and the elevation that sells the card — is never on screen. A
 * bounded host keeps all four edges visible and keeps the KPI strip pinned
 * instead of scrolling away under the tabs.
 *
 * `13rem` ≈ global header + workbench tab chrome + KPI strip + gutters.
 */
export const WORKBENCH_TABLE_VIEWPORT = 'h-[calc(100dvh-13rem)] min-h-[24rem] min-w-0';

/** {@link WORKBENCH_TABLE_VIEWPORT} for lanes with **no KPI strip** (Review). */
export const WORKBENCH_TABLE_VIEWPORT_NO_KPI = 'h-[calc(100dvh-8rem)] min-h-[24rem] min-w-0';

/** Bottom inset a bounded table host uses when nothing floats over it. */
const WORKBENCH_TABLE_VIEWPORT_INSET = 'pb-3';

/**
 * {@link WORKBENCH_TABLE_VIEWPORT} plus the right bottom inset for the lane.
 *
 * The bounded host is what makes this necessary: the grid sizes itself to the
 * host's CONTENT box and self-scrolls inside it, so its last row ends exactly
 * at the host's bottom edge — under the pinned bulk-selection capsule, which is
 * `fixed` to the viewport. Padding the page's outer scroll body does nothing
 * here; only the bounded host can move that edge.
 *
 * `bulkBarInset` is per-render, not permanent: reserving the capsule's height
 * on every grid all the time would cost ~1.5 rows of a warehouse monitor for a
 * bar that is usually not there.
 */
export function workbenchTableViewportClass(
  opts: { bulkBarInset?: boolean; noKpi?: boolean } = {},
): string {
  return cn(
    opts.noKpi ? WORKBENCH_TABLE_VIEWPORT_NO_KPI : WORKBENCH_TABLE_VIEWPORT,
    opts.bulkBarInset ? SELECTION_BAR_SCROLL_INSET : WORKBENCH_TABLE_VIEWPORT_INSET,
  );
}

/**
 * Padded, boxed table pane — the gutter column + one monitor card wrapping a
 * fixed-height, self-scrolling table (header band + scroll list). The shared
 * "was full-bleed → padded" body used by sidebar-mode surfaces whose modes stay
 * in the sidebar (Outbound Labels/Scan-out, Receiving incoming/history, Walk-in
 * repair). Caller owns the outer element (its bg / `relative` / height); this is
 * the gutter + card only. Compose it as a flex child of a flex parent.
 */
export function WorkbenchTablePane({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(WORKBENCH_GUTTERS, 'flex min-h-0 min-w-0 flex-1 flex-col pb-4 pt-3', className)}>
      <div className={cn(MONITOR_SECTION_CARD_SCROLL_CLASS, 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden')}>
        {children}
      </div>
    </div>
  );
}

type TabSwitchTabs = React.ComponentProps<typeof TabSwitch>['tabs'];
type TabSwitchSolidTone = React.ComponentProps<typeof TabSwitch>['solidTone'];

export interface WorkbenchChromeHeaderProps {
  tabs: TabSwitchTabs;
  activeTab: string;
  onTabChange: (id: string) => void;
  /** Solid-pill accent (forwarded to `TabSwitch`); defaults to its `inverse`. */
  solidTone?: TabSwitchSolidTone;
  /**
   * Scoped list-filter search field — the one header search slot, positioned
   * consistently on every workbench page (leads the right cluster, before
   * `right`). Pass a `SearchField`; the ⌘K global header pill stays separate.
   */
  search?: ReactNode;
  /** Right-aligned filters/controls, rendered left of the toolbar portal. */
  right?: ReactNode;
  /**
   * Far-right chrome slot — always after the table-controls portal (e.g. Import
   * / Add CTAs). Owned by the workspace so it stays top-right even before a
   * table mounts or when the portal is empty. Row select lives in the table
   * left gutter, not here.
   */
  trailing?: ReactNode;
  /** Ref for the table-toolbar portal target (tables `createPortal` into it). */
  controlsSlotRef?: Ref<HTMLDivElement>;
  /** Extra attrs for the portal div — e.g. `{ 'data-outbound-controls': '' }`. */
  controlsSlotProps?: HTMLAttributes<HTMLDivElement> & Partial<Record<`data-${string}`, string>>;
  className?: string;
}

/**
 * The rounded-card tab strip: solid `TabSwitch` left · flex spacer · right
 * controls + toolbar portal · trailing CTAs. The single content-chrome tab
 * band for every workbench page (replaces the sidebar mode rail on migrating
 * surfaces).
 */
export function WorkbenchChromeHeader({
  tabs,
  activeTab,
  onTabChange,
  solidTone,
  search,
  right,
  trailing,
  controlsSlotRef,
  controlsSlotProps,
  className,
}: WorkbenchChromeHeaderProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 shrink-0 items-center gap-3 rounded-2xl border border-border-soft bg-surface-card px-2.5 py-1.5 shadow-sm',
        className,
      )}
    >
      {/*
        The tab rail may SHRINK and scroll; the controls block may not.

        Both used to be `shrink-0`, so a header with enough tabs (Media Library
        runs seven lifecycle facets) overflowed its own row and clipped the right
        controls — filter / sort / media-type menus — clean off the viewport with
        no way to reach them. Navigation degrading to a scrollable strip is
        recoverable; an action you cannot see or click is not, so the tabs yield
        first. Surfaces whose header already fits are unaffected: `min-w-0` only
        engages once the row would otherwise overflow.
      */}
      <TabSwitch
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        // `scrollable` is TabSwitch's own overflow mode — it sets the track to
        // `w-max` so tabs keep their natural width instead of compressing, and
        // scrolls the active tab into view. Hand-rolling `overflow-x-auto` here
        // instead would leave the track at `w-full`, squeezing labels mid-word.
        scrollable
        className="w-auto min-w-0 shrink"
        variant="solid"
        solidTone={solidTone}
        countStyle="plain"
        railClassName="rounded-full border border-border-default bg-surface-card p-1 shadow-sm"
      />

      <div className="min-w-0 flex-1" aria-hidden />

      <div className="flex shrink-0 items-center gap-2">
        {search}
        {right}
        <div ref={controlsSlotRef} className="flex shrink-0 items-center gap-2" {...controlsSlotProps} />
        {trailing}
      </div>
    </div>
  );
}
