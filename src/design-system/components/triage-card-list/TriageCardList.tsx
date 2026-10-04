'use client';

/**
 * TriageCardList — the ONE triage face every card family wears (owner
 * 2026-09-27, BRIEF §13; `docs/design-system/HANDOFF-triage-family-contract.md`).
 *
 * Three layers joined by typed contracts:
 * 1. the HOST (per family) owns its route, query, sort, sidebar filters,
 *    selection store and open record — it hands this face a {@link TriageFeed};
 * 2. the FAMILY (per family) says what a card means — noun, card model, the
 *    card itself, sections, exact Find — as a {@link TriageFamily};
 * 3. this FACE owns every interaction: the select bar (Law 5 verbs at 1 and N),
 *    `[` `]` paging, per-page / Scroll, kept scroll, the held-new pill,
 *    X / Space / Enter, J / K through the record cursor, sticky sections with
 *    counts, empty / all-clear / loading, Esc-resets-chips and the record
 *    plane. Find is the page's one field (sidebar, or the global header while
 *    the sidebar is closed) — the face reads its value, never paints its own.
 *
 * The face never branches on the family (Law 1): what differs arrives as data,
 * ids or the host's slot nodes.
 *
 * Two densities, one face: `card` (default — the Allocate desk's multi-line
 * cards) and `row` (one full-bleed line per record, the family's
 * `renderCard` returning a `TriageRow`; API in `./TriageRow.tsx`). The face
 * never picks one itself: the host fixes `density`, or offers the operator's
 * Compact / Full switch with `densityControl` (`useTriageDensity`).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DESK_RECORD_ANCHOR_ATTR, DeskRecordPlane } from '@/design-system/components/DeskRecordPlane';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { SwipeListItem } from '@/design-system/components/SwipeListItem';
import { useDismissedRecords, useReturningRecords } from './dismiss';
import type { RecordOpenEvent } from '@/design-system/components/record-card/RecordCard';
import { useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { pageGroupedRenderOrder, pageIndexForRowId } from '@/lib/tables/data-table-pagination';
import { dataTableFindHighlightId } from '@/lib/tables/data-table-find';
import { flattenRenderOrder, type GroupedRenderOrder, type RowGroup } from '@/lib/group-rows';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { cn } from '@/utils/_cn';
import { TriageSelectBar, type TriageDensityControl, type TriagePager } from './TriageSelectBar';
import { TriageListBody, TriageSectionHeader, type TriageSectionTone } from './TriageListBody';
import type { RecordStateFace } from '@/design-system/tokens/record';
import {
  useHeldNewRecords,
  useTriageCardKeys,
  useTriagePageKeys,
  useTriagePageMode,
  type TriageCut,
} from './triage-list-state';

/** Scroll mode reads every loaded card as one page. */
const ALL_LOADED = Number.MAX_SAFE_INTEGER;

/** What the face needs of every family's card model; the family adds its own meaning. */
export interface TriageCardModelBase<Row> {
  /** Stable card key — list keys, expand / quick-look state, the held-new hold. */
  key: string;
  /** Every record id the card carries (its lines) — selection, open, the card keys. */
  ids: readonly number[];
  /** The record the card body opens. */
  lead: Row;
}

/** What the face hands the family's card: state + the face's own handlers. */
export interface TriageCardSlotProps<Row, Model extends TriageCardModelBase<Row>> {
  model: Model;
  /** Every id checked → true; some → 'mixed'. */
  checked: boolean | 'mixed';
  /** This card carries the open record. */
  open: boolean;
  /** The open record's id — a card whose lines open on their own marks that line. */
  openId: number | null;
  expanded: boolean;
  /** Quick look (Space) is unfolded under this card. */
  peekOpen: boolean;
  /** Position in the paint — staggers the arrival; null = no entrance of its own (the card swipes in). */
  enterIndex: number | null;
  /** The card body: opens the record, never checks it (only the checkbox checks). */
  onOpen: (row: Row, event?: RecordOpenEvent) => void;
  onToggleCheck: (model: Model, event: { shiftKey: boolean }) => void;
  onToggleExpand: (key: string) => void;
  onTogglePeek: (key: string) => void;
}

