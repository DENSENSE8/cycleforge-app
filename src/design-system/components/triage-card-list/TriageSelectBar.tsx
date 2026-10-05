'use client';

/**
 * The bar above a TriageCardList (owner 2026-09-27): select-all · record count
 * (or "N selected") · status chips (or, with anything checked, the
 * selection's verbs) · pager · per-page · density (Compact · Full switch, where
 * the host offers it) · view switch (In place · Split) · fullscreen (always
 * last). No Find: the page has ONE field — the sidebar's, or
 * the global header's while the sidebar is closed (owner 2026-09-28). Law 5:
 * the verbs live ONLY here, the same list in the same order at 1 or N checked.
 * Mobile first: under @3xl the chips / verbs take their own full-width row and
 * scroll sideways. Family-agnostic: the family names its records (`noun`) and
 * prefixes the test ids.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from '@/components/Icons';
import { DeskRecordViewSwitch } from '@/design-system/components/DeskRecordViewSwitch';
import { DeskFullscreenToggle } from '@/design-system/components/DeskFullscreenToggle';
import { SegmentedGlyphSwitch, type SegmentedGlyphOption } from '@/design-system/components/SegmentedGlyphSwitch';
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/primitives/radix-popover';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { DATA_TABLE_PAGE_SIZES } from '@/lib/tables/data-table-pagination';
import { cn } from '@/utils/_cn';
import type { TriagePageMode } from './triage-list-state';
import type { TriageDensity } from './triage-density';
import { CARD_LIST_SETTLE_S } from '../record-card/RecordCard';

const SPRING = { type: 'spring', stiffness: 480, damping: 36, mass: 0.8 } as const;

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

/** Compact: one line per record — three ruled rows. */
function CompactGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 16" fill="none" aria-hidden className={className}>
      <rect x="1" y="1" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 5h12M4 8h12M4 11h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Full: each record a card — two blocks, a photo and two lines each. */
function FullGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 16" fill="none" aria-hidden className={className}>
      <rect x="1" y="1" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.5" y="3.5" width="3.5" height="3.5" rx="0.75" fill="currentColor" opacity="0.35" />
      <rect x="3.5" y="9" width="3.5" height="3.5" rx="0.75" fill="currentColor" opacity="0.35" />
      <path d="M9 4.5h7M9 6.5h4M9 10h7M9 12h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

/** The operator's density pick — `useTriageDensity`'s pair. */
export interface TriageDensityControl {
  value: TriageDensity;
  onChange: (density: TriageDensity) => void;
}

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

