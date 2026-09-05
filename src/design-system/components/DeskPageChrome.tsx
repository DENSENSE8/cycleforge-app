'use client';

/**
 * `DeskPageChrome` — the frame every **non-scan desk** wears.
 *
 * **This is the design system's page chrome and the only one.** It lived in
 * `src/components/desk/` while Shipping was its single tenant; it moved here on
 * 2026-08-31 because a frame that four domains wear is a system component, and
 * a page that hand-rolls its own title row beside this one is a fork. Ask
 * `ds_contract` before building any page header — that is what the pin in
 * `src/design-system/pinned.json` is for.
 *
 * It takes DATA and knows nothing about nav, routing or permissions: the
 * app-level adapter (`@/components/desk/DeskPageLayout`) reads
 * `SIDEBAR_PAGE_NAV` and hands the title, the tabs and the active id down. That
 * split is deliberate — the design system must not import the app's spine.
 *
 * ```text
 *      ┌ stage measure ─────────────────────────────────────────────┐
 *      │ Shipping                         [ Export ] [ Add order ]  │  ← page header
 *      │ To ship   Amazon Prep                                      │  ← fixed-width tab row
 *      │         ───                                                │     active underline only
 *      │ ┌────────────────────────────────────────────────────────┐ │
 *      │ │ ⌕ find …                         [filter] [fields]  ⤢ │ │  ← table's own row
 *      │ │ ─────────────────── the grid ───────────────────────── │ │
 *      │ └────────────────────────────────────────────────────────┘ │
 *      └────────────────────────────────────────────────────────────┘
 *       ↑ gutter                                            gutter ↑
 * ```
 *
 * Four jobs: a **page header** (title left, primary CTA right), a **tab row**
 * for the desk's modes (the pages that used to hang off the spine as nav
 * children), a **card** capped at {@link DESK_STAGE_MAX_PX}, and a **floor**
 * under that card. The card welds to the tab row — no gap and no full-width
 * hairline between tabs and the table toolbar.
 *
 * The tab row is the only optional one. A single-surface page passes `tabs={[]}`
 * and wears the other three — which is what lets a page with no modes still be
 * this frame rather than a hand-rolled title over a bare table.
 *
 * ## This frame is ALWAYS the desk measure
 *
 * There is no edge-to-edge mode, and a `bleed` prop was added and removed on
 * 2026-09-01 once the rule was stated precisely: *"the scan station's import a
 * desk component, which is the data table, which should not be edge to edge.
 * Only the scan station itself processing and triaging information — unboxing,
 * quality control — should be edge to edge."*
 *
 * The line is not per-page, it is per-SURFACE-KIND, and it already falls where
 * the code does:
 *
 * - A **bench** — the locked-720 scan/triage composition (`StationWorkbench`,
 *   `StationPanelRoot`, `PackOrderPanel`, `LineEditPanel`, `TriagePanel`) — is
 *   edge-to-edge and **does not mount this frame at all**. Nothing to configure.
 * - A station's **browse side** — Unbox's lines table, Testing's history,
 *   Packing's queue — imports DESK components (`ReceivingLinesTable`,
 *   `TechAllTriageTable`, `UnshippedTable`). A desk table is a desk table
 *   wherever it is mounted, so it wears the desk measure like every other one.
 *
 * So a prop was the wrong shape for the answer: the two kinds never meet in one
 * component, and a flag would only let someone put a bench measure on a table.
 *
 * **Scan stations wear it too, as of 2026-08-31.** The rule used to be the
 * opposite — `docs/todo/desk-page-chrome-fixed-width-PLAN.md` §0 said a station
 * must never mount this and must keep its edge-to-edge shell with 28px bands.
 * The operator struck that: Unbox, Arrival, Testing, Packing and Scan out now
 * wear the same frame as the Shipping desk, and their mode tabs moved off the
 * foot strip onto this row. A bench that kept its own tab vocabulary would be
 * the second page chrome in a product that just finished collapsing to one.
 *
 * A station passes its tabs EXPLICITLY (they are body-switchers — `?testTab=`,
 * `?triview=` — not nav children), so `deskChrome: true` stays off its nav
 * entry: the spine has nothing to withdraw.
 *
 * ## Where this frame stops
 *
 * It is the frame for **operator desks** — a page whose subject is a collection
 * you triage. It is deliberately NOT the frame for:
 *
 * - **Settings / admin pages** (`/settings/*`, `/admin/inventory/*`). Those are
 *   forms and short config tables; `PageHeader` from `@/components/ui/pane-header`
 *   stays their primitive. A fixed-width stage, a detached card and a fullscreen
 *   toggle answer questions a settings form does not ask, and the two-primitive
 *   split here is the same "two jobs, two components" call the repo already
 *   makes for `Button` vs `button`.
 * - **Detail panels, flyouts and inspectors.** They also use `PageHeader`, and
 *   that is a panel header, not a page header — a different altitude entirely.
 * - **Full-canvas surfaces** (`/studio`'s pan/zoom graph). A canvas that is the
 *   whole point of the page has nothing to gain from a card on a stage.
 *
 * ## The card sits on the page
 *
 * The header and the tabs sit on the page's GROUND; the table is a card under
 * the tab row (operator 2026-09-04: no gap and no full-width hairline between
 * tabs and the toolbar).
 * Radius and the floor still make the grid an object on the page rather than
 * a slab welded to the viewport. Every row above the card shares the card's
 * measure. The title and card share their edge; tab labels are centered inside
 * fixed-width trigger faces. Hold-drag those same faces to reorder — the tab
 * row is the editor.
 *
 * ## Fullscreen swaps the frame — it does not widen it
 *
 * The header and the tab row are **not rendered**, the gutters collapse, and
 * the card goes flush and square: the operator sees the table's own toolbar row
 * and the table, nothing else. That is what fullscreen was pressed to buy, so
 * keeping page furniture above a full-canvas grid would spend it.
 *
 * Nothing is re-parented. The find field and the ⤢ are already on the table's
 * own row in both states (`DataTableFullscreenToggle`); only the rows ABOVE
 * stop rendering. This component OWNS the state and publishes it through
 * {@link DeskStageProvider} — see `desk-stage-context.tsx` for why the control
 * lives on the table rather than up here (in fullscreen, "up here" is gone).
 *
 * Escape exits too. With the tabs unrendered the operator has lost their
 * navigation, and a mode with one small exit and no keyboard way out is a trap.
 *
 * ## No layout tweens
 *
 * Fullscreen is a class swap (AGENTS.md). Nothing here tweens `width`,
 * `max-width`, `height` or a framer `layout`.
 *
 * ## The height chain
 *
 * Every box from here down is `min-h-0 flex-1 overflow-hidden`. **Both halves
 * are load-bearing and they are not the same thing:** `min-h-0` lets a flex
 * child shrink below its content; `overflow-hidden` CLIPS the overflow so the
 * grid scrolls inside the card instead of painting past it. The two fixed rows
 * above the card come out of the card's flex-basis — the page itself must never
 * gain a scrollbar.
 */

