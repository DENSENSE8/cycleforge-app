'use client';

/**
 * `RecordLedger` — the industrial record ledger as a design-system primitive:
 * the To-ship desk's frame (`OutboundOrdersLedger`) with the orders feed taken
 * out, for every page that adopts the ledger after it
 * (HANDOFF-industrial-record-ledger).
 *
 *   ┌ toolbar (page slot) ─────────────────────────┬ SELECTED … · k / n ‹ › ✕ ┐
 *   │ record                                        │ evidence (page slot)       │
 *   │ record          virtual, fixed 97px rows      │                            │
 *   │ …                                             │                            │
 *   └ footer (page slot) ───────────────────────────┴────────────────────────────┘
 *
 * - Deliberately NOT the slot `DataTable`: no column header, no gutters, no
 *   card. Records are {@link IndustrialRecord}s the page renders.
 * - Rows are virtualized at a FIXED height ({@link RECORD_ROW_PX}); the
 *   virtualizer never measures.
 * - The evidence column is always mounted at ≥64rem container width, so opening
 *   a record never reflows the rows; below that it overlays them while open.
 * - Keys: J / K step the open record, Esc closes it (never inside a field, and
 *   never when a menu or dialog already handled Escape).
 * - The URL is the page's business: `openKey` comes in, `onOpenKey` /
 *   `onClose` go out.
 */

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronLeft, ChevronRight, X } from '@/components/Icons';
import { RECORD_LABEL_CLASS } from '../../tokens/industrial-record';
import { focusRing } from '../../tokens/focus-ring';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { cn } from '@/utils/_cn';
import {
  RECORD_DENSITY_STYLE,
  RECORD_EVIDENCE_WIDTH_CLASS,
  RECORD_HIT_CLASS,
  RECORD_ROW_CLASS,
  RECORD_ROW_PX,
  RECORD_TOOLBAR_CLASS,
} from './record-ledger-geometry';

/** Rows painted past the viewport on each side. */
const OVERSCAN = 6;

/** Stand-in rows while the first page loads. */
const LOADING_ROWS = 6;

const HEAD_ICON_CLASS = cn(
  'ds-raw-button inline-flex w-8 items-center justify-center text-mode-ink hover:bg-mode-hover disabled:opacity-40',
  RECORD_HIT_CLASS,
  focusRing('control'),
);

export interface RecordLedgerProps<T> {
  /** Accessible name of the record list (`SKU exceptions`). */
  label: string;
  records: readonly T[];
  recordKey: (record: T) => string;
  /** One record — an {@link IndustrialRecord}. */
  renderRecord: (record: T, open: boolean) => ReactNode;
  /** The open record's key, or null. May name a record not in `records` (a share link). */
  openKey: string | null;
  onOpenKey: (key: string) => void;
  onClose: () => void;
  /** Toolbar contents — search, facets, counts. Sits on the 1px ink rule. */
  toolbar: ReactNode;
  /** Optional strip under the toolbar (errors, notices). */
  banner?: ReactNode;
  /** Head of the evidence column: `Selected <noun>`. */
  evidenceNoun: string;
  /** Evidence column body — the open record, or the list read as a whole. */
  evidence: ReactNode;
  loading?: boolean;
  /** Painted when there are no records and nothing is loading. */
  empty: ReactNode;
  /** Status line under the records. */
  footer?: ReactNode;
  testId?: string;
}

