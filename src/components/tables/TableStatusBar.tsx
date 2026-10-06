'use client';

/** The one status strip a table paints at its foot: */

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { Button, type ButtonVariant } from '@/design-system/primitives/Button';
import { KeyboardChord } from '@/design-system/primitives/KeyboardKey';
import { hotkeyAriaShortcuts, hotkeyChord } from '@/lib/keyboard/key-registry';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useSelectionStatusBarHotkeys } from '@/hooks/useSelectionStatusBarHotkeys';
import { cn } from '@/utils/_cn';
import { formatDataTableCount, type DataTableRowNoun } from '@/lib/tables/data-table-pagination';


/** One tab in the strip. Never an `all` entry — see {@link DataTable}. */
export interface DataTableTab {
  id: string;
  label: string;
  /** Rows behind it. Omit for honest absence — never print a fake 0. */
  count?: number;
}

/** {@link TableTabs}' own props. */
interface DataTableTabStrip {
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
  /** Hotkey — a letter or a chord (`mod+c`, `key-registry`); bound while selected, revealed inline after `?`. */
  hotkey?: string;
}

interface TableStatusBarProps {
  tabs?: readonly DataTableTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** Idle-left context readout (date/folder path, archive place). */
  lead?: ReactNode;
  /**
   * Rows this view is showing. Omit on a desk whose body is a RAIL rather than
   * a table — it has tabs but no row count, and a made-up number is worse than
   * no number.
   */
  shown?: number;
  /** Rows behind the CURRENT narrowing — the denominator of {@link shown}. */
  total?: number;
  /** What the rows are called ("purchases") — default "rows". */
  rowNoun?: DataTableRowNoun;
  /** Rows the operator has picked. Zero prints nothing — see below. */
  selected?: number;
  /** Live selection CTAs (Assign, Copy, Listing → staff, …). */
  selectionActions?: readonly TableStatusSelectionAction[];
  /**
   * Previous / next page, drawn with the count sentence. Page size lives in
   * the table toolbar dropdown (20 / 50 / 100 / 200).
   */
  pager?: {
    pageIndex: number;
    pageCount: number;
    onPrev: () => void;
    onNext: () => void;
    nextDisabled?: boolean;
  };
  /**
   * The next fetch, as part of the count sentence rather than a band under it.
   * Prefer {@link pager} — kept for surfaces that still grow a loaded window.
   */
  onLoadMore?: () => void;
}

/** The tab strip itself, extracted so the two surfaces that mount a tab band ABOVE their body (the walk-in desk, the photo-library scope… */
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
            {/* Selection is a solid hairline UNDER the tab (operator ruling 2026-08-30) — not a filled face inside a border box. */}
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
 * Teaching keycaps — {@link KeyboardChord} (KeyboardKey SoT), overlaid
 * right-inside the Button. Zero layout shift.
 */
function HotkeyGlyph({ hotkey }: { hotkey: string }) {
  return (
    <span data-testid="data-table-selection-hotkey-cap" className="pointer-events-none absolute right-1.5 top-1/2 z-raised -translate-y-1/2">
      <KeyboardChord chord={hotkeyChord(hotkey)} size="sm" tone="default" />
    </span>
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
  const hotkey = action.hotkey?.trim();
  const showGlyph = Boolean(showHotkey && hotkey);
  const aria = hotkey
    ? `${action.label} (press ${hotkeyAriaShortcuts(hotkey).split(' ').at(-1)})`
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
        aria-keyshortcuts={hotkey ? hotkeyAriaShortcuts(hotkey) : undefined}
        data-testid={`data-table-selection-action-${action.key}`}
      >
        {action.label}
      </Button>
      {showGlyph && hotkey ? <HotkeyGlyph hotkey={hotkey} /> : null}
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
  rowNoun,
  selected = 0,
  selectionActions,
  pager,
  onLoadMore,
}: TableStatusBarProps) {
  const hasSelection = selected > 0;

  // Verbs come from the caller or not at all.
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
        {selected > 0 ? (
          <span
            className="tabular-nums font-semibold text-text-default"
            data-testid="data-table-selected-count"
          >
            {selected.toLocaleString()} selected
          </span>
        ) : null}
        {pager && (pager.pageCount > 1 || onLoadMore) ? (
          <button
            type="button"
            onClick={pager.onPrev}
            disabled={pager.pageIndex <= 0}
            data-testid="data-table-page-prev"
            aria-label="Previous page"
            className={cn(
              'ds-raw-button inline-flex items-center text-text-soft',
              focusRing('control'),
              'disabled:opacity-40',
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {typeof shown === 'number' ? (
          <span className="tabular-nums" data-testid="data-table-row-count">
            {formatDataTableCount(shown, total, rowNoun)}
          </span>
        ) : null}
        {pager && (pager.pageCount > 1 || onLoadMore) ? (
          <button
            type="button"
            onClick={pager.onNext}
            disabled={pager.pageIndex >= pager.pageCount - 1 && (pager.nextDisabled ?? !onLoadMore)}
            data-testid="data-table-page-next"
            aria-label="Next page"
            className={cn(
              'ds-raw-button inline-flex items-center text-text-soft',
              focusRing('control'),
              'disabled:opacity-40',
            )}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : onLoadMore ? (
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
