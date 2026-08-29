'use client';

/**
 * `SheetBottomBar` — sheet tabs left, live counts right. One strip.
 *
 * ```text
 * ┌────────────────────────────────────────────┬─────────────────────────────┐
 * │ [ To-ship ] [ Tested ] [ Packed ] [ … ]  + │  12 selected · 200 of 922 ▾ │
 * └────────────────────────────────────────────┴─────────────────────────────┘
 * ```
 *
 * ## Why tabs moved down here
 *
 * They were Band 1, above a KPI strip, above a find row, above the column
 * header — four chrome rows before the first datum. A spreadsheet puts its sheet
 * tabs at the bottom and its status summary beside them, and an operator who has
 * used a spreadsheet already knows where to look. **The deep-link contract is
 * unchanged**: a tab still writes the URL and is still one click, so the
 * interaction budget (`AGENTS.md`) is identical — this is a move, not a
 * demotion behind a menu.
 *
 * ## Why the counts share this strip instead of getting their own
 *
 * Google Sheets does exactly this, and a second full-width strip would cost
 * another 28px of chrome to say two numbers. Tabs and counts have no layout
 * relationship — one is `flex-1` and scrolls, the other is `shrink-0` — so they
 * coexist without fighting.
 *
 * The bar is `sticky bottom-0` **on the sheet host**, deliberately outside the
 * grid's own scroll port: the column header already owns the one sticky layer
 * inside that port, and a second one there is what makes a virtualized header
 * shear off its rows.
 */

import type { ReactNode } from 'react';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { useAuth } from '@/contexts/AuthContext';
import { SheetAddTableMenu } from '@/components/sheet/SheetAddTableMenu';
import { useSheetChrome } from '@/components/sheet/sheet-chrome-context';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export interface SheetTab {
  id: string;
  label: string;
  /** Facet count shown beside the label. Omit for no count (honest absence). */
  count?: number;
}

export interface SheetBottomBarProps {
  /** A control that adds to the strip, rendered after the last tab. */
  tabsAction?: ReactNode;
  tabs?: readonly SheetTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /**
   * Hide the trailing "+" (the org table catalog).
   *
   * Default is to SHOW it wherever there is a tab strip: knowing which tables
   * the org runs is useful to everyone, and the picker is read-only without
   * `admin.manage_features`. Pass `true` for a strip whose tabs are not sheets
   * — a lifecycle facet rail has nothing to add.
   */
  hideAddTable?: boolean;
  /** Reopens the filter menu from the count. */
  onOpenFilters?: () => void;
  /** Extra status content, left of the counts (e.g. a sync stamp). */
  status?: ReactNode;
  className?: string;
}

function SheetTabButton({
  tab,
  active,
  onClick,
}: {
  tab: SheetTab;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-testid={`sheet-tab-${tab.id}`}
      data-active={active ? '' : undefined}
      className={cn(
        'ds-raw-button inline-flex shrink-0 items-center gap-1 px-3 text-role-caption',
        // Colour only. A tab that slid or grew would move its neighbours, which
        // is the layout animation ops chrome forbids.
        'transition-colors duration-100 ease-out',
        PRIMARY_CHROME_ROW_FACE,
        cornerClass('flush'),
        focusRing('control'),
        active
          ? // The active tab reads as the sheet you are ON — it joins the grid
            // above by dropping its own top rule, the way a spreadsheet tab
            // merges with its sheet.
            'border-x border-border-soft bg-surface-card font-semibold text-text-default'
          : 'text-text-muted hover:bg-surface-hover hover:text-text-default',
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
}

export function SheetBottomBar({
  tabsAction,
  tabs,
  activeTab,
  onTabChange,
  hideAddTable = false,
  onOpenFilters,
  status,
  className,
}: SheetBottomBarProps) {
  const { counts } = useSheetChrome();
  const { has } = useAuth();
  const hasTabs = Boolean(tabs && tabs.length > 0);
  const filtered =
    typeof counts.total === 'number' && counts.total !== counts.shown;

  return (
    <div
      data-sheet-bottom-bar=""
      className={cn(
        'sticky bottom-0 z-raised flex min-w-0 items-stretch justify-between gap-0',
        'border-t border-r border-border-soft bg-surface-card',
        PRIMARY_CHROME_ROW_FACE,
        className,
      )}
    >
      {/* ── Tabs: the yield surface, scrolls when the strip runs long ─────── */}
      <div
        role={hasTabs ? 'tablist' : undefined}
        className="flex min-w-0 flex-1 items-stretch gap-0 overflow-x-auto"
      >
        {tabs?.map((tab) => (
          <SheetTabButton
            key={tab.id}
            tab={tab}
            active={tab.id === activeTab}
            onClick={() => onTabChange?.(tab.id)}
          />
        ))}
        {tabsAction}
        {hasTabs && !hideAddTable ? (
          <SheetAddTableMenu canManage={has('admin.manage_features')} />
        ) : null}
      </div>

      {/* ── Counts, bottom right ─────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center gap-2 px-3 text-role-micro text-text-soft"
        data-testid="sheet-status-counts"
      >
        {status}
        {/*
          Zero selected renders NOTHING. "0 selected" is a sentence about
          something that has not happened, and it trains an operator to stop
          reading the corner the moment a real count appears there.
        */}
        {counts.selected > 0 ? (
          <span className="tabular-nums font-semibold text-text-default" data-testid="sheet-selected-count">
            {counts.selected.toLocaleString()} selected
          </span>
        ) : null}
        {typeof counts.total === 'number' ? (
          <span className="tabular-nums" data-testid="sheet-row-count">
            {counts.shown.toLocaleString()} of {counts.total.toLocaleString()}
          </span>
        ) : (
          <span className="tabular-nums" data-testid="sheet-row-count">
            {counts.shown.toLocaleString()} {counts.shown === 1 ? 'row' : 'rows'}
          </span>
        )}
        {filtered && onOpenFilters ? (
          <button
            type="button"
            onClick={onOpenFilters}
            data-testid="sheet-filter-count"
            className={cn(
              'ds-raw-button tabular-nums text-role-micro font-semibold text-text-accent',
              focusRing('control'),
              'hover:underline',
            )}
          >
            Filtered
            {counts.activeFilters > 0 ? ` (${counts.activeFilters})` : ''}
          </button>
        ) : null}
      </div>
    </div>
  );
}