/** Layer 2 — the family's description. Memoize it in the host; the face reads nothing else about the family. */
export interface TriageFamily<Row, Model extends TriageCardModelBase<Row>> {
  noun: { one: string; many: string };
  /** `order-card` → `order-card-select-bar`, `order-card-section`, … */
  testIdPrefix: string;
  /** The list's accessible name ("Orders to ship"). */
  listLabel: string;
  /** The list wrapper's test id. */
  bodyTestId: string;
  /** Browser storage — per-person page mode, per-path scroll place. */
  storageKeys: { pageMode: string; scrollTop: string };
  rowId: (row: Row) => number;
  /** The group's card key — must equal the model's `key`. */
  groupKey: (group: RowGroup<Row>) => string;
  cardModel: (group: RowGroup<Row>, band: string) => Model;
  /** State source for `sections="by-state"`; one card group resolves to one state. */
  state?: (group: RowGroup<Row>, band: string) => RecordStateFace;
  /** Section header for a band, read while the feed is `sectioned`. */
  section?: (band: string) => { label: string; tone: TriageSectionTone };
  /** A Find that names exactly one card opens it (`query` is trimmed, lower-cased). */
  exactFind?: (query: string, model: Model) => boolean;
  renderCard: (props: TriageCardSlotProps<Row, Model>) => ReactNode;
}

/** The host's selection store, whatever it is (Law 5: the face paints; the host keeps). */
export interface TriageSelectionPort<Row> {
  ids: ReadonlySet<number>;
  toggle: (row: Row, event: { shiftKey: boolean }) => void;
  toggleGroup: (ids: readonly number[], on: boolean) => void;
  /** Select-all / clear on the visible page. */
  setAll: (on: boolean) => void;
  /** The ids on screen — for a store that acts on the visible page; returns its cleanup. */
  publishVisible?: (ids: readonly number[]) => (() => void) | void;
}

/** A host that pages on the server: 1-based page, its count and size, and the step. */
export interface TriageServerPages {
  page: number;
  pageCount: number;
  pageSize: number;
  onPage: (page: number) => void;
}

/** Layer 1 — what a host hands the face. Rows are the family's own type. */
export interface TriageFeed<Row> {
  /** Bands on screen: filtered through the cut, sectioned and ordered by the host. */
  bands: GroupedRenderOrder<Row>;
  /** Every band before the cut — the held-new hold reads it. */
  allBands: GroupedRenderOrder<Row>;
  /** Rows painted in the host's order — a Find that looks like an id scrolls to the first. */
  painted: readonly Row[];
  /** `bands` are sections: head each with `family.section(band)` and its count. */
  sectioned: boolean;
  /** Server scope total when known (records, not cards). */
  total?: number;
  /**
   * The status chips narrow on the SERVER (Exceptions' `?kind=`): `total` is
   * already the chip's own total, so a lit chip keeps counting it instead of
   * the loaded cut.
   */
  statusOnServer?: boolean;
  loading: boolean;
  /** Any fetch in flight — the next page waits for it. */
  fetching: boolean;
  /** More on the server; absent when everything is loaded. */
  onLoadMore?: () => void;
  /**
   * The host pages on the SERVER (`bands` is one server page): the face stops
   * slicing, the pager and `[` `]` step the host's page, and the per-page
   * menu stands down (the server owns the size).
   */
  serverPages?: TriageServerPages;
  /** The page's Find (sidebar or global header) as read — the face never writes it. */
  search: {
    value: string;
    /** The fetch for the CURRENT text is still running. */
    pending: boolean;
  };
  selection: TriageSelectionPort<Row>;
  open: {
    /** The open record's id, or null. */
    id: number | null;
    open: (row: Row, event?: RecordOpenEvent) => void;
    close: () => void;
  };
}