export function RecordLedger<T>({
  label,
  records,
  recordKey,
  renderRecord,
  openKey,
  onOpenKey,
  onClose,
  toolbar,
  banner,
  evidenceNoun,
  evidence,
  loading = false,
  empty,
  footer,
  testId,
}: RecordLedgerProps<T>) {
  const keys = useMemo(() => records.map(recordKey), [records, recordKey]);
  const openIndex = openKey == null ? -1 : keys.indexOf(openKey);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => RECORD_ROW_PX,
    getItemKey: (index) => keys[index] ?? index,
    overscan: OVERSCAN,
  });
  useEffect(() => {
    if (openIndex >= 0) virtualizer.scrollToIndex(openIndex, { align: 'auto' });
  }, [openIndex, virtualizer]);

  const step = useCallback(
    (by: 1 | -1) => {
      if (keys.length === 0) return;
      const from = openIndex < 0 ? (by === 1 ? -1 : keys.length) : openIndex;
      const next = keys[Math.min(Math.max(from + by, 0), keys.length - 1)];
      if (next != null && next !== openKey) onOpenKey(next);
    },
    [keys, openIndex, openKey, onOpenKey],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableKeyTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'j') {
        event.preventDefault();
        step(1);
      } else if (key === 'k') {
        event.preventDefault();
        step(-1);
      } else if (key === 'escape' && openKey != null) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, openKey, onClose]);

  const open = openKey != null;

  return (
    <div
      data-testid={testId}
      className="@container flex min-h-0 min-w-0 flex-1 bg-mode-canvas text-mode-ink"
      style={RECORD_DENSITY_STYLE}
    >
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div data-testid="record-ledger-toolbar" className={RECORD_TOOLBAR_CLASS}>
            {toolbar}
          </div>
          {banner}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {records.length === 0 ? (
              loading ? (
                <div aria-busy role="status" aria-label={`Loading ${label}`}>
                  {Array.from({ length: LOADING_ROWS }, (_, index) => (
                    <div
                      key={index}
                      className={cn('flex border-b border-mode-rule bg-mode-panel', RECORD_ROW_CLASS)}
                    >
                      <span className="w-[5px] shrink-0 bg-mode-well" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-40 flex-col items-center justify-center gap-2 border-b border-mode-ink text-center">
                  {empty}
                </div>
              )
            ) : (
              <div
                role="list"
                aria-label={label}
                aria-busy={loading || undefined}
                className="relative w-full"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualizer.getVirtualItems().map((item) => {
                  const record = records[item.index];
                  if (record === undefined) return null;
                  return (
                    <div
                      key={item.key}
                      role="listitem"
                      className="absolute left-0 top-0 w-full"
                      style={{ transform: `translateY(${item.start}px)` }}
                    >
                      {renderRecord(record, item.index === openIndex)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {footer ? (
            <div
              className={cn(
                'flex shrink-0 items-center gap-3 border-t border-mode-ink bg-mode-bar px-3 text-mode-muted',
                RECORD_HIT_CLASS,
                RECORD_LABEL_CLASS,
              )}
            >
              {footer}
            </div>
          ) : null}
        </div>

        <aside
          aria-label={`Selected ${evidenceNoun}`}
          data-testid="record-evidence"
          className={cn(
            'min-h-0 shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-mode-ink bg-mode-panel',
            RECORD_EVIDENCE_WIDTH_CLASS,
            open ? 'absolute inset-y-0 right-0 z-sticky flex' : 'hidden',
            '@5xl:static @5xl:z-auto @5xl:flex',
          )}
        >
          <div className="flex min-h-full flex-col">
            <div
              className={cn(
                'box-content flex shrink-0 items-center border-b border-mode-ink bg-mode-bar pl-4',
                RECORD_HIT_CLASS,
              )}
            >
              <span className={cn(RECORD_LABEL_CLASS, 'flex-1 text-mode-muted')}>Selected {evidenceNoun}</span>
              {open && openIndex >= 0 ? (
                <span className={cn(RECORD_LABEL_CLASS, 'px-2 tabular-nums text-mode-muted')}>
                  {openIndex + 1} / {keys.length}
                </span>
              ) : null}
              {open ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous record"
                    aria-keyshortcuts="K"
                    className={HEAD_ICON_CLASS}
                    disabled={openIndex <= 0}
                    onClick={() => step(-1)}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Next record"
                    aria-keyshortcuts="J"
                    className={HEAD_ICON_CLASS}
                    disabled={openIndex < 0 || openIndex >= keys.length - 1}
                    onClick={() => step(1)}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Close record"
                    aria-keyshortcuts="Escape"
                    data-testid="record-evidence-close"
                    className={cn(HEAD_ICON_CLASS, 'border-l border-mode-edge')}
                    onClick={onClose}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </>
              ) : null}
            </div>
            {evidence}
          </div>
        </aside>
      </div>
    </div>
  );
}