import { useEffect, type ReactNode } from 'react';
import { DeskStageProvider } from './DeskStageContext';
import { useDeskLeadPane } from './DeskLeadPaneContext';
import { DeskTabList } from './DeskTabList';
import type { DeskPageTab } from './DeskTab';
import {
  DESK_CHROME_STAGE_BODY_CLASS,
  DESK_LEAD_PANE_BODY_CLASS,
  DESK_LEAD_PANE_WIDTH_CLASS,
  DESK_PAGE_HEADER_ROW_CLASS,
  DESK_STAGE_DETACH_CLASS,
  DESK_STAGE_FIXED_CLASS,
  DESK_STAGE_FULLSCREEN_CLASS,
  DESK_STAGE_GROUND_CLASS,
  DESK_STAGE_FLOOR_CLASS,
  DESK_STAGE_GUTTER_CLASS,
  DESK_TAB_ROW_CLASS,
} from '../tokens/desk-stage';
import { cn } from '@/utils/_cn';

export type { DeskPageTab } from './DeskTab';

export interface DeskPageChromeProps {
  /**
   * Page title, top-left. Data, never a lookup: the chrome is desk-agnostic and
   * must not know that Shipping is the desk it happens to be framing. The
   * caller reads it off the desk's own nav entry so the title and the spine
   * cannot drift.
   */
  title: string;
  /**
   * Replaces the `<h1>` in the title position.
   *
   * For a FIND surface, the query is the page's identity — `/search` with
   * `?q=stapler` is not "Search", it is that search. Printing a static title
   * over the field that actually names the page spends the most valuable row on
   * a constant (operator ruling 2026-09-01: *"with search on the top left"*).
   *
   * Pass `title` as well: it is the accessible name the slot cannot carry, and
   * the fallback if the slot renders nothing.
   *
   * This is not a general-purpose header slot. A page whose identity is a NAME
   * uses `title`; only a surface whose identity is the operator's own input
   * earns this.
   */
  titleSlot?: ReactNode;
  /**
   * Optional line under the title — a count, a scope. Omit it when there is
   * nothing true to say; a placeholder subtitle is worse than none.
   */
  subtitle?: ReactNode;
  /**
   * Desk modes, left to right. One active at a time; the URL is the SoT.
   *
   * **Empty is a real answer.** A desk with one surface (or none declared yet)
   * passes `[]` and the tab row is not rendered at all — it still gets the
   * header, the stage and the detached card. A row drawn for zero tabs is a
   * rule under nothing, and the same law that bans a placeholder subtitle bans
   * a placeholder tab strip.
   */
  tabs: readonly DeskPageTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /**
   * Hold-drag drop on this same tab row. Existing ids only — never mint or
   * delete. Omit on scan-station / explicit tab rows that are not nav children.
   */
  onTabsReorder?: (orderedIds: string[]) => void;
  /**
   * Header action cluster, top-right (overall actions such as **Export**, then
   * the primary CTA). Composed by {@link useDeskActionSlotNode}. A node rather
   * than an `onAdd` callback so a desk can hand over whatever its intake needs.
   */
  addSlot?: ReactNode;
  /**
   * A control at the START of the tab row, on the SAME axis as the tabs.
   *
   * This is not a second CTA slot and must never be used as one — the tab row
   * still holds no actions. It exists for the case where a page's tab
   * vocabulary is larger than a row can hold, so the overflow rides beside the
   * tabs rather than becoming a second control at a different altitude.
   *
   * Media Library is the case it was cut for: seven lifecycle scopes are tabs,
   * and N operator-defined media types live one click deep in a popover here.
   * Both write ONE param through one function, and that single-writer law is
   * why the overflow cannot simply be moved somewhere else on the page — a
   * scope control sitting apart from the scope tabs is how that surface grew
   * two writers of one param in the first place (`PhotoLibraryScopeBand`).
   *
   * If what you have is an ACTION, it belongs in {@link addSlot}. If it is a
   * refinement of the rows, it belongs on the table's own toolbar. Only a
   * control that answers the same question as the tabs belongs here.
   */
  tabsLead?: ReactNode;
  /**
   * A control at the END of the tab row, on the SAME axis as the tabs.
   *
   * Same-axis overflow of the tab vocabulary (see {@link tabsLead}). Not a
   * create-table plus and not a page-level CTA — intake stays in {@link addSlot}.
   */
  tabsTrail?: ReactNode;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  /** The desk body — a grid, a board, a form host. Mounted inside the card. */
  children: ReactNode;
  /**
   * Optional left page-column (the Ask pane) — the composer body only.
   *
   * It is a COLUMN of this chrome's own rows, not a second stack beside them:
   * the header row, the tab band and the card each span both columns, so every
   * horizontal rule on the page lines up across the pane and the desk. Mounted
   * inside the ONE card, left of {@link children}, at
   * {@link DESK_LEAD_PANE_WIDTH_CLASS}. Design-system file: a node, never an
   * import of the app composer.
   *
   * **Omit it.** The shell publishes the pane through
   * {@link DeskLeadPaneProvider} and every desk takes it from there, so the
   * mouth cannot be present on the desks whose author remembered and missing on
   * the ones who did not. Pass `null` to opt a surface OUT deliberately; a
   * value here overrides the ambient pane.
   */
  leadPane?: ReactNode | null;
  /** The lead column's title, on the shared header row beside {@link title}. */
  leadPaneTitle?: ReactNode;
  className?: string;
}

