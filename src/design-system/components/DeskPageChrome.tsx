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
 *      │ Shipping                                    [ Add order ]  │  ← page header
 *      │ To ship   Amazon Prep                                      │  ← tab row
 *      │ ───────                                                    │     underline = active
 *      │                     ↕ detachment gap                       │
 *      │ ┌────────────────────────────────────────────────────────┐ │
 *      │ │ ⌕ find …                         [filter] [fields]  ⤢ │ │  ← table's own row
 *      │ │ ─────────────────── the grid ───────────────────────── │ │
 *      │ └────────────────────────────────────────────────────────┘ │
 *      └────────────────────────────────────────────────────────────┘
 *       ↑ gutter                                            gutter ↑
 * ```
 *
 * Four jobs, and only these four: a **page header** (title left, primary CTA
 * right), a **tab row** for the desk's modes (the pages that used to hang off
 * the spine as nav children), a **detachment gap**, and a **card** capped at
 * {@link DESK_STAGE_MAX_PX}.
 *
 * The tab row is the only optional one. A single-surface page passes `tabs={[]}`
 * and wears the other three — which is what lets a page with no modes still be
 * this frame rather than a hand-rolled title over a bare table.
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
 * ## The detachment is the point
 *
 * The header and the tabs sit on the page's GROUND; the table is a card on top
 * of it. Before this split, the tabs, the CTA, the table toolbar and the column
 * header were four chrome rows in one continuous slab, and an operator scanning
 * down could not tell where the page furniture stopped and the data started.
 * Every row above the card shares the card's measure, so the title, the tabs
 * and the first column all start on one vertical line.
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
import { cornerClass } from '../tokens/radius';
import { focusRing } from '../tokens/focus-ring';
import { DeskStageProvider } from './DeskStageContext';
import {
  DESK_CHROME_STAGE_BODY_CLASS,
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

export interface DeskPageTab {
  id: string;
  label: string;
  /** Rows behind the tab. Omit for honest absence — never print a fake 0. */
  count?: number;
}

export interface DeskPageChromeProps {
  /**
   * Page title, top-left. Data, never a lookup: the chrome is desk-agnostic and
   * must not know that Shipping is the desk it happens to be framing. The
   * caller reads it off the desk's own nav entry so the title and the spine
   * cannot drift.
   */
  title: string;
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
   * Primary CTA, top-right of the page header (To ship: **Add order**). A node
   * rather than an `onAdd` callback so a desk can hand over whatever its intake
   * needs.
   */
  addSlot?: ReactNode;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  /** The desk body — a grid, a board, a form host. Mounted inside the card. */
  children: ReactNode;
  className?: string;
}

export function DeskPageChrome({
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  addSlot,
  fullscreen,
  onToggleFullscreen,
  children,
  className,
}: DeskPageChromeProps) {
  const measure = fullscreen ? DESK_STAGE_FULLSCREEN_CLASS : DESK_STAGE_FIXED_CLASS;

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
          Page header and tab row are page FURNITURE: they do not exist in
          fullscreen. Not hidden — unrendered, so the card's flex-basis is the
          whole canvas rather than the canvas minus two invisible rows.
        */}
        {fullscreen ? null : (
          <>
            {/* ── Page header — title left, CTA right ────────────────────── */}
            <div
              data-testid="desk-page-header"
              className={cn(
                'flex min-w-0 shrink-0 items-center justify-between gap-3',
                measure,
                DESK_PAGE_HEADER_ROW_CLASS,
              )}
            >
              <div className="min-w-0">
                <h1 className="truncate text-role-title text-text-default">{title}</h1>
                {subtitle ? (
                  <p className="truncate text-role-caption text-text-soft">{subtitle}</p>
                ) : null}
              </div>
              {/*
                The CTA's home. It sat in the 28px tab band only because that
                band could not hold a real button; at page-header altitude that
                constraint is gone and a page-level primary action gets a
                page-level control.
              */}
              {addSlot}
            </div>

            {/* ── Tab row — tabs only, underline selection ───────────────── */}
            {tabs.length === 0 ? null : (
            <div
              data-testid="desk-page-chrome-band"
              className={cn(
                'flex min-w-0 shrink-0 items-stretch',
                measure,
                DESK_TAB_ROW_CLASS,
              )}
            >
              {/*
                `-ml-3` cancels the first tab's own `px-3` so its LABEL — not its
                hit area — starts on the same vertical line as the title and the
                card's left edge. The padding stays for the pointer target.

                No `overflow-x-auto`. It clipped at this tablist's CONTENT box,
                one pixel above the row's rule, so the selection could never
                reach the rule it is meant to be a segment of — and with four
                short tabs on a stage that caps at 1152px it never scrolled
                anything. Its removal is what lets `-mb-px` below land.
              */}
              <div
                role="tablist"
                className="-ml-3 flex min-w-0 flex-1 items-stretch gap-1"
              >
                {tabs.map((tab) => {
                  const active = tab.id === activeTab;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => onTabChange(tab.id)}
                      data-testid={`desk-tab-${tab.id}`}
                      data-active={active ? '' : undefined}
                      className={cn(
                        'ds-raw-button inline-flex shrink-0 items-center gap-1 px-3 text-role-caption',
                        /*
                          Selection IS the rule, not a bar above it.
                          `DESK_TAB_ROW_CLASS` draws the full-width hairline on
                          this row's bottom border; `-mb-px` pulls each tab's own
                          bottom border down onto that exact pixel, so the dark
                          segment REPLACES the soft rule under the active tab
                          instead of stacking a second line on top of it. That
                          stack is what read as an underline floating off the
                          hairline.
                        */
                        '-mb-px border-b',
                        // Colour only. A tab that slid or grew would move its
                        // neighbours, which ops chrome forbids (AGENTS.md) —
                        // every tab carries the border, inactive ones
                        // transparent, so activating one changes no geometry.
                        'transition-colors duration-100 ease-out',
                        cornerClass('flush'),
                        focusRing('control'),
                        active
                          ? 'border-text-default font-semibold text-text-default'
                          : 'border-transparent text-text-muted hover:text-text-default',
                      )}
                    >
                      <span className="truncate">{tab.label}</span>
                      {typeof tab.count === 'number' ? (
                        <span
                          className={cn(
                            'tabular-nums text-role-micro',
                            active ? 'text-text-soft' : 'text-text-faint',
                          )}
                        >
                          {tab.count > 99 ? '99+' : tab.count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            )}
          </>
        )}

        {/* ── The card ────────────────────────────────────────────────────── */}
        <div
          data-testid="desk-page-stage"
          data-fullscreen={fullscreen ? '' : undefined}
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
            measure,
            fullscreen
              ? // Flush + square: a rounded card floating on a canvas it
                // completely fills is a corner radius with nothing behind it.
                'bg-surface-card'
              : cn(DESK_CHROME_STAGE_BODY_CLASS, DESK_STAGE_DETACH_CLASS),
          )}
        >
          {children}
        </div>
      </div>
    </DeskStageProvider>
  );
}
