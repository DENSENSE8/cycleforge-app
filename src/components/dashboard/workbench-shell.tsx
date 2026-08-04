'use client';

/**
 * Workbench page-shell recipe — the shared "padded + tabbed" body used by the
 * golden pages (Dashboard · Shipping) and the convergence target for every
 * full-bleed workbench surface (Outbound, Receiving incoming/history/repair).
 * See `docs/todo/display-convergence-log.md` → Axis 5.
 *
 * Compose with {@link DashboardScrollShell}:
 *   <DashboardScrollShell
 *     chrome={<div className={WORKBENCH_SHEET_CHROME}><WorkbenchChromeHeader … /></div>}
 *   >
 *     <div className={WORKBENCH_SHEET_HOST}> sheet grid </div>
 *     // Framed (guttered) workbenches: WORKBENCH_CHROME_COLUMN / WORKBENCH_BODY_COLUMN
 *     // Sheets flush: WORKBENCH_SHEET_HOST + TABLE_SURFACE_SHEET_CLASS
 *   </DashboardScrollShell>
 *
 * Framed collection tables sit in the gutter column inside the ops table-surface
 * shell (`TABLE_SURFACE_CLIP_CLASS` — rounded-xl, raised lift). Flush
 * spreadsheets (Receiving golden) use {@link WORKBENCH_SHEET_HOST} +
 * `TABLE_SURFACE_SHEET_CLASS` — no side/bottom pad around the grid. Do not
 * hand-roll a second card around either; KPI tiles + the chrome strip are
 * sibling raised surfaces, not nested wrappers.
 */

import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { MONITOR_SECTION_CARD_SCROLL_CLASS } from '@/design-system/components/monitor';
// Dependency-free geometry module on purpose — importing the capsule component
// itself would pull framer-motion + the icon set into every layout consumer.
import { SELECTION_BAR_SCROLL_INSET } from '@/design-system/components/selection-bar-geometry';
import { cornerClass, nestedCornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/** Centered max-width gutter column — the one horizontal-inset SoT (chrome + body share it). */
export const WORKBENCH_GUTTERS = 'mx-auto w-full max-w-[1440px] min-w-0 px-4 sm:px-6 lg:px-8';
/** Chrome-slot wrapper: the pinned header band lives here (outside the scroll port).
 *  Unbox / Triage beside a floated scan dock use this same column so the 40px
 *  band face shares a Y row with `receivingScanBandClass` (panel outer `m-2`). */
export const WORKBENCH_CHROME_COLUMN = cn(WORKBENCH_GUTTERS, 'py-2');
/**
 * Scroll-body column: KPI strip then the framed ops table.
 *
 * The strip does NOT scroll away — {@link WORKBENCH_TABLE_VIEWPORT} bounds the
 * table below it, so the body never overflows by more than its own gutter and
 * the strip stays read-able beside the grid. (This comment said "scrolls away"
 * until 2026-07-31, contradicting the viewport docblock 15 lines down and the
 * E2E that asserted it.)
 * `pt-2` + chrome `py-2` = 1rem chrome→KPI, matching the KPI wrapper’s `mb-4`
 * so both seams around the strip are equal.
 */
export const WORKBENCH_BODY_COLUMN = cn('relative flex flex-col', WORKBENCH_GUTTERS, 'pb-8 pt-2');

/**
 * Flush spreadsheet body host — no horizontal gutters, no bottom float pad.
 *
 * Chrome on sheet surfaces uses {@link WORKBENCH_SHEET_CHROME} (same flush
 * left edge); framed workbenches keep {@link WORKBENCH_CHROME_COLUMN} gutters.
 * Pair with `TABLE_SURFACE_SHEET_CLASS` on the grid shell — never raw `p-0`
 * at call sites.
 *
 * Golden: Unbox (major SoT) · Incoming Pipeline · History browse.
 */
export const WORKBENCH_SHEET_HOST = 'relative flex min-h-0 min-w-0 flex-1 flex-col';

/**
 * Flush spreadsheet chrome — same left edge as {@link WORKBENCH_SHEET_HOST}.
 * No `WORKBENCH_GUTTERS` side pad: tabs / KPI / triage abut the context rail
 * hairline instead of floating as inset card islands on the sunken ground.
 * Vertical rhythm comes from the band borders themselves (no outer `py`).
 */
export const WORKBENCH_SHEET_CHROME = 'relative w-full min-w-0';

/**
 * Flush data-table triage band (Unbox Band 3 golden) — search left, refine /
 * controls right. Sits under KPI, above the sheet. `border-r` only: KPI owns
 * the seam above; the sheet owns `border-t` below. `pl-0` — flush to the sheet
 * edge (search icon lives inside the field). No vertical pad — chrome search
 * is a sunken plane edge-to-edge with this row (not a floated pill).
 *
 * Consumers: Unbox (`UnboxTriageBand` local twin), Locations, To-ship.
 */
export function WorkbenchTriageBand({
  search,
  right,
  controlsSlotRef,
  controlsSlotProps,
  className,
}: {
  search: ReactNode;
  right?: ReactNode;
  controlsSlotRef?: Ref<HTMLDivElement>;
  controlsSlotProps?: HTMLAttributes<HTMLDivElement> & Partial<Record<`data-${string}`, string>>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-10 min-w-0 shrink-0 items-stretch justify-between gap-2 border-r border-border-soft bg-surface-card pl-0 pr-0.5 shadow-sm',
        className,
      )}
    >
      <div className="flex min-w-0 shrink items-stretch">{search}</div>
      <div className="flex shrink-0 items-center gap-2 self-center">
        {right}
        {controlsSlotRef !== undefined || controlsSlotProps ? (
          <div ref={controlsSlotRef} className="flex shrink-0 items-center gap-2" {...controlsSlotProps} />
        ) : null}
      </div>
    </div>
  );
}


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
 * `15.5rem` ≈ global header + tab band + KPI strip + triage band (Sheets flush
 * chrome stack). Gutters retired on To-ship.
 */