/** List view — Compact (rows) | Full (cards), one click, the same switch grammar as In place · Split. */
function DensitySwitch({ control, testId }: { control: TriageDensityControl; testId: string }) {
  const options: readonly SegmentedGlyphOption<TriageDensity>[] = [
    { value: 'row', label: 'Compact', Glyph: CompactGlyph, testId: `${testId}-row` },
    { value: 'card', label: 'Full', Glyph: FullGlyph, testId: `${testId}-card` },
  ];
  return <SegmentedGlyphSwitch options={options} value={control.value} onChange={control.onChange} ariaLabel="List view" testId={testId} />;
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
  const options: readonly TriagePageMode[] = [...DATA_TABLE_PAGE_SIZES, 'scroll'];
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

export function TriageSelectBar({
  noun,
  testIdPrefix,
  selectedCount,
  allSelected,
  total,
  pager,
  pageMode,
  onPageModeChange,
  summary,
  onToggleAll,
  onClear,
  bulk,
  viewControls = true,
  summaryInline = false,
  densityControl,
}: {
  /** What the list holds ("order" / "orders") — aria labels. */
  noun: { one: string; many: string };
  /** Test id prefix (`order-card` → `order-card-select-bar`, `order-card-pager`, …). */
  testIdPrefix: string;
  selectedCount: number;
  allSelected: boolean;
  /** Records in the list — beside select-all, before the status chips (owner 2026-09-27). */
  total: number;
  /** Null when everything fits on one page (or in scroll mode). */
  pager: TriagePager | null;
  /** Null when the host pages on the server — the size is its own; no per-page menu. */
  pageMode: TriagePageMode | null;
  onPageModeChange: (mode: TriagePageMode) => void;
  /** Non-filter list read-out (A4 2026-10-04: status filter chips live in the page's sidebar facets, not here). */
  summary?: ReactNode;
  onToggleAll: () => void;
  onClear: () => void;
  /** The selection's verbs — painted while one or more are checked (Law 5). */
  bulk: ReactNode;
  /**
   * The view switch + fullscreen toggle. Off on a rail desk (Labels & docs):
   * its one view is the fixed-width rail + record, so there is nothing to pick.
   */
  viewControls?: boolean;
  /** The Compact / Full switch — painted before the fullscreen toggle when the host offers the choice. */
  densityControl?: TriageDensityControl;
  /**
   * Keep the chips on the bar's one line at every width — between the count
   * and the pager, scrolling sideways — instead of wrapping under it below
   * @3xl. For a desk whose chips ARE its triage (Stock's rooms).
   */
  summaryInline?: boolean;
}) {
  const active = selectedCount > 0;
  // True only for the bar's first render — the chips' entrance delay reads it.
  const firstPaint = useRef(true);
  useEffect(() => {
    firstPaint.current = false;
  }, []);
  // @3xl+: the chips take the LEFTOVER width (basis-0) and scroll sideways, so
  // chips never push pager · per-page · view switch onto a second row. Find is
  // never here — it is the page's one field, in the sidebar or (closed) the
  // global header (owner 2026-09-28).
  const middleClass = summaryInline
    ? 'flex min-w-0 flex-1 basis-0 items-center'
    : 'order-last flex min-w-0 basis-full items-center @3xl:order-none @3xl:flex-1 @3xl:basis-0';
  return (
    // The desk stage clips its overflow, and the list below paints after the
    // bar: px-1 keeps the raised shadow's sides inside the stage, and the z
    // layer (above the list's sticky section headers, z-20) lets its bottom
    // shadow fall over the cards instead of under them.
    <div className="@container relative z-30 px-1">
      {/* No `layout` on the bar: a size tween scales its text (owner
          2026-09-27 — the chips' labels stretched while the list resized). */}
      <div
        data-testid={`${testIdPrefix}-select-bar`}
        className={cn(
          // List is px-1 and the card is pl-4, so the 28px check column starts
          // 20px in. px-1 + pl-3 sat the select-all 4px left of the row checks
          // (measured on /fulfilled 2026-09-30). gap-x-3 = the cards' ml-3.
          'flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl py-1.5 pl-4 pr-0.5 transition-[background-color,box-shadow] duration-200',
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

        {/* The list's size sits between select-all and the status chips (owner
            2026-09-27) — the same slot the check-set's "N selected" takes, so
            the number beside the checkbox is always "how many this box acts on". */}
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
          ) : (
            <motion.span
              key="count"
              data-testid={`${testIdPrefix}-count`}
              aria-label={`${total} ${total === 1 ? noun.one : noun.many}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
              className="shrink-0 text-sm font-semibold tabular-nums text-text-muted"
            >
              <motion.span key={total} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING} className="inline-block">
                {total}
              </motion.span>
            </motion.span>
          )}
        </AnimatePresence>

        <motion.div className={middleClass}>
          {/* The chips' first paint waits for the cards to land, then rises
              from below (owner 2026-09-27); later swaps (verbs ⇄ chips) are immediate. */}
          <AnimatePresence mode="popLayout" initial>
            {active ? (
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
            ) : (
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
            // View controls, the view switch always last (owner 2026-09-27). The count lives beside select-all.
            <>
              {pageMode ? (
                <PageModeMenu
                  mode={pageMode}
                  onChange={onPageModeChange}
                  label={`${noun.many.charAt(0).toUpperCase()}${noun.many.slice(1)} per page`}
                  testId={`${testIdPrefix}-page-mode`}
                />
              ) : null}
              {/* List view — Compact | Full, one click — sits just left of the view switch. */}
              {densityControl ? <DensitySwitch control={densityControl} testId={`${testIdPrefix}-density`} /> : null}
              {/* How a record opens — In place or Split — seen and switched before one is open. */}
              {viewControls ? <DeskRecordViewSwitch /> : null}
              {/* ⤢ always the bar's last, top-right-most control (owner 2026-09-27). */}
              {viewControls ? <DeskFullscreenToggle /> : null}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
