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
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { WorkbenchInspectorToggle } from '@/components/dashboard/workbench-inspector-toggle';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * Flush spreadsheet body host — no horizontal gutters, no bottom float pad.
 *
 * Chrome on sheet surfaces uses {@link WORKBENCH_SHEET_CHROME} (same flush
 * left edge) — every workbench ops page is a flush sheet. Pair with
 * `TABLE_SURFACE_SHEET_CLASS` on the grid shell — never raw `p-0` at call sites.
 *
 * Golden: Unbox (major SoT) · Incoming Pipeline · History browse.
 */
export const WORKBENCH_SHEET_HOST = 'relative flex min-h-0 min-w-0 flex-1 flex-col';

/**
 * Flush spreadsheet chrome — same left edge as {@link WORKBENCH_SHEET_HOST}.
 * No framed gutter side pad: tabs / KPI / triage abut the context rail
 * hairline instead of floating as inset card islands on the sunken ground.
 * Vertical rhythm comes from the band borders themselves (no outer `py`).
 */
export const WORKBENCH_SHEET_CHROME = 'relative w-full min-w-0';

/**
 * Horizontal inset for EVERY band in the sheet chrome stack — **zero**.
 *
 * The bands sit one above the other, so their left and right edges are read as
 * a column. Each band used to set its own inset by hand and they did not agree:
 *
 * | Band | container | inner | box edge |
 * |---|---|---|---|
 * | 1 (`band` density) | `p-0` | tab rail `p-0` | **0** |
 * | 2 (KPI card) | `px-3` | tile `px-2 py-1` | **12px** |
 * | 3 (triage row) | `pl-0 pr-0.5` | field plane `px-2` | **0 / 2px** |
 *
 * So a stack read 0 · 12 · 0 down the left and 0 · 12 · 2 down the right. The
 * right-hand raggedness was already known and already patched in the wrong
 * place: Media Library carried `pr-0` on its own band with a comment explaining
 * that the shared `pr-0.5` "left Band 2's cluster sitting just inside Band 3's".
 * That is a shared-token defect wearing a page-local fix — the 2px was wrong on
 * every desk, not just that one.
 *
 * **The inset belongs to the CONTENT, not to the band.** A tab owns `px-2.5`, a
 * KPI tile owns `px-2 py-1` (`MONITOR_KPI_BAND_CLASS` — documented as a "flush
 * industrial instrument, no card island"), and the find field's sunken plane
 * owns `px-2`. Band 2's `px-3` was a second inset stacked on top of the tile's
 * own, which is why its labels landed at 20px while the search glyph beside it
 * landed at 8px. Zero here lets each band's own content face govern, and the
 * three then agree: box edges flush at 0, label text at 8px.
 *
 * Vertical is deliberately NOT shared: bands 1 and 3 are fixed
 * `PRIMARY_CHROME_ROW_FACE` rows; band 2 is content-driven (`py-0`) so the
 * stacked label/value tiles sit flush under the tab rail. Wrap rhythm comes
 * from each tile's own `py-1`.
 */
export const WORKBENCH_BAND_INSET_X = 'px-0';

/**
 * Flush data-table triage band (Unbox History golden) — search flush left ·
 * refine / controls · view toggles right. Sits under KPI, above the sheet.
 * `border-r` only: KPI owns the seam above; the sheet owns `border-t` below.
 * `pl-0` — flush to the sheet edge (search icon lives inside the field). No
 * vertical pad — chrome search is a sunken plane edge-to-edge with this row
 * (not a floated pill).
 *
 * Zone grammar (scanner left · workspace config right):
 * - **Left** — data entry / queue filter, and nothing else: `search` owns the
 *   whole left at `min-w-0 flex-1`, flush to the sheet edge.
 * - **Right** — ONE control cluster, in order: refine (`right` + controls
 *   portal) → **Views** (`WorkbenchViewsMenu`, page-scoped saved views) →
 *   **view toggles** (`kpiToggle` → `trailing` inspector). KPI hide sits
 *   immediately left of the right-rail inspector so layout-modifying controls
 *   share one cluster.
 *
 * Every control in that right cluster wears ONE face —
 * `WorkbenchBandControl` (`workbench-band-control.tsx`): the row's own rung,
 * one resting tone, one lit fill, one 14px glyph box. Views · KPI · inspector
 * ran three rungs and three tones until 2026-08-20. A new band control composes
 * that face; it does not hand-roll a fourth.
 *
 * Views moved out of the find group 2026-08-10: it is a page-scoped *control*,
 * not part of the query, so abutting the search field read as chrome belonging
 * to find. On the lean cohort the row is exactly four controls —
 * `search · Views · KPI · inspector` — and the right three read as peers.
 * Never Band-1 beside lifecycle tabs (that promotes an inner refinement to an
 * outer scope). SoT: source-of-truth.md → Left-edge occupant.
 *
 * Consumers: Unbox (golden), Incoming, Locations, To-ship, cohort stations.
 * KPI snap-collapse: {@link WorkbenchKpiBand} + {@link WorkbenchKpiCollapseToggle}
 * (`workbench-kpi-collapse.tsx`) — `kpiToggle` hosts the toggle (never left of
 * search; never over the select gutter).
 */

