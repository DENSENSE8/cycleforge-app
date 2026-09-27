'use client';

/**
 * The bar above a TriageCardList (owner 2026-09-27): select-all · Find (when
 * the sidebar is closed) · status chips (or the bulk verbs while 2+ are
 * checked) · pager · record count · per-page · sort · Floor · ⤢ (always last).
 * Mobile first: under @3xl the chips / bulk verbs take their own full-width
 * row and scroll sideways. Family-agnostic: the family names its records
 * (`noun`) and prefixes the test ids.
 */

import { useEffect, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from '@/components/Icons';
import { DataTableSortMenu } from '@/components/tables/DataTable';
import { DataTableFullscreenToggle } from '@/components/tables/DataTableFullscreenToggle';
import { FindField, findHints } from '@/design-system/components/FindField';
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/primitives/radix-popover';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SLOT_TABLE_PAGE_SIZES } from '@/lib/tables/slot-table-page';
import { cn } from '@/utils/_cn';
import type { TriagePageMode } from './triage-list-state';
import { CARD_LIST_SETTLE_S } from '../record-card/RecordCard';

const SPRING = { type: 'spring', stiffness: 480, damping: 36, mass: 0.8 } as const;
/**
 * The sidebar-close handoff: the Find field and the status pills move as ONE
 * motion, slow enough to read (owner 2026-09-27) — ease-out, no bounce.
 */
const FIND_SLIDE = { type: 'tween', duration: 0.45, ease: [0.22, 1, 0.36, 1] } as const;

/** The top-right pager: `1–100 of 238` with previous / next. */
export interface TriagePager {
  label: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

const ICON_BUTTON_CLASS = cn(
  'flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-sunken hover:text-text-default disabled:pointer-events-none disabled:opacity-35',
  focusRing('control'),
);

function Pager({ pager, testId }: { pager: TriagePager; testId: string }) {
  return (
    <span className="flex items-center gap-0.5" data-testid={testId}>
      <span className="px-1 text-xs tabular-nums text-text-muted">{pager.label}</span>
      <button type="button" aria-label="Previous page" aria-keyshortcuts="[" disabled={!pager.canPrev} onClick={pager.onPrev} className={ICON_BUTTON_CLASS}>
        <ChevronLeft className="size-4" />
      </button>
      <button type="button" aria-label="Next page" aria-keyshortcuts="]" disabled={!pager.canNext} onClick={pager.onNext} className={ICON_BUTTON_CLASS}>
        <ChevronRight className="size-4" />
      </button>
    </span>
  );
}

/** Per page: 20 · 50 · 100 · 200, or Scroll (every loaded card, the next chunk loading near the end). */
function PageModeMenu({
  mode,
  onChange,
  label,
  testId,
}: {
  mode: TriagePageMode;
  onChange: (mode: TriagePageMode) => void;
  label: string;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const options: readonly TriagePageMode[] = [...SLOT_TABLE_PAGE_SIZES, 'scroll'];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          aria-label={label}
          className={cn('h-8 rounded-lg px-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text-default', focusRing('control'))}
        >
          {mode === 'scroll' ? 'Scroll' : `${mode} / page`}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 rounded-xl p-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => {
              onChange(option);
              setOpen(false);
            }}
            className={cn(
              'flex h-8 w-full items-center justify-between rounded-lg px-2 text-left text-sm hover:bg-surface-sunken',
              mode === option ? 'font-semibold text-text-default' : 'text-text-muted',
              focusRing('control'),
            )}
          >
            {option === 'scroll' ? 'Scroll (load as you go)' : `${option} per page`}
            {mode === option ? <span aria-hidden className="size-1.5 rounded-full bg-text-default" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The bar's Find — on screen whenever the sidebar (and its Find) is closed,
 * between select-all and the status chips (owner 2026-09-27). Types into the
 * same desk query the sidebar's Find does; F focuses it. Same `FindField` as
 * the sidebar: rest "Find", hints roll while you look at it, paste key right.
 */
function BarFind({
  value,
  onChange,
  inputRef,
  label,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement>;
  label: string;
  testId: string;
}) {
  return (
    <FindField
      value={value}
      onChange={onChange}
      label={label}
      hints={findHints(label)}
      inputRef={inputRef}
      debounceMs={200}
      size="bar"
      testId={testId}
    />
  );
}

export function TriageSelectBar({
  noun,
  testIdPrefix,
  selectedCount,
  allSelected,
  total,
  pager,
  pageMode,
  onPageModeChange,
  sortMenu,
  summary,
  onToggleAll,
  onClear,
  bulk,
  find,
}: {
  /** What the list holds ("order" / "orders") — aria labels and Find. */
  noun: { one: string; many: string };
  /** Test id prefix (`order-card` → `order-card-select-bar`, `order-card-pager`, …). */
  testIdPrefix: string;
  selectedCount: number;
  allSelected: boolean;
  /** Records in the list — left of the view controls (owner 2026-09-27). */
  total: number;
  /** Null when everything fits on one page (or in scroll mode). */
  pager: TriagePager | null;
  pageMode: TriagePageMode;
  onPageModeChange: (mode: TriagePageMode) => void;
  sortMenu: ComponentProps<typeof DataTableSortMenu>;
  /** Status filter chips with their counts. */
  summary: ReactNode;
  onToggleAll: () => void;
  onClear: () => void;
  /** The check-set's verbs (two or more checked). */
  bulk: ReactNode;
  /**
   * The bar's own Find — non-null ONLY while the sidebar is closed (owner
   * 2026-09-27). Sidebar open: the bar shows no Find at all; the sidebar owns it.
   */
  find: { value: string; onChange: (value: string) => void; inputRef: RefObject<HTMLInputElement> } | null;
}) {
  const active = selectedCount > 0;
  const bulkMode = selectedCount > 1;
  // True only for the bar's first render — the chips' entrance delay reads it.
  const firstPaint = useRef(true);
  useEffect(() => {
    firstPaint.current = false;
  }, []);
  // @3xl+: the chips take the LEFTOVER width (basis-0) and scroll sideways, so
  // Find + chips never push per-page · sort · Floor · count onto a second row.
  const middleClass = 'order-last flex min-w-0 basis-full items-center @3xl:order-none @3xl:flex-1 @3xl:basis-0';
  return (
    <div className="@container">
      {/* No `layout` on the bar: a size tween scales its text (owner
          2026-09-27 — the chips' labels stretched while the list resized). */}
      <div
        data-testid={`${testIdPrefix}-select-bar`}
        className={cn(
          // pl-4 + a 28px box column = the cards' check axis; gap-x-3 = the cards' ml-3.
          'flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl py-1.5 pl-4 pr-1.5 transition-[background-color,box-shadow] duration-200',
          active ? 'bg-surface-card shadow-elev-raised ring-1 ring-border-soft' : 'bg-transparent',
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={allSelected ? true : active ? 'mixed' : false}
          aria-label={allSelected ? 'Clear selection' : `Select all ${noun.many} on this page`}
          data-testid={`${testIdPrefix}-select-all`}
          onClick={onToggleAll}
          className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', focusRing('control'))}
        >
          <span
            className={cn(
              'flex size-[18px] items-center justify-center rounded-[5px] border transition-colors',
              active ? 'border-text-default bg-text-default text-surface-card' : 'border-border-strong bg-surface-card hover:border-text-muted',
            )}
          >
            {active ? (
              <svg viewBox="0 0 16 16" className="size-3" fill="none" aria-hidden>
                <path d={allSelected ? 'M3.5 8.5l3 3 6-7' : 'M4 8h8'} stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </span>
        </button>

        <AnimatePresence mode="popLayout" initial={false}>
          {active ? (
            <motion.span
              key="selected"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
              className="flex shrink-0 items-center gap-1 text-sm font-semibold text-text-default"
            >
              <motion.span key={selectedCount} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING} className="tabular-nums">
                {selectedCount}
              </motion.span>
              selected
            </motion.span>
          ) : null}
        </AnimatePresence>

        {/* Sidebar closed: its Find slides out of the checkbox into a narrow
            slot before the chips, and the chips glide right to make room (and
            back left when it leaves). Hidden under the bulk verbs, which need
            the width. No entrance on first paint (`initial={false}`);
            `popLayout` lets the chips start moving the moment it exits. */}
        <AnimatePresence mode="popLayout" initial={false}>
          {find && !bulkMode ? (
            <motion.div
              key="bar-find"
              initial={{ opacity: 0, x: -24, clipPath: 'inset(0 100% 0 0 round 8px)' }}
              animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0% 0 0 round 8px)' }}
              exit={{ opacity: 0, x: -24, clipPath: 'inset(0 100% 0 0 round 8px)' }}
              transition={FIND_SLIDE}
              className="w-48 min-w-0 flex-none"
            >
              <BarFind {...find} label={`Find ${noun.many}`} testId={`${testIdPrefix}-inline-find`} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.div
          layout="position"
          transition={FIND_SLIDE}
          className={cn(middleClass, active && !bulkMode && 'hidden')}
        >
          {/* The chips' first paint waits for the cards to land, then rises
              from below (owner 2026-09-27); later swaps (bulk ⇄ chips) are immediate. */}
          <AnimatePresence mode="popLayout" initial>
            {bulkMode ? (
              <motion.div
                key="bulk"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={SPRING}
                className="flex min-w-0 flex-1 items-center"
              >
                {bulk}
              </motion.div>
            ) : active ? null : (
              <motion.div
                key="summary"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={firstPaint.current ? { ...SPRING, delay: CARD_LIST_SETTLE_S } : SPRING}
                className="flex min-w-0 flex-1 items-center"
              >
                {summary}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Right cluster — the pager stays while rows are checked, so paging
            never costs a Clear. */}
        <span className="ml-auto flex shrink-0 items-center gap-1 @3xl:ml-0">
          {/* No Find button here: sidebar open → the sidebar's Find; closed → the field above. */}
          {pager ? <Pager pager={pager} testId={`${testIdPrefix}-pager`} /> : null}
          {active ? (
            <button type="button" onClick={onClear} aria-label="Clear selection" data-testid={`${testIdPrefix}-clear`} className={ICON_BUTTON_CLASS}>
              <X className="size-4" />
            </button>
          ) : (
            // Numbers first, view controls after, the ⤢ fullscreen toggle always last (owner 2026-09-27).
            <>
              <span
                data-testid={`${testIdPrefix}-count`}
                aria-label={`${total} ${total === 1 ? noun.one : noun.many}`}
                className="pl-1 pr-1.5 text-sm font-semibold tabular-nums text-text-muted"
              >
                <motion.span key={total} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING} className="inline-block">
                  {total}
                </motion.span>
              </span>
              <PageModeMenu
                mode={pageMode}
                onChange={onPageModeChange}
                label={`${noun.many.charAt(0).toUpperCase()}${noun.many.slice(1)} per page`}
                testId={`${testIdPrefix}-page-mode`}
              />
              <DataTableSortMenu {...sortMenu} />
              <DataTableFullscreenToggle />
            </>
          )}
        </span>
      </div>
    </div>
  );
}
