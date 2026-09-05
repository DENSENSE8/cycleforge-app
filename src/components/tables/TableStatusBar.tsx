'use client';

/**
 * The one status strip a table paints at its foot: selection CTAs left,
 * counts right (legacy sub-mode tabs still optional; idle-left `lead` optional).
 *
 * ```text
 * ┌────────────────────────────────────────────┬─────────────────────────────┐
 * │ [ Assign ] [ Copy ] [ Listing ]            │  12 selected · 200 of 922   │
 * └────────────────────────────────────────────┴─────────────────────────────┘
 *   after keyboard `?` ({@link KeyboardKey} overlay, right-aligned INSIDE the face):
 * │ [ Assign A] [ Copy C] [ Listing L]         │
 * ```
 *
 * Idle-left readout (no selection verbs, no sub-mode tabs) — Media Library path:
 * ```text
 * │ All dates › Aug 2026 › Aug 29              │  48 of 48                   │
 * ```
 *
 * ## Why it is its own component
 *
 * {@link DataTable} draws every binding-backed table, but the station desks
 * also mount `StationListTable` (the week-scoped history list, which is not on
 * the binding waist). Both need the SAME strip, and two copies of it is how the
 * display layer forked the last time. One component, two mounts — not one
 * component per surface. Media Library mounts this directly (no DataTable) for
 * the same reason.
 *
 * ## The tab half is being retired (2026-08-31)
 *
 * Tabs sat here on a spreadsheet argument: a sheet puts its tabs at the bottom
 * with the status summary beside them, and an operator who has used a
 * spreadsheet knows where to look. The operator overruled it. Page modes now
 * ride the TOP row of {@link DeskPageChrome} — the design system's one page
 * frame — on every desk AND every scan station, because two tab positions in
 * one product is two vocabularies for one job.
 *
 * The `tabs` props stay for the surfaces still passing them (Labels,
 * Locations, Support, Walk-in). **Do not wire a new one.** A page's modes
 * belong to its frame; what this strip is genuinely for is selection verbs +
 * shown / total / selected, which is the one thing a table knows and a frame
 * does not. {@link TableStatusBarProps.lead} fills the idle left for a
 * context readout (date/folder path) — never page navigation, never a CTA.
 *
 * ## Left-half precedence (2026-09-01)
 *
 * `selectionActions` (and legacy Copy) beat `tabs` beat `lead` beat empty
 * spacer. Never paint `lead` beside pill CTAs. Never grow `lead` into actions.
 * Path-contraction crumbs (Media) stay caption-weight `ds-raw-button`, not
 * {@link Button}. `lead` is not `DeskPageChrome`'s `tabsLead` — same idea of a
 * readout slot, different component.
 *
 * ## Selection CTAs + keyboard `?` (2026-09-01)
 *
 * Live verbs paint as compact pill Buttons flush-left. Hotkeys stay **bound**
 * and `?` reveal lives in {@link useSelectionStatusBarHotkeys} — one hook.
 * Faces stay clean until keyboard `?`; then {@link KeyboardKey} overlays the
 * face, right-aligned inside (`absolute right-1.5`) — gray sunken face, black
 * letter. Zero layout change. Never a white slab, never a foot `?`, never
 * key-repeat flash.
 */

import type { ReactNode } from 'react';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { Button, type ButtonVariant } from '@/design-system/primitives/Button';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useSelectionStatusBarHotkeys } from '@/hooks/useSelectionStatusBarHotkeys';
import { cn } from '@/utils/_cn';

/** One tab in the strip. Never an `all` entry — see {@link DataTable}. */
export interface DataTableTab {
  id: string;
  label: string;
  /** Rows behind it. Omit for honest absence — never print a fake 0. */
  count?: number;
}

/**
 * {@link TableTabs}' own props.
 *
 * It used to be a value a DESK threaded down into whichever body it mounted —
 * Testing: All ⇄ History, Shipping: Pending ⇄ All ⇄ History — because the strip
 * belonged to the table while the desk swapped tables. That plumbing was
 * deleted on 2026-08-31 when page modes moved to {@link DeskPageChrome}'s top
 * row: a body carries no navigation now, and every `tabStrip` prop that rode
 * through `TechAllTriageTable`, `TestingHistoryList` and `ReceivingGridHost`
 * went with it.
 *
 * What survives is the SECOND level — sub-modes inside one page tab (Locations'
 * Bin Tags / Racks / Rooms, Support's ticket statuses, Walk-in's per-mode
 * lanes). Those are not page navigation and do not belong on the page frame.
 */
export interface DataTableTabStrip {
  tabs: readonly DataTableTab[];
  /** `undefined` = the unfiltered list. There is no `all` tab. */
  activeTab?: string;
  onTabChange: (id: string) => void;
}

