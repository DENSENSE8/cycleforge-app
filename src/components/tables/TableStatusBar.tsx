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
 * ## Why tabs sit at the bottom
 *
 * They used to be the first of four chrome rows above the column header. A
 * spreadsheet puts its sheet tabs at the bottom and its status summary beside
 * them, and an operator who has used a spreadsheet already knows where to look.
 * The deep-link contract is unchanged — a tab still writes the URL and is still
 * one click — so the interaction budget (`AGENTS.md`) is identical.
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
 * A whole tab strip, as one value.
 *
 * Station desks switch BODIES on a tab (Testing: All ⇄ History; Shipping:
 * Pending ⇄ All ⇄ History), so the strip cannot belong to any single table —
 * but it must still be drawn once, by whichever table is mounted. The desk
 * resolves the strip and threads this to the body it picks; the body spreads it
 * onto its table. The keys match the table's props exactly, so the spread is
 * the whole wiring.
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
  /** Rows the collection holds before this view's narrowing. */
  total?: number;
  /** Rows the operator has picked. Zero prints nothing — see below. */
  selected?: number;
  /** Offered only while a selection exists. */
  onCopySelection?: () => void;
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
}: TableStatusBarProps) {

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
        {typeof shown === 'number' ? (
          <span className="tabular-nums" data-testid="data-table-row-count">
            {typeof total === 'number'
              ? `${shown.toLocaleString()} of ${total.toLocaleString()}`
              : `${shown.toLocaleString()} ${shown === 1 ? 'row' : 'rows'}`}
          </span>
        ) : null}
      </div>
    </div>
  );
}