export function DeskPageChrome({
  title,
  titleSlot,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  onTabsReorder,
  addSlot,
  tabsLead,
  tabsTrail,
  fullscreen,
  onToggleFullscreen,
  children,
  leadPane,
  leadPaneTitle,
  className,
}: DeskPageChromeProps) {
  const measure = fullscreen ? DESK_STAGE_FULLSCREEN_CLASS : DESK_STAGE_FIXED_CLASS;

  // An explicit prop wins — including `null`, which is how a surface opts out.
  // Everything else takes the shell's pane, which is what makes the composer a
  // property of the FRAME rather than of each desk that remembered to pass it.
  const ambient = useDeskLeadPane();
  const pane =
    leadPane === undefined
      ? ambient
      : leadPane === null
        ? null
        : { node: leadPane, title: leadPaneTitle };
  const showLeadPane = !!pane?.node && !fullscreen;

  // Escape is the keyboard half of the one-click-out budget. Bubble phase and a
  // `defaultPrevented` check so a dialog or menu that owns Escape closes itself
  // WITHOUT also collapsing the stage underneath it.
  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      onToggleFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, onToggleFullscreen]);

  return (
    <DeskStageProvider fullscreen={fullscreen} toggleFullscreen={onToggleFullscreen}>
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          // Gutters wrap every row so they cannot drift apart.
          !fullscreen && DESK_STAGE_GUTTER_CLASS,
          !fullscreen && DESK_STAGE_GROUND_CLASS,
          !fullscreen && 'pt-2',
          !fullscreen && DESK_STAGE_FLOOR_CLASS,
          className,
        )}
      >
        {/*
          ONE stack of rows, whether or not there is a lead pane. When there is,
          each row splits into [lead column | desk column] at the SAME width
          token, so the title baseline, the tab hairline and the card's edges
          are single lines drawn across both — never two stacks of chrome that
          can drift apart. Without a lead pane the desk is the single measured
          column (max-w-6xl).
        */}
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
            !showLeadPane && !fullscreen ? measure : null,
          )}
        >
          {fullscreen ? null : (
            <>
              <div
                data-testid="desk-page-header"
                className={cn(
                  'flex min-w-0 shrink-0 items-center gap-3',
                  DESK_PAGE_HEADER_ROW_CLASS,
                )}
              >
                {showLeadPane ? (
                  <div
                    data-testid="desk-page-lead-title"
                    className={cn('min-w-0', DESK_LEAD_PANE_WIDTH_CLASS)}
                  >
                    <h2 className="truncate text-role-title text-text-default">
                      {pane?.title}
                    </h2>
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  {titleSlot ?? (
                    <h1 className="truncate text-role-title text-text-default">{title}</h1>
                  )}
                  {subtitle ? (
                    <p className="truncate text-role-caption text-text-soft">{subtitle}</p>
                  ) : null}
                </div>
                {addSlot}
              </div>

              {tabs.length === 0 && !tabsLead && !tabsTrail ? null : (
              <div
                data-testid="desk-page-chrome-band"
                className={cn(
                  'flex min-w-0 shrink-0 items-stretch',
                  DESK_TAB_ROW_CLASS,
                )}
              >
                {showLeadPane ? (
                  <div className={DESK_LEAD_PANE_WIDTH_CLASS} aria-hidden />
                ) : null}
                {tabsLead}
                <DeskTabList
                  tabs={tabs}
                  activeTab={activeTab}
                  onTabChange={onTabChange}
                  onTabsReorder={onTabsReorder}
                />
                {tabsTrail ? (
                  <div
                    data-testid="desk-page-tabs-trail"
                    className="flex shrink-0 items-center pl-1"
                  >
                    {tabsTrail}
                  </div>
                ) : null}
              </div>
              )}
            </>
          )}

          <div
            data-testid="desk-page-stage"
            data-fullscreen={fullscreen ? '' : undefined}
            className={cn(
              'flex min-h-0 min-w-0 flex-1 overflow-hidden',
              fullscreen
                ? 'bg-surface-card'
                : cn(DESK_CHROME_STAGE_BODY_CLASS, DESK_STAGE_DETACH_CLASS),
            )}
          >
            {showLeadPane ? (
              <div
                data-testid="desk-page-lead-pane"
                className={cn(DESK_LEAD_PANE_WIDTH_CLASS, DESK_LEAD_PANE_BODY_CLASS)}
              >
                {pane?.node}
              </div>
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {children}
            </div>
          </div>
        </div>
      </div>
    </DeskStageProvider>
  );
}
