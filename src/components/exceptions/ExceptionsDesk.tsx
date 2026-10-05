'use client';

/**
 * **Exceptions** — the ONE exception list, ONE category at a time (owner
 * 2026-09-29: never a blanket list). At `/exceptions` the URL always names a
 * kind (`?domain=&kind=`, the page redirects to one): the sidebar's mode card
 * picks the domain, its views the kind. No lane embeds or repaints this list;
 * legacy lane URLs redirect here. It wears the Allocate desk's triage face
 * ({@link TriageCardList}: count · pager · In place / Split): one card per
 * exception — the tag (WHY) leftmost as the state pill, the blocked entity
 * next, the resolve verb at the card's bottom-right. A record opens through
 * the face's `DeskRecordPlane` (`?record=<key>`); its resolver works in place
 * — nothing navigates away.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DESK_RECORD_KEY_ATTR } from '@/design-system/components/DeskRecordPlane';
import { RecordLedgerSummaryPane } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import {
  TriageCardList,
  type TriageFeed,
  type TriageSelectionPort,
} from '@/design-system/components/triage-card-list/TriageCardList';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { useTriageDensity } from '@/design-system/components/triage-card-list/triage-density';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { useException, useExceptionOrderNote, useExceptionsInfinite } from '@/hooks/exceptions';
import { toast } from '@/lib/toast';
import {
  EXCEPTION_DOMAIN_LABEL,
  EXCEPTION_DOMAIN_PARAM,
  EXCEPTION_KIND_PARAM,
  EXCEPTION_KIND_SPEC,
  EXCEPTION_RECORD_PARAM,
  parseExceptionDomain,
  parseExceptionKind,
  type ExceptionKind,
  type ExceptionRow,
} from '@/lib/exceptions/types';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { EXCEPTIONS_VIEW } from '@/lib/triage/views';
import { ExceptionCard } from './cards/ExceptionCard';
import { ExceptionCompactRow } from './cards/ExceptionCompactRow';
import {
  exceptionBands,
  exceptionCardId,
  exceptionCardKey,
  exceptionCardModel,
  exceptionExactFind,
  exceptionRowId,
  exceptionSection,
} from './cards/exception-card-model';
import { ExceptionRecordPane } from './ExceptionRecordPane';
import { exceptionsSummary } from './exceptions-summary';

const VIEW = EXCEPTIONS_VIEW;

/** Find is debounced before it reaches the server. */
const FIND_DEBOUNCE_MS = 250;

const NO_KINDS: readonly ExceptionKind[] = [];

export interface ExceptionsDeskProps {
  /** The route the desk writes its params onto. */
  basePath: string;
  /**
   * Find text when the door's search box is not `?q=` (Shipping's desk
   * store). Omitted = the hub's own `?q=` (the contextual sidebar's Find).
   */
  query?: string;
}