export function WorkbenchTriageBand({
  search,
  views,
  right,
  kpiToggle,
  trailing,
  controlsSlotRef,
  controlsSlotProps,
  className,
}: {
  search: ReactNode;
  /**
   * Page-scoped saved views — {@link WorkbenchViewsMenu}. Renders in the RIGHT
   * control cluster, immediately before {@link kpiToggle}, so the row reads
   * `search · Views · KPI · inspector`. It is a control, not part of the find
   * field — never re-attach it to the search group.
   */
  views?: ReactNode;
  right?: ReactNode;
  /**
   * View-toggle zone — {@link WorkbenchKpiCollapseToggle}. Renders after the
   * controls portal and immediately before {@link trailing} so KPI hide and
   * the right-rail inspector read as one layout-control cluster. Never left of
   * search (scanner ingestion stays flush-left).
   */
  kpiToggle?: ReactNode;
  /**
   * Far-right of the band (after `kpiToggle`) — {@link WorkbenchInspectorToggle}.
   * Defaults to Show inspector (opens Column display when the rail is empty).
   * Pass `null` only for honest absence of any desk peek.
   */
  trailing?: ReactNode;
  controlsSlotRef?: Ref<HTMLDivElement>;
  controlsSlotProps?: HTMLAttributes<HTMLDivElement> & Partial<Record<`data-${string}`, string>>;
  className?: string;
}) {
  const inspector =
    trailing === undefined ? (
      <WorkbenchInspectorToggle open={false} />
    ) : (
      trailing
    );
  return (
    <div
      className={cn(
        'flex min-w-0 items-stretch justify-between gap-2 border-r border-border-soft bg-surface-card shadow-sm',
        WORKBENCH_BAND_INSET_X,
        PRIMARY_CHROME_ROW_FACE,
        className,
      )}
    >
      {/* Find owns the whole left — no control shares the search group. */}
      <div className="flex min-w-0 flex-1 items-stretch">{search}</div>
      {/*
        `empty:hidden` on both boxes below: a flex item with no content is still
        an ITEM, so the row's `gap-2` reserves 8px beside it. A surface that
        passes a `controlsSlotRef` its grid never portals into (Arrival, and any
        band whose ▦ has no host) paid that gap on every paint, and a band with
        no controls at all paid it twice — dead space that reads as a broken
        right edge rather than as an absent control.
      */}
      <div className="flex shrink-0 items-center gap-2 self-center empty:hidden">
        {right}
        {controlsSlotRef !== undefined || controlsSlotProps ? (
          <div
            ref={controlsSlotRef}
            className="flex shrink-0 items-center gap-2 empty:hidden"
            {...controlsSlotProps}
          />
        ) : null}
        {views}
        {kpiToggle}
        {inspector}
      </div>
    </div>
  );
}

// Table hosts size from the flex column, never an absolute `100dvh` calc: that
// calc cannot see the app header above `<main>`, and the `flex-1` sheet host
// defeats an explicit height anyway — the combination collapses a lane to its
// `min-h` floor and destabilizes the virtualizer. Every ops
// sheet now self-scrolls via a flex-fill `WORKBENCH_SHEET_HOST` inside a
// definite flex chain (Unbox golden) — one Y port, no absolute viewport calc.

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
 * **There is deliberately no `fields` slot.** Column
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
 * above KPIs. SoT: Multi-region pages.
 *
 * @see docs/todo/table-action-bar-fields-PLAN.md
 */

/**
 * Solid workbench-chrome control radius — **flush-square** (`cornerClass('flush')`
 * → `rounded-none`). Ops chrome is zero-radius industrial: solid CTAs, tab bands,
 * selects and toggle rows sit square on their hairline. Never a soft-concentric
 * pill (`nestedCornerClass('card', 0.5)` → `rounded-xl`) on ops chrome.
 * Law: `source-of-truth.md` → Workbench chrome flush.
 */
export const WORKBENCH_CHROME_PILL_CLASS = cornerClass('flush');

/**
 * Band-1 host face — primary row height, **zero pad / zero gap**. Leading boxed
 * cubes (Unbox pin-list · same face as carton Exit) abut the tab rail flush;
 * never `gap-2` or `p-0.5` air between pin and first tab. TabSwitch solid/sm
 * owns any active-pill inset on its own track — not the band host.
 * Law: `display/workbench-ops-queue.md` → Chrome face density.
 */
