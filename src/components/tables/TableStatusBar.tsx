'use client';

/**
 * The one status strip a table paints at its foot: tabs left, counts right.
 *
 * ```text
 * ┌────────────────────────────────────────────┬─────────────────────────────┐
 * │ [ Must ship ] [ Urgent ] [ Out of stock ]  │  12 selected · 200 of 922   │
 * └────────────────────────────────────────────┴─────────────────────────────┘
 * ```
 *
 * ## Why it is its own component
 *
 * {@link DataTable} draws every binding-backed table, but the station desks
 * also mount `StationListTable` (the week-scoped history list, which is not on
 * the binding waist). Both need the SAME strip, and two copies of it is how the
 * display layer forked the last time. One component, two mounts — not one
 * component per surface.
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
 * The `tabs` props stay for the surfaces still passing them (Labels, Photos,
 * Locations, Support, Walk-in). **Do not wire a new one.** A page's modes
 * belong to its frame; what this strip is genuinely for is the right half —
 * shown / total / selected / copy, which is the one thing a table knows and a
 * frame does not.
 */

import { Copy } from '@/components/Icons';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
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

export interface TableStatusBarProps {
  tabs?: readonly DataTableTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
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
  /** Offered only while a selection exists. */
  onCopySelection?: () => void;
  /**
   * Everything the selection can do, for the corner to advertise.
   *
   * Copy alone used to be the whole offer here while seven other bulk verbs
   * lived in a rail that only registers at 3+ rows — so an operator who checked
   * one row was told the product could copy and nothing else. The bar does not
   * host the verbs (the rail owns them); it names how many there are, so the
   * capability is visible from the first checkbox.
   */
  selectionActionCount?: number;
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
                : 'text-text-muted hover:text-text-default',
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

export function TableStatusBar({
  tabs,
  activeTab,
  onTabChange,
  shown,
  total,
  selected = 0,
  onCopySelection,
  selectionActionCount = 0,
  onLoadMore,
}: TableStatusBarProps) {
  // Copy is drawn here; the rest live in the rail. Name only the remainder, or
  // the sentence claims the corner holds verbs it does not.
  const moreActions = selected > 0 ? Math.max(0, selectionActionCount - 1) : 0;

  return (
    <div
      data-testid="data-table-status"
      className={cn(
        'sticky bottom-0 z-raised flex min-w-0 items-stretch justify-between gap-0',
        'border-t border-border-soft bg-surface-card',
        PRIMARY_CHROME_ROW_FACE,
      )}
    >
      <TableTabs tabs={tabs ?? []} activeTab={activeTab} onTabChange={onTabChange ?? (() => {})} />

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
        {selected > 0 && onCopySelection ? (
          <button
            type="button"
            onClick={onCopySelection}
            data-testid="data-table-copy-selection"
            aria-label={`Copy ${selected} selected rows`}
            className={cn(
              'ds-raw-button inline-flex items-center gap-1 text-role-micro font-semibold text-text-accent',
              focusRing('control'),
              'hover:underline',
            )}
          >
            <Copy className="h-3 w-3 shrink-0" />
            Copy
          </button>
        ) : null}
        {moreActions > 0 ? (
          <span data-testid="data-table-selection-more" className="tabular-nums">
            {moreActions} more {moreActions === 1 ? 'action' : 'actions'}
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