/** The open record in the plane — the host's nodes. */
export interface TriageRecordSlot {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Noun for the empty split pane. */
  noun: string;
  testId: string;
  /** Split view with nothing open: the list read as a whole. */
  summary: ReactNode;
  /** The open record's view (null while none is open). */
  view: ReactNode;
  /** The open record's verbs under the list's anchor, while nothing is checked. */
  strip: ReactNode;
  /** Omit queue position when the record header is intentionally identity-only. */
  showIndex?: boolean;
  /**
   * A rail desk (Labels & docs): the cards are a fixed-width rail at the left
   * and the record always sits beside them (`DeskRecordPlane` `listRail`);
   * the bar spans both, one row, and stays while a record is open. `'open'`:
   * with nothing open the list stands alone at the bar's full width and the
   * rail + record appear on open (`DeskRecordPlane listRail="open"`).
   */
  rail?: boolean | 'open';
}

export interface TriageCardListProps<Row, Model extends TriageCardModelBase<Row>, K extends string> {
  family: TriageFamily<Row, Model>;
  feed: TriageFeed<Row>;
  /** The host's `useTriageCut` handle — the same one it filtered `feed.bands` with. */
  cut: TriageCut<K>;
  record: TriageRecordSlot;
  /** Status chips (the bar's left, while nothing is checked). */
  summary: ReactNode;
  /** Chips stay inline between the count and the pager at every width (`TriageSelectBar`). */
  summaryInline?: boolean;
  /** The selection's verbs (Law 5), while anything is checked. */
  bulk: ReactNode;
  /** Non-blocking band above the cards. */
  banner?: ReactNode;
  /** Family entry above the cards (an inline new-record form). */
  leadSlot?: ReactNode;
  /** The family's empty state while search / filters narrow the list; null when not narrowed. */
  searchEmpty: ReactNode | null;
  allClear: ReactNode;
  /**
   * `card` (default): multi-line cards divided by an inset hairline. `row`:
   * the one-row edge-to-edge list — the family's `renderCard` returns a
   * `TriageRow`, which draws its own full-bleed hairline.
   */
  density?: 'card' | 'row';
  /** Let an opt-in wide Compact face share one horizontal scroll plane. */
  rowScroll?: boolean;
  /**
   * The operator's own pick (`useTriageDensity`): paints the Compact / Full
   * switch in the bar and drives the density (`density` is then ignored).
   * The family's `renderCard` switches its face on the same value.
   */
  densityControl?: TriageDensityControl;
  /** Replace host bands with stable first-seen state bands and derive their headers. */
  sections?: 'by-state';
}