export function ExceptionsDesk({ basePath, query }: ExceptionsDeskProps) {
  const searchParams = useSearchParams();

  const domain = parseExceptionDomain(searchParams.get(EXCEPTION_DOMAIN_PARAM)) ?? undefined;
  // The URL's kind IS the category (never a filter to clear).
  const urlKind = parseExceptionKind(searchParams.get(EXCEPTION_KIND_PARAM)) ?? undefined;
  const cut = useTriageCut({
    statusKeys: NO_KINDS,
    recordParams: VIEW.recordParams,
    statusParam: VIEW.chips.param,
    statusSelect: 'one',
  });
  const { statusFilter } = cut.url;
  const kind = urlKind ?? [...statusFilter][0];

  const find = (query ?? searchParams.get('q') ?? '').trim();
  const [debounced, setDebounced] = useState(find);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(find), FIND_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [find]);

  const list = useExceptionsInfinite({ domain, kind, q: debounced || undefined });
  const pages = list.data?.pages;
  const rows = useMemo(() => (pages ?? []).flatMap((page) => page.rows), [pages]);
  const counts = pages?.[0]?.counts;

  // ── Bands: one card per exception, the hub's order ────────────────────────
  const allBands = useMemo(() => exceptionBands(rows), [rows]);
  const { filterBands } = cut;
  const bands = useMemo(() => filterBands(allBands, exceptionCardKey, (row) => [row.kind]), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  // ── The open record: `?record=<key>` ──────────────────────────────────────
  const openKey = searchParams.get(EXCEPTION_RECORD_PARAM)?.trim() || null;
  const openId = openKey ? exceptionCardId(openKey) : null;
  const writeRecord = useCallback(
    (key: string | null) => {
      const params = readLiveSearchParams(searchParams.toString());
      if (key) params.set(EXCEPTION_RECORD_PARAM, key);
      else params.delete(EXCEPTION_RECORD_PARAM);
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `${basePath}?${qs}` : basePath);
    },
    [basePath, searchParams],
  );
  const openRecord = useCallback((row: ExceptionRow) => writeRecord(row.key), [writeRecord]);
  const closeRecord = useCallback(() => writeRecord(null), [writeRecord]);
  // A resolved exception leaves the list while its record is still open: the
  // record keeps its head, and Esc lands on the card that took its place.
  const [prevPainted, setPrevPainted] = useState(painted);
  const [left, setLeft] = useState<{ row: ExceptionRow; next: string | null } | null>(null);
  if (painted !== prevPainted) {
    setPrevPainted(painted);
    const at = openKey && !painted.some((row) => row.key === openKey) ? prevPainted.findIndex((row) => row.key === openKey) : -1;
    if (at >= 0) setLeft({ row: prevPainted[at]!, next: (prevPainted[at + 1] ?? prevPainted[at - 1])?.key ?? null });
  }
  const lastOpenKey = useRef(openKey);
  useEffect(() => {
    const closed = lastOpenKey.current;
    lastOpenKey.current = openKey;
    // Runs after the plane's own focus return (a child effect): only when it found no card.
    if (openKey || !closed || left?.row.key !== closed || !left.next) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    document
      .querySelector<HTMLElement>(`[${DESK_RECORD_KEY_ATTR}="${exceptionCardId(left.next)}"] [data-testid="${VIEW.testIdPrefix}-open"]`)
      ?.focus({ preventScroll: true });
  }, [openKey, left]);
  // The record's head reads the loaded row, else the row it left, else the record's own read (a deep link past the loaded pages).
  const openRecordRead = useException(openKey);
  const openRow = useMemo(
    () =>
      openKey
        ? (rows.find((row) => row.key === openKey) ?? (left?.row.key === openKey ? left.row : null) ?? openRecordRead.data?.row ?? null)
        : null,
    [openKey, rows, left, openRecordRead.data],
  );

  usePublishRecordCursor({
    surfaceId: 'exception-cards',
    scope: 'record',
    enabled: true,
    order: bands,
    openId,
    getId: exceptionRowId,
    onOpen: openRecord,
    onClose: closeRecord,
  });

  // ── Selection: the face's check-set (no bulk resolve — each kind resolves in its record) ──
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(() => new Set());
  const visibleIdsRef = useRef<readonly number[]>([]);
  const selection = useMemo<TriageSelectionPort<ExceptionRow>>(
    () => ({
      ids: selectedIds,
      toggle: (row) =>
        setSelectedIds((prev) => {
          const next = new Set(prev);
          const id = exceptionRowId(row);
          if (!next.delete(id)) next.add(id);
          return next;
        }),
      toggleGroup: (ids, on) =>
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) {
            if (on) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
      setAll: (on) => setSelectedIds(on ? new Set(visibleIdsRef.current) : new Set()),
      publishVisible: (ids) => {
        visibleIdsRef.current = ids;
      },
    }),
    [selectedIds],
  );

  // ── The family ────────────────────────────────────────────────────────────
  // Line 1's team note → the order's notes trail, then every hub read refreshes.
  const { mutate: writeNote } = useExceptionOrderNote();
  const saveNote = useCallback(
    (row: ExceptionRow, noteText: string) => {
      const orderId = Number(row.entity.id);
      if (!Number.isFinite(orderId)) return;
      writeNote({ orderId, noteText }, { onError: (error) => toast.error(error.message || 'Failed to save the note') });
    },
    [writeNote],
  );
  const showKind = !kind;
  // Compact | Full, saved per person.
  const [density, setDensity] = useTriageDensity('exceptions.list');
  const family = useMemo(
    () => ({
      ...triageFamily(VIEW, {
        rowId: exceptionRowId,
        groupKey: exceptionCardKey,
        cardModel: exceptionCardModel,
        exactFind: exceptionExactFind,
        renderCard: (props) =>
          density === 'row' ? (
            <ExceptionCompactRow {...props} />
          ) : (
            <ExceptionCard {...props} showKind={showKind} onSaveNote={saveNote} />
          ),
      }),
      // One section per status tag: the word once, with its count.
      section: exceptionSection(rows),
    }),
    [showKind, saveNote, rows, density],
  );

  // The scope's total from the hub's counts — the same predicate as its rows.
  const scopeKinds = kind ? [kind] : NO_KINDS;
  const total = counts ? scopeKinds.reduce((sum, k) => sum + (counts[k] ?? 0), 0) : undefined;

  const feed: TriageFeed<ExceptionRow> = {
    bands,
    allBands,
    painted,
    sectioned: bands.length > 1,
    total,
    statusOnServer: true,
    loading: list.isLoading,
    fetching: list.isFetching,
    onLoadMore: list.hasNextPage ? () => void list.fetchNextPage() : undefined,
    search: { value: find, pending: find !== debounced },
    selection,
    open: { id: openId, open: openRecord, close: closeRecord },
  };

  const summary = useMemo(() => exceptionsSummary(counts, kind, domain), [counts, kind, domain]);
  const narrowed = Boolean(debounced) || statusFilter.size > 0;
  const scopeLabel = kind ? EXCEPTION_KIND_SPEC[kind].label : domain ? EXCEPTION_DOMAIN_LABEL[domain] : null;

  return (
    <TriageCardList
      family={family}
      densityControl={{ value: density, onChange: setDensity }}
      feed={feed}
      cut={cut}
      bulk={<span className="truncate text-sm text-text-muted">Open one to resolve it</span>}
      banner={
        list.isError ? (
          <div role="alert" className="px-1 py-2 text-sm text-text-warning">
            {list.error instanceof Error ? list.error.message : 'Could not load exceptions.'}
          </div>
        ) : null
      }
      searchEmpty={
        narrowed ? (
          <p className="text-sm text-text-muted">
            {debounced ? `No ${scopeLabel ? `${scopeLabel} ` : ''}exceptions match “${debounced}”.` : `No open ${scopeLabel} exceptions.`}
          </p>
        ) : null
      }
      allClear={
        <TriageAllClear
          title={scopeLabel ? `No open ${scopeLabel} exceptions` : 'Nothing is blocked'}
          detail={scopeLabel ? 'This category is clear right now.' : 'Every source is clear right now.'}
        />
      }
      record={{
        title: openRow ? openRow.entity.label : 'Exception',
        subtitle: openRow ? EXCEPTION_KIND_SPEC[openRow.kind].label : undefined,
        noun: VIEW.noun.one,
        testId: 'exceptions-record',
        summary: <RecordLedgerSummaryPane summary={summary} />,
        view: openKey ? <ExceptionRecordPane key={openKey} recordKey={openKey} /> : null,
        strip: null,
      }}
    />
  );
}