export const WORKBENCH_TABLE_VIEWPORT = 'h-[calc(100dvh-15.5rem)] min-h-[24rem] min-w-0';

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

/**
 * Mark the hairline that separates a strip's leading **scope** tab from the
 * lane tabs after it.
 *
 * A workbench tab strip reads as one flat row of peers, but the first tab is
 * usually not a peer — it is the scope the others filter *within*: Unbox's
 * **Recent** (the cartons this operator opened) ahead of Queue · History, My
 * Day's **All** ahead of Do next · Assigned · Needs attention. The
 * hairline is what says "these are lanes of that", and putting it here rather
 * than hand-writing `dividerBefore: id === '…'` per surface keeps the two
 * strips from drifting apart — the second one is what makes this a grammar
 * instead of a decoration.
 *
 * Exactly one divider, always after index 0: a 3–4 tab strip with hairlines on
 * both sides of a middle tab reads as a rendering bug, not as grouping.
 */
export function withScopeDivider<T extends { id: string }>(
  tabs: readonly T[],
): (T & { dividerBefore?: boolean })[] {
  return tabs.map((tab, i) => (i === 1 ? { ...tab, dividerBefore: true } : { ...tab }));
}

/**
 * Trailing Display & Actions cluster — the one SoT for sort / Import / Add.
 *
 * Slot order (honest absence OK): `before` → Sort → `actions` → `after`.
 * Pass as {@link WorkbenchChromeHeader} `trailing`. Never invent an in-card
 * `TableActionBar` (sticky docking law).
 *
 * **There is deliberately no `fields` slot** (retired 2026-08-02). Column
 * visibility/display is reached from the grid's own top-right header lip
 * (`LedgerGridColumnHeader` `onOpenColumnDetails` → `GridColumnDetailsPanel`):
 * Fields mutates the column set of the card it sits on, so a page-chrome
 * control acting on that card was an altitude mismatch, and seven surfaces
 * shipped both doors onto one rail. Removing the slot — rather than merely
 * asking callers not to use it — is what keeps chrome Fields from growing
 * back. This is NOT the banned in-card action bar: the lip renders INSIDE the
 * already-sticky `[data-grid-col-header]` band, so the scroll port still has
 * exactly ONE sticky layer.
 *
 * Hybrid scan stations (Unbox / Testing / Pack): put the **return-to-scan CTA**
 * in `actions` — solid primary, every strip tab, top-right of the context bar
 * above KPIs. SoT: `.claude/rules/display/workbench.md` → Multi-region pages.
 *
 * @see docs/todo/table-action-bar-fields-PLAN.md
 */

