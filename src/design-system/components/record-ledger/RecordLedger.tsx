'use client';

/** `RecordLedger` — the industrial record ledger as a design-system primitive: */

import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DataTableFullscreenToggle } from '@/components/tables/DataTableFullscreenToggle';
import { RECORD_LABEL_CLASS } from '../../tokens/industrial-record';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { cn } from '@/utils/_cn';
import { DESK_RECORD_ANCHOR_ATTR, DESK_RECORD_KEY_ATTR, DeskRecordPlane, useDeskRecordView } from '../DeskRecordPlane';
import { useDeskStageOptional } from '../DeskStageContext';
import { RecordLedgerSummaryPane, RecordLedgerTally, type RecordLedgerSummary } from './RecordLedgerSummary';
import {
  RECORD_DENSITY_STYLE,
  RECORD_HIT_CLASS,
  RECORD_ROW_CLASS,
  RECORD_ROW_PX,
  RECORD_TOOLBAR_CLASS,
} from './record-ledger-geometry';

/** Rows painted past the viewport on each side. */
const OVERSCAN = 6;

/** Stand-in rows while the first page loads. */
const LOADING_ROWS = 6;

interface RecordLedgerNavigation {
  position: number | null;
  total: number;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  prevDisabled: boolean;
  nextDisabled: boolean;
}

interface RecordLedgerProps<T> {
  /** Accessible name of the record list (`SKU exceptions`). */
  label: string;
  records: readonly T[];
  recordKey: (record: T) => string;
  /** One record — an {@link IndustrialRecord}. */
  renderRecord: (record: T, open: boolean) => ReactNode;
  /** The open record's key, or null. May name a record not in `records` (a share link, a create form). */
  openKey: string | null;
  onOpenKey: (key: string) => void;
  onClose: () => void;
  /** Existing record-cursor service controls, when this ledger participates in a shared record plane. */
  navigation?: RecordLedgerNavigation;
  /**
   * Toolbar contents — search, facets, counts. Sits on the 1px ink rule.
   * Omit it and no toolbar row paints (a desk whose controls live in the
   * contextual sidebar — Shipping, operator 2026-09-26).
   */
  toolbar?: ReactNode;
  /** Optional strip under the toolbar (errors, notices). */
  banner?: ReactNode;
  /**
   * The record action strip (`RecordActionStrip`) under the toolbar. Toolbar
   * + strip form the list anchor: in place, the open record opens below them.
   */
  actionStrip?: ReactNode;
  /** The open record's handle — the record header and its region's accessible name. */
  recordTitle: ReactNode;
  recordSubtitle?: ReactNode;
  /** `Select a <noun>`; names the record region when the title is not a string. */
  recordNoun: string;
  /** The open record's view — the same component in place and in the split pane. */
  record: ReactNode;
  summary: RecordLedgerSummary;
  loading?: boolean;
  /** Painted when there are no records and nothing is loading. */
  empty: ReactNode;
  /** Status line under the records. */
  footer?: ReactNode;
  /** Optional shared scroll owner for prepend-to-top behavior in an existing feed. */
  scrollRef?: RefObject<HTMLDivElement>;
  /** On the ledger; the record carries `<testId>-record` in both views. */
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
  navigation,
  toolbar,
  banner,
  actionStrip,
  recordTitle,
  recordSubtitle,
  recordNoun,
  record,
  summary,
  loading = false,
  empty,
  footer,
  scrollRef: providedScrollRef,
  testId,
}: RecordLedgerProps<T>) {
  const keys = useMemo(() => records.map(recordKey), [records, recordKey]);
  const openIndex = openKey == null ? -1 : keys.indexOf(openKey);
  const inPlace = useDeskRecordView() === 'in-place';
  const onStage = useDeskStageOptional() != null;

  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = providedScrollRef ?? internalScrollRef;
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
      if (navigation) {
        const move = by === -1 ? navigation.onPrev : navigation.onNext;
        move?.();
        return;
      }
      if (keys.length === 0) return;
      const from = openIndex < 0 ? (by === 1 ? -1 : keys.length) : openIndex;
      const next = keys[Math.min(Math.max(from + by, 0), keys.length - 1)];
      if (next != null && next !== openKey) onOpenKey(next);
    },
    [keys, navigation, openIndex, openKey, onOpenKey],
  );
  const stepPrev = useCallback(() => step(-1), [step]);
  const stepNext = useCallback(() => step(1), [step]);

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
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step]);

  const open = openKey != null;
  const position = navigation?.position ?? (openIndex >= 0 ? openIndex + 1 : null);
  const indexLabel = open && position != null ? `${position} of ${navigation?.total ?? keys.length}` : undefined;

  const list = (
    <>
      <div {...{ [DESK_RECORD_ANCHOR_ATTR]: '' }} className="flex min-w-0 shrink-0 flex-col">
        {toolbar ? (
          <div data-testid="record-ledger-toolbar" className={RECORD_TOOLBAR_CLASS}>
            <div className="flex min-w-0 flex-1 items-stretch">{toolbar}</div>
            {inPlace ? <RecordLedgerTally summary={summary} /> : null}
            {onStage ? (
              <span className="flex shrink-0 items-center border-l border-mode-edge px-1.5">
                <DataTableFullscreenToggle />
              </span>
            ) : null}
          </div>
        ) : null}
        {actionStrip}
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
              const row = records[item.index];
              if (row === undefined) return null;
              return (
                <div
                  key={item.key}
                  role="listitem"
                  {...{ [DESK_RECORD_KEY_ATTR]: keys[item.index] }}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  {renderRecord(row, item.index === openIndex)}
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
    </>
  );

  return (
    <div
      data-testid={testId}
      className="flex min-h-0 min-w-0 flex-1 bg-mode-canvas text-mode-ink"
      style={RECORD_DENSITY_STYLE}
    >
      <DeskRecordPlane
        open={open}
        onClose={onClose}
        title={recordTitle}
        subtitle={recordSubtitle}
        indexLabel={indexLabel}
        onPrev={stepPrev}
        onNext={stepNext}
        prevDisabled={navigation ? navigation.prevDisabled : openIndex <= 0}
        nextDisabled={navigation ? navigation.nextDisabled : openIndex < 0 || openIndex >= keys.length - 1}
        list={list}
        summary={<RecordLedgerSummaryPane summary={summary} />}
        recordNoun={recordNoun}
        recordKey={openKey}
        testId={testId ? `${testId}-record` : undefined}
      >
        {record}
      </DeskRecordPlane>
    </div>
  );
}