/** One selection verb painted on the status bar's left (Copy, Assign, …). */
export interface TableStatusSelectionAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  /** Design-system Button fill. Defaults to `secondary`. */
  variant?: ButtonVariant;
  /** Single-letter hotkey (bound while selected; revealed inline after `?`). */
  hotkey?: string;
}

export interface TableStatusBarProps {
  tabs?: readonly DataTableTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /**
   * Idle-left context readout (date/folder path, archive place). Painted only
   * when there are no selection CTAs and no legacy sub-mode `tabs`.
   *
   * Precedence: `selectionActions` (and legacy Copy) beat `tabs` beat `lead`
   * beat empty spacer. A readout, never an action — same fence as
   * `DeskPageChrome`'s `tabsLead`, different component. Path-contraction
   * crumbs are the one allowed interactive exception and stay
   * caption-weight `ds-raw-button`, not {@link Button}.
   */
  lead?: ReactNode;
  /**
   * Rows this view is showing. Omit on a desk whose body is a RAIL rather than
   * a table — it has tabs but no row count, and a made-up number is worse than
   * no number.
   */
  shown?: number;
  /**
   * Rows behind the CURRENT narrowing — the denominator of {@link shown}.
   *
   * Omit it whenever no single number honestly describes what is on screen
   * (two filters composing, a set the server cannot count), and the bar prints
   * the row count alone. It used to be handed the collection's UNFILTERED
   * total, so a facet-narrowed view read "12 of 922" — a denominator for a set
   * the operator was not looking at.
   */
  total?: number;
  /** Rows the operator has picked. Zero prints nothing — see below. */
  selected?: number;
  /**
   * Live selection CTAs (Assign, Copy, Listing → staff, …). Painted flush left
   * when a selection exists — the ONLY way a verb reaches this strip. There is
   * no legacy Copy fallback and no bare "N more actions" count: a foot that
   * synthesizes its own button is a second place to run a verb the row owns.
   */
  selectionActions?: readonly TableStatusSelectionAction[];
  /**
   * The next page, as part of the count sentence rather than a band under it.
   *
   * "Showing 200 of 847" used to be printed a second time by a footer below the
   * bar, against a different denominator — two answers to "how many are left",
   * neither matching the active filter. One sentence, one owner, and one fewer
   * band inserted after first paint.
   */
  onLoadMore?: () => void;
}

/**
 * The tab strip itself, extracted so the two surfaces that mount a tab band
 * ABOVE their body (the walk-in desk, the photo-library scope band) draw the
 * same control the status bar foots a table with. One tab face, two positions —
 * a second copy of these buttons is how the display layer forked last time.
 */