/**
 * Solid workbench-chrome control radius — same as the band {@link TabSwitch}
 * active pill (History / Queue / …). Soft concentric corners on **all** sides
 * (`nestedCornerClass('card', 0.5)` → `rounded-xl`). Never square-flat
 * (`rounded-*-none`) against a trailing hairline — that was the wrong update.
 * Law: `source-of-truth.md` → Workbench chrome pill.
 */
export const WORKBENCH_CHROME_PILL_CLASS = nestedCornerClass('card', 0.5);

interface WorkbenchTrailingClusterProps {
  /** Escapes that precede display prefs (e.g. Incoming pagination). */
  before?: ReactNode;
  /** Quiet display sort — {@link QueueSortSwitch}. */
  sort?: ReactNode;
  /** Solid CTAs — return-to-scan (hybrid Station+Workbench) / Import / Add. */
  actions?: ReactNode;
  /** Escapes that follow CTAs (e.g. Catalog Refresh). */
  after?: ReactNode;
  /**
   * Leading hairline before this cluster. Default **only when `actions` are
   * present** — solid Import/Add CTAs need a wall from the quiet icon rail
   * (search / filters / week). A lone Sort sits flush with those peer icon
   * controls; a hairline between Calendar and Sort reads as a broken pair of
   * display icons.
   *
   * Neighbors of this hairline keep {@link WORKBENCH_CHROME_PILL_CLASS} on
   * all sides (History band-tab SoT) — never `rounded-*-none`. Law:
   * `source-of-truth.md` → Workbench chrome pill.
   */
  divide?: boolean;
  className?: string;
}

export function WorkbenchTrailingCluster({
  before,
  sort,
  actions,
  after,
  divide,
  className,
}: WorkbenchTrailingClusterProps) {
  const hasContent = Boolean(before || sort || actions || after);
  if (!hasContent) return null;
  const showDivide = divide ?? Boolean(actions);
  return (
    <div className={cn('flex shrink-0 items-center gap-2', className)}>
      {showDivide ? (
        <span
          aria-hidden
          className="hidden h-4 w-px shrink-0 bg-border-soft sm:block"
        />
      ) : null}
      {before}
      {sort}
      {actions}
      {after}
    </div>
  );
}