export function TriageCardList<Row, Model extends TriageCardModelBase<Row>, K extends string>({
  family,
  feed,
  cut,
  record,
  summary,
  summaryInline,
  bulk,
  banner,
  leadSlot,
  searchEmpty,
  allClear,
  sections,
  density: fixedDensity = 'card',
  rowScroll = false,
  densityControl,
}: TriageCardListProps<Row, Model, K>) {
  const density = densityControl?.value ?? fixedDensity;
  const { rowId, groupKey } = family;
  const { url } = cut;
  const { statusFilter } = url;
  const { selection, open, search } = feed;
  const searchValue = search.value;
  const scrollRef = useRef<HTMLDivElement>(null);
  const openId = open.id;

  // ── Held new records (the cut hides them; the pill releases them) ─────────
  const allCardKeys = useMemo(
    () => feed.allBands.flatMap(([, groups]) => groups.map(groupKey)),
    [feed.allBands, groupKey],
  );
  const held = useHeldNewRecords({
    groupKeys: allCardKeys,
    scrollRef,
    // Any change to the question (search, sidebar filters, chips, staff) makes
    // everything it brings "seen" — only arrivals inside one scope are held.
    resetKey: `${searchValue}|${url.scopeKey}`,
  });
  const setHeldKeys = cut.setHeldKeys;
  useEffect(() => setHeldKeys(held.held), [held.held, setHeldKeys]);

  // J / K walk the records. On a desk stage Esc belongs to the record plane and
  // the stage (record → floor → split); off it (station embeds) the hook closes.
  const stage = useDeskStageOptional();
  const onDeskStage = stage != null;
  useRecordCursorKeyboard({ enabled: true, scope: 'record', escape: !onDeskStage });
  const cursor = useRecordCursor('record');

  // Esc resets the status chips — last on the ladder: an overlay, a text field,
  // a check-set and an open record all take Esc first. The open record is
  // checked explicitly: this listener mounts before the record's own Esc
  // listener, so with a chip active it used to reset the chips instead of
  // closing the record.
  const filterActiveRef = useRef(false);
  filterActiveRef.current = statusFilter.size > 0;
  const recordOpenRef = useRef(false);
  recordOpenRef.current = openId != null;
  const resetStatus = url.resetStatus;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !filterActiveRef.current) return;
      if (recordOpenRef.current || hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      event.preventDefault();
      resetStatus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resetStatus]);

  // ── Pages (URL `?page=`), Scroll, or the host's server pages ──────────────
  const { mode: pageMode, setMode: setPageMode, resolved: pageModeResolved } = useTriagePageMode(family.storageKeys.pageMode);
  const { serverPages } = feed;
  const scrollMode = pageMode === 'scroll' && !serverPages;
  // Every loaded card on one screen: Scroll mode, or a feed the server already paged.
  const onePage = scrollMode || serverPages != null;
  const pageSize = onePage ? ALL_LOADED : (pageMode as Exclude<typeof pageMode, 'scroll'>);
  const { bands: sourceBands, fetching, loading } = feed;
  const stateBands = useMemo(() => {
    if (sections !== 'by-state') return { bands: sourceBands, faces: new Map<string, RecordStateFace>() };
    if (!family.state) throw new Error(`TriageCardList ${family.testIdPrefix} needs family.state for sections="by-state"`);
    const groupsByState = new Map<string, RowGroup<Row>[]>();
    const faces = new Map<string, RecordStateFace>();
    for (const [band, groups] of sourceBands) {
      for (const group of groups) {
        const face = family.state(group, band);
        faces.set(face.id, face);
        const bucket = groupsByState.get(face.id);
        if (bucket) bucket.push(group);
        else groupsByState.set(face.id, [group]);
      }
    }
    return { bands: [...groupsByState], faces };
  }, [sections, sourceBands, family]);
  const bands = stateBands.bands;
  const paged = useMemo(
    () => pageGroupedRenderOrder(bands, onePage ? 0 : url.pageIndex, pageSize),
    [bands, onePage, url.pageIndex, pageSize],
  );
  // A page past the end (rows left the list, a smaller page size) clamps —
  // but not while a fetch is in flight (› past the last loaded page steps onto
  // the page the next chunk is about to fill), and not before the remembered
  // page size is read: at the SSR default (100 / page) a reload's `?page=2`
  // looked past the end and was stripped before the real size arrived.
  useEffect(() => {
    if (!pageModeResolved || fetching || onePage || loading) return;
    if (url.pageIndex > paged.pageCount - 1) url.setPageIndex(paged.pageCount - 1);
  }, [pageModeResolved, fetching, onePage, loading, url, paged.pageCount]);

  const visibleIds = useMemo(
    () =>
      flattenRenderOrder(paged.order)
        .map(rowId)
        .filter((id) => Number.isFinite(id) && id > 0),
    [paged.order, rowId],
  );
  const publishVisible = selection.publishVisible;
  useEffect(() => publishVisible?.(visibleIds), [publishVisible, visibleIds]);

  // The open record (or the find hit) pulls its page on screen.
  const scrollToKey =
    openId != null
      ? String(openId)
      : dataTableFindHighlightId({ query: searchValue, paintedRowIds: feed.painted.map((row) => String(rowId(row))) });
  const getRowKey = useCallback((row: Row) => String(rowId(row)), [rowId]);
  useEffect(() => {
    if (!scrollToKey || onePage) return;
    const next = pageIndexForRowId(bands, pageSize, scrollToKey, getRowKey);
    if (next != null && next !== url.pageIndex) url.setPageIndex(next);
  }, [scrollToKey, onePage, getRowKey, bands, url, pageSize]);

  // ── Cards ─────────────────────────────────────────────────────────────────
  const cardModel = family.cardModel;
  const pageCards = useMemo(
    () =>
      paged.order.map(
        ([band, groups]) => [band, groups.map((group) => cardModel(group, band))] as const,
      ),
    [paged.order, cardModel],
  );
  const cards = useMemo(() => pageCards.flatMap(([, models]) => models), [pageCards]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const [peekKey, setPeekKey] = useState<string | null>(null);
  const togglePeek = useCallback((key: string) => setPeekKey((current) => (current === key ? null : key)), []);

  // ── Selection ─────────────────────────────────────────────────────────────
  const selectedIds = selection.ids;
  const dismissed = useDismissedRecords();
  const returning = useReturningRecords();
  const selectedCount = selectedIds.size;
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const { toggle: toggleRow, toggleGroup, setAll } = selection;
  const toggleCheck = useCallback(
    (model: Model, event: { shiftKey: boolean }) => {
      if (model.ids.length <= 1) toggleRow(model.lead, event);
      else toggleGroup(model.ids, !model.ids.every((id) => selectedIds.has(id)));
    },
    [toggleRow, toggleGroup, selectedIds],
  );

  // The card keys on the focused card, else the card under the pointer:
  // X checks (else the open record's card) — the same toggle as the checkbox;
  // Space folds its quick look; Enter (nothing focused) opens it.
  const openRow = open.open;
  const cardOf = useCallback(
    (recordKey: string) => cards.find((c) => c.ids.some((id) => String(id) === recordKey)) ?? null,
    [cards],
  );
  useTriageCardKeys({
    enabled: true,
    rootRef: scrollRef,
    openKey: openId != null ? String(openId) : null,
    onCheck: (recordKey, event) => {
      const card = cardOf(recordKey);
      if (card) toggleCheck(card, event);
    },
    onPeek: (recordKey) => {
      const card = cardOf(recordKey);
      if (card) togglePeek(card.key);
    },
    onOpen: (recordKey) => {
      const card = cardOf(recordKey);
      if (card) openRow(card.lead);
    },
  });

  // ── Find an exact record name → open it ───────────────────────────────────
  const exactFind = family.exactFind;
  const jumpedFor = useRef<string | null>(null);
  useEffect(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) {
      jumpedFor.current = null;
      return;
    }
    if (!exactFind || jumpedFor.current === q || search.pending) return;
    const hits = cards.filter((card) => exactFind(q, card));
    if (hits.length !== 1) return;
    jumpedFor.current = q;
    if (openId == null || !hits[0]!.ids.includes(openId)) openRow(hits[0]!.lead);
  }, [searchValue, search.pending, exactFind, cards, openId, openRow]);

  // ── Count + pager ─────────────────────────────────────────────────────────
  const trustNextBatch = held.trustNextBatch;
  const { onLoadMore } = feed;
  const loadMore = useMemo(
    () =>
      onLoadMore && !fetching
        ? () => {
            trustNextBatch();
            onLoadMore();
          }
        : undefined,
    [onLoadMore, fetching, trustNextBatch],
  );
  // Unfiltered, the count is the SERVER's scope total; a status filter or a
  // search narrows to what is loaded, so it counts the cut — unless the server
  // narrowed by the chips itself. A server-paged feed's total is always the
  // server's (its search runs there too).
  const narrowed = (statusFilter.size > 0 && !feed.statusOnServer) || Boolean(searchValue.trim());
  const total = serverPages
    ? (feed.total ?? paged.total)
    : narrowed
      ? paged.total
      : Math.max(feed.total ?? 0, paged.total);
  const lastLoadedPage = paged.pageIndex >= paged.pageCount - 1;
  const firstRow =
    paged.shown === 0
      ? 0
      : serverPages
        ? (serverPages.page - 1) * serverPages.pageSize + 1
        : paged.pageIndex * (scrollMode ? 0 : pageSize) + 1;
  const goPrev = useCallback(() => {
    if (serverPages) serverPages.onPage(serverPages.page - 1);
    else url.setPageIndex(paged.pageIndex - 1);
  }, [serverPages, url, paged.pageIndex]);
  const goNext = useCallback(() => {
    if (serverPages) {
      serverPages.onPage(serverPages.page + 1);
      return;
    }
    if (!lastLoadedPage) {
      url.setPageIndex(paged.pageIndex + 1);
      return;
    }
    // Past the last loaded page: read the next chunk, then step onto it. The
    // button is disabled while a fetch is in flight, so fast clicks cannot
    // land on an empty page.
    if (!loadMore) return;
    loadMore();
    url.setPageIndex(paged.pageIndex + 1);
  }, [serverPages, lastLoadedPage, loadMore, url, paged.pageIndex]);
  const canPrev = serverPages ? serverPages.page > 1 : paged.pageIndex > 0;
  const canNext = serverPages ? serverPages.page < serverPages.pageCount : !lastLoadedPage || Boolean(loadMore);
  const pager: TriagePager | null =
    !scrollMode && total > paged.shown
      ? { label: `${firstRow}–${firstRow + paged.shown - 1} of ${total}`, canPrev, canNext, onPrev: goPrev, onNext: goNext }
      : null;
  useTriagePageKeys({
    enabled: !scrollMode && openId == null,
    onPrev: () => {
      if (canPrev) goPrev();
    },
    onNext: () => {
      if (canNext) goNext();
    },
    onFirst: () => (serverPages ? serverPages.onPage(1) : url.setPageIndex(0)),
    onLast: () => (serverPages ? serverPages.onPage(serverPages.pageCount) : url.setPageIndex(paged.pageCount - 1)),
  });

  // ── Items: section headers + cards ────────────────────────────────────────
  // A section counts its whole cut, not just the cards on this page.
  const section =
    sections === 'by-state'
      ? (band: string): { label: string; tone: TriageSectionTone } => {
          const face = stateBands.faces.get(band);
          if (!face) throw new Error(`Missing state face for ${band}`);
          return { label: face.label, tone: face.tone === 'danger' ? 'danger' : face.tone === 'warning' ? 'warning' : 'muted' };
        }
      : feed.sectioned
        ? family.section
        : undefined;
  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (section) for (const [band, groups] of bands) counts.set(band, groups.length);
    return counts;
  }, [section, bands]);
  const items: ReactNode[] = [];
  let enterIndex = 0;
  // One motion both ways (`SwipeListItem`): a card that arrives live (or comes
  // back on Undo) opens its gap and slides in from the left; a card a verb
  // removed (Delete) slides left off the list while its gap closes — each
  // group one after another.
  let arriveIndex = 0;
  let dismissIndex = 0;
  for (const [band, models] of pageCards) {
    models.forEach((model, i) => {
      if (section && i === 0) {
        const head = section(band);
        items.push(
          <TriageSectionHeader
            key={`section:${band}:${model.key}`}
            label={head.label}
            tone={head.tone}
            count={sectionCounts.get(band)}
            testId={`${family.testIdPrefix}-section`}
          />,
        );
      }
      const checkedCount = model.ids.filter((id) => selectedIds.has(id)).length;
      const arriving = held.isArrival(model.key) || model.ids.some((id) => returning.has(id));
      const leaving = model.ids.some((id) => dismissed.has(id));
      const card = family.renderCard({
        model,
        checked: checkedCount === 0 ? false : checkedCount === model.ids.length ? true : 'mixed',
        open: openId != null && model.ids.includes(openId),
        openId,
        expanded: expanded.has(model.key),
        peekOpen: peekKey === model.key,
        // A card swiping in has its entrance already — the swipe is the only one.
        enterIndex: arriving ? null : enterIndex++,
        onOpen: openRow,
        onToggleCheck: toggleCheck,
        onToggleExpand: toggleExpand,
        onTogglePeek: togglePeek,
      });
      items.push(
        <SwipeListItem
          key={model.key}
          rowRule={density === 'card'}
          raised={(openId != null && model.ids.includes(openId)) || checkedCount > 0}
          enter={arriving ? 'swipe' : 'none'}
          exit={leaving ? 'swipe' : 'collapse'}
          stagger={arriving ? arriveIndex++ : leaving ? dismissIndex++ : 0}
        >
          {card}
        </SwipeListItem>,
      );
    });
  }

  const recordOpen = openId != null;
  // A rail desk (`record.rail`): the bar spans the stage above the rail and
  // the record, and stays while a record is open — the list is never covered.
  const railBar = (record.rail === true || record.rail === 'open') && onDeskStage;
  const bar = (
    <TriageSelectBar
      noun={family.noun}
      testIdPrefix={family.testIdPrefix}
      selectedCount={selectedCount}
      allSelected={allSelected}
      total={total}
      pager={pager}
      pageMode={serverPages ? null : pageMode}
      onPageModeChange={setPageMode}
      summary={summary}
      summaryInline={summaryInline}
      onToggleAll={() => setAll(!allSelected)}
      onClear={() => setAll(false)}
      // Law 5: the selection's verbs, the same list in the same order at 1 or N checked.
      bulk={bulk}
      // A rail desk has one view — nothing to switch.
      viewControls={!railBar}
      densityControl={densityControl}
    />
  );
  const list = (
    <div data-testid={family.bodyTestId} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* The list anchor: the select / bulk bar and, with a record open, its action strip. */}
      <div {...{ [DESK_RECORD_ANCHOR_ATTR]: '' }} className={cn('shrink-0', !railBar && 'pt-3')}>
        {/* Reading one record hides the list's controls (owner 2026-09-27). No
            width of its own: the desk stage (DESK_STAGE_FIXED_CLASS) is the one
            width wrapper, so the bar, the cards and the page title share edges. */}
        {railBar || recordOpen ? null : bar}
        {!railBar && recordOpen && selectedCount === 0 && record.strip ? <div className="pt-2">{record.strip}</div> : null}
      </div>

      {banner}

      <TriageListBody
        testIdPrefix={family.testIdPrefix}
        density={density}
        rowScroll={density === 'row' && rowScroll}
        noun={family.noun}
        scrollRef={scrollRef}
        cardCount={cards.length}
        items={items}
        listLabel={family.listLabel}
        busy={loading || search.pending}
        held={{ count: held.held.size, release: held.release }}
        leadSlot={leadSlot}
        statusFiltered={{ active: statusFilter.size > 0, onReset: resetStatus }}
        searchEmpty={searchEmpty}
        allClear={allClear}
        loadMore={
          !serverPages && lastLoadedPage && onLoadMore
            ? { onPress: loadMore, fetching, searching: Boolean(searchValue.trim()), loaded: paged.total, total }
            : null
        }
        scrollMode={scrollMode}
        scrollStorageKey={family.storageKeys.scrollTop}
      />
    </div>
  );

  // Station embeds open their own record surface.
  if (!onDeskStage) return list;

  const plane = (
    <DeskRecordPlane
      open={recordOpen}
      onClose={open.close}
      title={record.title}
      subtitle={record.subtitle}
      actions={record.actions}
      indexLabel={
        record.showIndex !== false && cursor.available && cursor.position != null
          ? `${cursor.position} of ${cursor.total}`
          : undefined
      }
      recordNoun={record.noun}
      recordKey={openId != null ? String(openId) : null}
      summary={record.summary}
      testId={record.testId}
      listRail={railBar ? (record.rail === 'open' ? 'open' : true) : false}
      list={list}
    >
      {record.view}
    </DeskRecordPlane>
  );
  if (!railBar) return plane;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-mode-divide py-2">{bar}</div>
      {plane}
    </div>
  );
}