export function TableTabs({
  tabs,
  activeTab,
  onTabChange,
  className,
}: DataTableTabStrip & { className?: string }) {
  return (
    <div
      role={tabs.length > 0 ? 'tablist' : undefined}
      className={cn('flex min-w-0 flex-1 items-stretch gap-0 overflow-x-auto', className)}
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
            data-testid={`data-table-tab-${tab.id}`}
            data-active={active ? '' : undefined}
            className={cn(
              'ds-raw-button relative inline-flex shrink-0 items-center gap-1 px-3 text-role-caption',
              // Colour only — a tab that slid or grew would move its
              // neighbours, which ops chrome forbids (AGENTS.md).
              'transition-colors duration-100 ease-out',
              PRIMARY_CHROME_ROW_FACE,
              cornerClass('flush'),
              focusRing('control'),
              active
                ? 'font-semibold text-text-default'
                : 'text-text-soft hover:text-text-default',
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
            {/*
              Selection is a solid hairline UNDER the tab (operator ruling
              2026-08-30) — not a filled face inside a border box. The old
              treatment painted `border-x` + a card fill, which drew a
              three-sided box that read as a raised chip and made the strip
              look like two nested surfaces. An underline is one mark, moves no
              neighbour, and needs no second colour.
            */}
            {active ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-text-default"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Teaching keycap — {@link KeyboardKey} SoT, overlaid right-inside the Button.
 * Zero layout shift.
 */
function HotkeyGlyph({ letter }: { letter: string }) {
  return (
    <KeyboardKey
      aria-hidden
      size="sm"
      data-testid="data-table-selection-hotkey-cap"
      className="pointer-events-none absolute right-1.5 top-1/2 z-raised -translate-y-1/2"
    >
      {letter}
    </KeyboardKey>
  );
}

function StatusActionButton({
  action,
  showHotkey,
}: {
  action: TableStatusSelectionAction;
  showHotkey: boolean;
}) {
  const variant = action.variant ?? 'secondary';
  const hotkey = action.hotkey?.trim().toLowerCase();
  const hasHotkey = !!hotkey && hotkey.length === 1;
  const showGlyph = Boolean(showHotkey && hasHotkey);
  const aria = hasHotkey
    ? `${action.label} (press ${hotkey.toUpperCase()})`
    : action.label;

  return (
    <span className="relative inline-flex shrink-0" data-testid="data-table-selection-action-wrap">
      <Button
        type="button"
        variant={variant}
        size="sm"
        radius="pill"
        icon={action.icon}
        onClick={action.onClick}
        aria-label={aria}
        aria-keyshortcuts={hasHotkey ? hotkey.toUpperCase() : undefined}
        data-testid={`data-table-selection-action-${action.key}`}
      >
        {action.label}
      </Button>
      {showGlyph && hotkey ? <HotkeyGlyph letter={hotkey} /> : null}
    </span>
  );
}

export function TableStatusBar({
  tabs,
  activeTab,
  onTabChange,
  lead,
  shown,
  total,
  selected = 0,
  selectionActions,
  onLoadMore,
}: TableStatusBarProps) {
  const hasSelection = selected > 0;

  // Verbs come from the caller or not at all.
  //
  // There used to be a fallback here that HAND-ROLLED a Copy pill out of
  // `onCopySelection` whenever a surface passed no verbs — a button this strip
  // invented for itself, sitting under a table whose row already owns its
  // actions. It went with the bottom action strip; a foot that builds its own
  // CTA is how a second place to run a verb comes back.
  const leftActions: TableStatusSelectionAction[] =
    hasSelection && selectionActions ? [...selectionActions] : [];

  const hasCtas = leftActions.length > 0;
  // Keyboard `?` only — no foot question-mark control (operator 2026-09-01).
  const { showHotkeys: inlineHotkeys } = useSelectionStatusBarHotkeys(
    leftActions,
    hasCtas,
  );


  const tabList = tabs ?? [];
  const showTabs = tabList.length > 0;
  const showLeftCluster = hasCtas;
  // Precedence: selection CTAs beat tabs beat lead beat empty spacer.
  const showLead = Boolean(lead) && !showLeftCluster && !showTabs;

  return (
    <div
      data-testid="data-table-status"
      className={cn(
        'sticky bottom-0 z-raised flex min-w-0 items-stretch justify-between gap-0',
        'bg-surface-card',
        PRIMARY_CHROME_ROW_FACE,
        showLeftCluster ? 'min-h-11' : undefined,
      )}
    >
      {/*
        LEFT: pill CTAs, else legacy sub-mode tabs, else idle `lead` readout.
        Keyboard `?` overlays Linear keycaps on CTA faces (right-aligned) —
        zero layout shift.
      */}
      <div className="flex min-w-0 flex-1 items-stretch gap-0 overflow-x-auto">
        {showLeftCluster ? (
          <div
            className="flex shrink-0 items-center gap-1.5 px-2 py-1"
            role="toolbar"
            aria-label="Selection actions"
            data-testid="data-table-selection-actions"
          >
            {leftActions.map((action) => (
              <StatusActionButton
                key={action.key}
                action={action}
                showHotkey={inlineHotkeys}
              />
            ))}
          </div>
        ) : null}
        {showTabs ? (
          <TableTabs tabs={tabList} activeTab={activeTab} onTabChange={onTabChange ?? (() => {})} />
        ) : showLead ? (
          <div
            className="flex min-w-0 flex-1 items-center px-3 py-1"
            data-testid="data-table-status-lead"
          >
            {lead}
          </div>
        ) : !showLeftCluster ? (
          <div className="min-w-0 flex-1" />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 px-3 text-role-micro text-text-soft">
        {/*
          Zero selected renders NOTHING. "0 selected" is a sentence about
          something that has not happened, and it trains an operator to stop
          reading the corner the moment a real count appears there.
        */}
        {selected > 0 ? (
          <span
            className="tabular-nums font-semibold text-text-default"
            data-testid="data-table-selected-count"
          >
            {selected.toLocaleString()} selected
          </span>
        ) : null}
        {typeof shown === 'number' ? (
          <span className="tabular-nums" data-testid="data-table-row-count">
            {typeof total === 'number'
              ? `${shown.toLocaleString()} of ${total.toLocaleString()}`
              : `${shown.toLocaleString()} ${shown === 1 ? 'row' : 'rows'}`}
          </span>
        ) : null}
        {onLoadMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            data-testid="data-table-load-more"
            className={cn(
              'ds-raw-button text-role-micro font-semibold text-text-accent',
              focusRing('control'),
              'hover:underline',
            )}
          >
            Load more
          </button>
        ) : null}
      </div>
    </div>
  );
}