const WORKBENCH_CHROME_BAND_FACE = cn(
  PRIMARY_CHROME_ROW_FACE,
  'items-stretch gap-0 p-0',
);

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
   * Neighbors of this hairline are flush-square ({@link WORKBENCH_CHROME_PILL_CLASS}
   * = `cornerClass('flush')`). Law: `source-of-truth.md` → Workbench chrome flush.
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
    <div className={cn('flex h-full shrink-0 items-stretch gap-0', className)}>
      {showDivide ? (
        <span
          aria-hidden
          className="hidden w-px shrink-0 self-stretch bg-border-soft sm:block"
        />
      ) : null}
      {before}
      {sort}
      {actions ? (
        <div className="flex h-full items-stretch gap-0">{actions}</div>
      ) : null}
      {after}
    </div>
  );
}

export interface WorkbenchChromeHeaderProps {
  /**
   * Optional control before the tab rail (e.g. Unbox Plus → pin list).
   * Stays shrink-0; tabs remain the scrollable yield surface.
   */
  leading?: ReactNode;
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
   * (`onOpenColumnDetails` → `GridColumnDetailsPanel`), because Fields mutates
   * the column set of the card it sits on. See {@link WorkbenchTrailingCluster}.
   */
  trailing?: ReactNode;
  /**
   * Tab rail sizing forwarded to `TabSwitch`. Default `hug` keeps solid tabs at
   * `px-3 py-2` so the left cluster matches the right `h-8` icon row’s edge
   * inset; pass `fill` only for a rare full-bleed facet strip.
   */
  tabsFit?: 'fill' | 'hug';
  /**
   * Face density. `default` — content-driven card (`gap-2 p-1.5` + md solid-hug
   * tabs with their own bordered rail). `band` — **single-surface primary face**
   * ({@link WORKBENCH_CHROME_BAND_FACE}: `gap-0 p-0` + `TabSwitch size="sm"` on
   * a flat rail). Leading cubes abut the tab rail — never host inset air.
   * Compose `band` when this chrome sits beside a station scan dock
   * (Unbox + Triage).
   */
  density?: 'default' | 'band';
  /** Ref for the table-toolbar portal target (tables `createPortal` into it). */
  controlsSlotRef?: Ref<HTMLDivElement>;
  /** Extra attrs for the portal div — e.g. `{ 'data-outbound-controls': '' }`. */
  controlsSlotProps?: HTMLAttributes<HTMLDivElement> & Partial<Record<`data-${string}`, string>>;
  className?: string;
}

/**
 * Flush tab strip: solid `TabSwitch` left · flex spacer · right controls +
 * toolbar portal · trailing CTAs. The single content-chrome tab band for every
 * workbench page (replaces the sidebar mode rail on migrating surfaces).
 * Outer shell + rails are `cornerClass('flush')` — callers do not pass
 * `rounded-none` to fight a soft SoT.
 */
export function WorkbenchChromeHeader({
  leading,
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
        // default: gap-2 + p-1.5 — content-driven card with air between zones.
        // band: WORKBENCH_CHROME_BAND_FACE — zero pad/gap so leading cubes
        // abut the tab rail (Unbox pin | Inbound). Trailing CTAs sit flush (gap-0).
        'flex min-w-0 border border-border-soft bg-surface-card shadow-sm',
        band ? WORKBENCH_CHROME_BAND_FACE : 'shrink-0 items-center gap-2 p-1.5',
        cornerClass('flush'),
        className,
      )}
    >
      {leading ? (
        <div
          className={cn(
            'flex shrink-0 items-center',
            // Band: stretch so boxed cubes fill PRIMARY height and share the
            // seam with the first tab — never centered air / host gap.
            band ? 'self-stretch items-stretch' : null,
          )}
        >
          {leading}
        </div>
      ) : null}
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
        // Flat flush track — no soft pill rail (ops chrome flush law).
        railClassName={
          band
            ? `h-full border-0 bg-transparent p-0 shadow-none ${cornerClass('flush')}`
            : `border border-border-default bg-surface-card p-1 shadow-sm ${cornerClass('flush')}`
        }
      />
      ) : null}

      <div className="min-w-0 flex-1" aria-hidden />

      {/*
        Band: the controls column STRETCHES to the PRIMARY row height so its
        CTAs can fill it (`h-full`) instead of standing 32px tall in a 28px row
        and bleeding over the seam onto the grid header below. Default density
        keeps its content-driven centered cluster.
      */}
      <div
        className={cn(
          'flex shrink-0 gap-2',
          band ? 'items-stretch' : 'items-center',
        )}
      >
        {search}
        {right}
        {/* Empty portal = a gap-2 item with nothing in it. See Band 3 above. */}
        <div
          ref={controlsSlotRef}
          className="flex shrink-0 items-center gap-2 empty:hidden"
          {...controlsSlotProps}
        />
        {trailing}
      </div>
    </div>
  );
}
