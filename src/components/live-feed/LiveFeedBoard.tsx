'use client';

/**
 * The Live feed BOARD — `/operations/live-feed`'s body: every status of the
 * direction (and `?channel=`) as one fixed-width {@link LiveFeedLane} on a
 * `lanes` {@link ColumnBoard} under its section (Work now · Done), running off
 * the page to the right; empty lanes fold to rails. The date range is header
 * chrome ({@link LiveFeedDateRange}); every other control is the sidebar's.
 * Fullscreen is the desk's ONE stage state ({@link DeskFullscreenToggle} on the
 * board's own row, or ⌘/Ctrl+Shift+S); a record opens in SPLIT beside the
 * board, and closes back to In place if it opened from there. Keys:
 * `useLiveFeedBoardKeys` (bare F stays Find). Phone: one lane at a time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useReplaceSearchParams } from '@/components/sidebar/contextual/useReplaceSearchParams';
import { ColumnBoard, ColumnBoardSection } from '@/design-system/components/column-board/ColumnBoard';
import { ColumnBoardSwitcher, useColumnBoardPager } from '@/design-system/components/column-board/ColumnBoardPhone';
import { DeskFullscreenToggle } from '@/design-system/components/DeskFullscreenToggle';
import { DeskRecordPlane } from '@/design-system/components/DeskRecordPlane';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useIsMobile } from '@/hooks/_ui';
import { writeClipboardText } from '@/lib/clipboard';
import type { RowGroup } from '@/lib/group-rows';
import { LIST_KEY_OWNER_ATTR } from '@/lib/keyboard/list-key-scope';
import { liveFeedBoardQuery } from '@/lib/live-feed/query';
import { LIVE_FEED_PARAMS, readLiveFeedFilters } from '@/lib/live-feed/route';
import type { LiveFeedStatusKind } from '@/lib/live-feed/statuses';
import type { LiveFeedBoardColumn, LiveFeedFilters, LiveFeedItem } from '@/lib/live-feed/types';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { toast } from '@/lib/toast';
import { LiveFeedDateRange } from './LiveFeedDateRange';
import { LiveFeedLane } from './LiveFeedLane';
import { LiveFeedRecord } from './LiveFeedRecord';
import { LIVE_FEED_SECTION_LABEL, liveFeedRowId, splitLateItems, useBoardNow } from './live-feed-board-model';
import { useLiveFeedRealtime } from './useLiveFeed';
import { useLiveFeedBoardKeys, type BoardCursor } from './useLiveFeedBoardKeys';

const EMPTY_PARAMS = new URLSearchParams();
const NO_ROWS: ReadonlySet<number> = new Set();

/** `/operations/live-feed`'s body: the date range in the header, the direction's board below. */
export function LiveFeedView() {
  const filters = readLiveFeedFilters(useSearchParams() ?? EMPTY_PARAMS);
  useLiveFeedRealtime();
  return (
    <>
      <LiveFeedDateRange />
      <LiveFeedBoard filters={filters} />
    </>
  );
}