export interface WorkbenchChromeHeaderProps {
  /**
   * Lifecycle tab rail. Optional: a surface whose facets live in its resident
   * sidebar rail (Media Library) has no tabs to render here, and an empty
   * `TabSwitch` would leave a bare pill track floating in the band.
   */
  tabs?: TabSwitchTabs;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** Solid-pill accent (forwarded to `TabSwitch`); defaults to its `inverse`. */
  solidTone?: TabSwitchSolidTone;
  /**
   * Scoped list-filter search field — the one header search slot, positioned
   * consistently on every workbench page (leads the right cluster, before
   * `right`). Pass a `SearchField`; the ⌘K global header pill stays separate.
   */
  search?: ReactNode;
  /**
   * Right-aligned filters/controls, rendered left of the toolbar portal.
   *
   * The REFINE cluster: controls that change WHICH ROWS are on screen (facet
   * chips, staff pickers, a Filters popover — including a server-ordering
   * `?sort=` group inside one). Display preferences go in {@link trailing};
   * query and display are the two different questions this header answers.
   */
  right?: ReactNode;
  /**
   * Far-right chrome slot — always after the table-controls portal (e.g. Import
   * / Add CTAs). Pass {@link WorkbenchTrailingCluster} so Sort → Import → Add
   * stays one skeleton with honest absence. Owned by the workspace so it stays
   * top-right even before a table mounts or when the portal is empty. Row
   * select lives in the table left gutter, not here.
   *
   * **Column display is NOT here** — it is the grid's own top-right header lip
   * (`onOpenColumnDetails` → `GridColumnDetailsPanel`), retired from chrome
   * 2026-08-02. See {@link WorkbenchTrailingCluster}.
   */
  trailing?: ReactNode;
  /**
   * Tab rail sizing forwarded to `TabSwitch`. Default `hug` keeps solid tabs at
   * `px-3 py-2` so the left cluster matches the right `h-8` icon row’s edge
   * inset; pass `fill` only for a rare full-bleed facet strip.
   */
  tabsFit?: 'fill' | 'hug';
  /**
   * Face density. `default` — content-driven card (`p-1.5` + md solid-hug tabs
   * with their own bordered rail). `band` — **single-surface 40px scan-grid
   * face** (`h-10 p-0.5` + `TabSwitch size="sm"` on a flat rail — 2px inset
   * so the active pill nests concentrically inside the card shell; no nested
   * pill card). Compose `band` when this chrome sits beside a station scan
   * dock (Unbox + Triage).
   */
  density?: 'default' | 'band';
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
  tabsFit = 'hug',
  density = 'default',
  controlsSlotRef,
  controlsSlotProps,
  className,
}: WorkbenchChromeHeaderProps) {
  const band = density === 'band';
  return (
    <div
      className={cn(
        // default: p-1.5 matches the solid TabSwitch rail’s own p-1 so left
        // tabs and right h-8 icon controls share one outer inset.
        // band: h-10 p-0.5 — 2px inset so the active pill sits inside the
        // shell with a concentric radius (nestedCorner card/0.5). items-stretch
        // so TabSwitch fills the inset face; the right cluster re-centers
        // its own h-8 icons.
        'flex min-w-0 shrink-0 gap-2 border border-border-soft bg-surface-card shadow-sm',
        band ? 'h-10 items-stretch p-0.5' : 'items-center p-1.5',
        cornerClass('card'),
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
      {tabs && tabs.length > 0 ? (
      <TabSwitch
        tabs={tabs}
        activeTab={activeTab ?? ''}
        onTabChange={onTabChange ?? (() => {})}
        // `scrollable` is TabSwitch's own overflow mode — it sets the track to
        // `w-max` so tabs keep their natural width instead of compressing, and
        // scrolls the active tab into view. Hand-rolling `overflow-x-auto` here
        // instead would leave the track at `w-full`, squeezing labels mid-word.
        // Keep scrollable with hug so long rails (Media Library) still overflow
        // safely; hug prevents `min-w-full` stretch on short rails (Incoming).
        scrollable
        fit={tabsFit}
        size={band ? 'sm' : 'md'}
        className={cn('w-auto min-w-0 shrink', band && 'h-full')}
        variant="solid"
        solidTone={solidTone}
        countStyle="plain"
        // band: flat track inside the outer card — no nested pill card
        // (Linear single-surface). default: bordered hug rail as before.
        railClassName={
          band
            ? `h-full border-0 bg-transparent p-0 shadow-none ${cornerClass('card')}`
            : 'rounded-full border border-border-default bg-surface-card p-1 shadow-sm'
        }
      />
      ) : null}

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