export function LiveFeedBoard({ filters }: { filters: LiveFeedFilters }) {
  const query = useQuery(liveFeedBoardQuery(filters));
  const columns = useMemo(() => query.data?.columns ?? [], [query.data]);
  const phone = useIsMobile();
  const now = useBoardNow();
  const stage = useDeskStageOptional();
  const replace = useReplaceSearchParams();
  const boardRef = useRef<HTMLDivElement>(null);

  // ── Lanes: rails, the expanded lane, rows in display order ────────────────
  const [expandedLane, setExpandedLane] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());
  const isFolded = useCallback(
    (column: LiveFeedBoardColumn) =>
      !phone && column.count === 0 && !revealed.has(column.status.id) && expandedLane !== column.status.id,
    [phone, revealed, expandedLane],
  );
  // Each lane's rows in painted order (late pinned first) — the cursor walks these.
  const laneRows = useMemo(() => {
    const map = new Map<string, LiveFeedItem[]>();
    for (const column of columns) {
      const { late, rest } = splitLateItems(column.items);
      map.set(column.status.id, [...late, ...rest]);
    }
    return map;
  }, [columns]);
  const sections = useMemo(() => {
    const out: { id: LiveFeedStatusKind; columns: LiveFeedBoardColumn[] }[] = [];
    for (const column of columns) {
      const last = out.at(-1);
      if (last?.id === column.status.kind) last.columns.push(column);
      else out.push({ id: column.status.kind, columns: [column] });
    }
    return out;
  }, [columns]);

  // ── Rows: unfolded, open (split), the keyboard cursor ─────────────────────
  const [expandedRows, setExpandedRows] = useState<ReadonlySet<number>>(NO_ROWS);
  const [opened, setOpened] = useState<LiveFeedItem | null>(null);
  const [cursor, setCursor] = useState<BoardCursor | null>(null);

  // The open record, fresh from the board when it still lists it (an expanded lane's later pages are not on the board).
  const openItem = useMemo(() => {
    if (!opened) return null;
    const id = liveFeedRowId(opened);
    return laneRows.get(opened.statusId)?.find((item) => liveFeedRowId(item) === id) ?? opened;
  }, [laneRows, opened]);
  const openId = openItem ? liveFeedRowId(openItem) : null;

  // A record opened from In place splits the stage; closing it returns there.
  const autoSplitRef = useRef(false);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const openRow = useCallback((item: LiveFeedItem) => {
    setOpened(item);
    setCursor({ lane: item.statusId, rowId: liveFeedRowId(item) });
    const current = stageRef.current;
    if (current && current.view === 'in-place') {
      autoSplitRef.current = true;
      current.setView('split');
    }
  }, []);
  const close = useCallback(() => {
    setOpened(null);
    if (autoSplitRef.current) {
      autoSplitRef.current = false;
      stageRef.current?.setView('in-place');
    }
  }, []);
  // The board has no In place record: leaving Split (the toggle, ⌘⇧S, the record's view switch) closes it.
  const inPlace = stage?.view === 'in-place';
  useEffect(() => {
    if (!inPlace || opened == null) return;
    autoSplitRef.current = false;
    setOpened(null);
  }, [inPlace, opened]);

  const bands = useMemo<[string, RowGroup<LiveFeedItem>[]][]>(
    () => [...laneRows].map(([lane, rows]) => [lane, rows.map((item) => ({ key: `${item.statusId}:${item.key}`, rows: [item] }))]),
    [laneRows],
  );
  usePublishRecordCursor({
    surfaceId: 'live-feed',
    scope: 'record',
    enabled: true,
    order: bands,
    openId,
    getId: liveFeedRowId,
    onOpen: openRow,
    onClose: close,
  });

  const toggleRow = useCallback((item: LiveFeedItem) => {
    const rowId = liveFeedRowId(item);
    setCursor({ lane: item.statusId, rowId });
    setExpandedRows((current) => {
      const next = new Set(current);
      if (!next.delete(rowId)) next.add(rowId);
      return next;
    });
  }, []);
  const focusRow = useCallback((item: LiveFeedItem) => setCursor({ lane: item.statusId, rowId: liveFeedRowId(item) }), []);
  const copyRow = useCallback((item: LiveFeedItem) => {
    if (!item.tracking) {
      toast.error('No tracking number on this record');
      return;
    }
    if (writeClipboardText(item.tracking)) toast.success(`Copied ${item.tracking}`);
    else toast.error('Copy failed');
  }, []);
  const reveal = useCallback((lane: string) => {
    setRevealed((current) => new Set(current).add(lane));
  }, []);
  const toggleExpand = useCallback((lane: string) => {
    setExpandedLane((current) => (current === lane ? null : lane));
  }, []);
  const toggleCarry = useCallback(
    () =>
      replace((params) => {
        if (params.get(LIVE_FEED_PARAMS.carry) === '1') params.delete(LIVE_FEED_PARAMS.carry);
        else params.set(LIVE_FEED_PARAMS.carry, '1');
      }),
    [replace],
  );

  useLiveFeedBoardKeys(
    boardRef,
    {
      laneRows,
      columns,
      cursor,
      openId,
      unfoldedRows: expandedRows.size,
      expandedLane,
      revealedLanes: revealed.size,
      isFolded,
    },
    {
      openRow,
      toggleRow,
      copyRow,
      toggleExpand,
      setCursor,
      foldRows: () => setExpandedRows(NO_ROWS),
      restoreLanes: () => {
        setExpandedLane(null);
        setRevealed(new Set());
      },
    },
  );

  // ── Phone: one lane at a time ─────────────────────────────────────────────
  const laneIds = useMemo(() => columns.map((column) => column.status.id), [columns]);
  const pager = useColumnBoardPager(laneIds, phone);
  const switcherColumns = useMemo(
    () => columns.map((column) => ({ id: column.status.id, label: column.status.label, count: column.count })),
    [columns],
  );

  const lane = (column: LiveFeedBoardColumn) => {
    const expanded = expandedLane === column.status.id;
    return (
      <LiveFeedLane
        key={column.status.id}
        column={column}
        filters={filters}
        folded={isFolded(column)}
        expanded={expanded}
        fullWidth={phone || expanded}
        carry={filters.carry}
        now={now}
        expandedRows={expandedRows}
        openId={openId}
        cursorId={cursor?.lane === column.status.id ? cursor.rowId : null}
        onReveal={reveal}
        onToggleExpand={toggleExpand}
        onToggleCarry={toggleCarry}
        onRowToggle={toggleRow}
        onRowOpen={openRow}
        onRowCopy={copyRow}
        onRowFocus={focusRow}
      />
    );
  };

  const boardLabel = filters.dir === 'outbound' ? 'Outbound statuses' : 'Inbound statuses';
  const board =
    columns.length === 0 ? (
      query.isError ? (
        <TriageAllClear title="Couldn't load the live feed" detail="It retries on the next live update, or reload the page." />
      ) : query.isLoading ? null : (
        <TriageAllClear title="No status in this channel" detail="Clear the sidebar's Channel to see every status of this direction." />
      )
    ) : (
      <div ref={boardRef} {...{ [LIST_KEY_OWNER_ATTR]: '' }} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {phone ? (
          <ColumnBoardSwitcher
            label={boardLabel}
            columns={switcherColumns}
            activeId={pager.activeId}
            onPick={pager.show}
            testId="live-feed-board-switcher"
          />
        ) : (
          // The board's own top row: its fullscreen control rides the section eyebrows' line.
          <div className="absolute right-0 top-0 z-20 bg-surface-card">
            <DeskFullscreenToggle />
          </div>
        )}
        <ColumnBoard ref={pager.stripRef} layout="lanes" testId="live-feed-board" label={boardLabel}>
          {phone
            ? columns.map(lane)
            : sections.map((section) => (
                <ColumnBoardSection key={section.id} id={section.id} label={LIVE_FEED_SECTION_LABEL[section.id]}>
                  {section.columns.map(lane)}
                </ColumnBoardSection>
              ))}
        </ColumnBoard>
      </div>
    );

  return (
    <DeskRecordPlane
      open={openItem != null}
      onClose={close}
      title={openItem ? (openItem.tracking ?? openItem.orderId ?? openItem.ref ?? 'Record') : 'Record'}
      recordNoun="record"
      recordKey={openId == null ? null : String(openId)}
      splitPane="open"
      testId="live-feed-record"
      list={board}
    >
      {openItem ? <LiveFeedRecord item={openItem} /> : null}
    </DeskRecordPlane>
  );
}