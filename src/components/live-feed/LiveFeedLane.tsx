'use client';

/**
 * One Live feed BOARD lane — a status as a {@link ColumnBoardColumn} at the
 * board's one fixed lane width: the two-row lane header (label · count, then
 * `3 late · oldest 2d` and the "+12 from earlier" carry-over chip on an open
 * lane, or the top groups and `▲ 4 vs prev` on a done lane) under its tone
 * bar; the header's actions in ONE overflow menu (Copy all tracking, Expand /
 * Restore lane); late rows pinned under a tiny "Late" divider. An empty lane
 * folds to a {@link ColumnBoardRail}.
 *
 * EXPANDED (E, the menu, or the "+N more" footer) the lane takes the board's
 * whole width as a list with every row's facts unfolded, paging through the
 * status's full membership (`GET /api/live-feed`); Esc folds it back.
 */

import { memo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Copy, Maximize2, Minimize2, MoreHorizontal } from '@/components/Icons';
import { trackingClipboardText } from '@/components/shipped/ledger/unmatched-scans';
import { ColumnBoardColumn, ColumnBoardEmpty, ColumnBoardRail } from '@/design-system/components/column-board/ColumnBoard';
import { Button } from '@/design-system/primitives/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { IconButton } from '@/design-system/primitives/IconButton';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { writeClipboardText } from '@/lib/clipboard';
import { liveFeedQuery, liveFeedTrackingQuery } from '@/lib/live-feed/query';
import { LIVE_FEED_PAGE_SIZE } from '@/lib/live-feed/route';
import type { LiveFeedBoardColumn, LiveFeedFilters, LiveFeedItem } from '@/lib/live-feed/types';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import {
  liveFeedLaneAccent,
  liveFeedLaneDelta,
  liveFeedLaneMeta,
  liveFeedRowId,
  splitLateItems,
} from './live-feed-board-model';
import { LiveFeedTicket } from './LiveFeedTicket';

export interface LiveFeedLaneProps {
  column: LiveFeedBoardColumn;
  filters: LiveFeedFilters;
  /** Folded to its rail (empty, not revealed). */
  folded: boolean;
  /** The lane is expanded across the board: a full list, every row's facts unfolded. */
  expanded: boolean;
  /** Take the strip's whole width (expanded, or one lane per phone screen). */
  fullWidth: boolean;
  /** Carry-over (`carry=1`) is on: open lanes include what entered before the range. */
  carry: boolean;
  now: number | null;
  expandedRows: ReadonlySet<number>;
  openId: number | null;
  cursorId: number | null;
  onReveal: (statusId: string) => void;
  onToggleExpand: (statusId: string) => void;
  onToggleCarry: () => void;
  onRowToggle: (item: LiveFeedItem) => void;
  onRowOpen: (item: LiveFeedItem) => void;
  onRowCopy: (item: LiveFeedItem) => void;
  onRowFocus: (item: LiveFeedItem) => void;
}

export const LiveFeedLane = memo(function LiveFeedLane({
  column,
  filters,
  folded,
  expanded,
  fullWidth,
  carry,
  now,
  expandedRows,
  openId,
  cursorId,
  onReveal,
  onToggleExpand,
  onToggleCarry,
  onRowToggle,
  onRowOpen,
  onRowCopy,
  onRowFocus,
}: LiveFeedLaneProps) {
  const { status } = column;
  const accent = column.applicable ? liveFeedLaneAccent(column) : 'bg-mode-edge';
  const items = useLaneItems(column, filters, expanded);
  const carriedOver = column.carriedOver ?? 0;

  if (folded) {
    return (
      <ColumnBoardRail
        id={status.id}
        label={status.label}
        count={column.count}
        accent={accent}
        hint={column.applicable ? status.hint : `${status.hint} — not dated by this lens`}
        onExpand={() => onReveal(status.id)}
        testId="live-feed-board-column"
      />
    );
  }

  const { late, rest } = splitLateItems(items.rows);
  const ticket = (item: LiveFeedItem) => {
    const rowId = liveFeedRowId(item);
    return (
      <LiveFeedTicket
        key={item.key}
        item={item}
        rowId={rowId}
        now={now}
        expanded={expanded || expandedRows.has(rowId)}
        open={openId === rowId}
        cursor={cursorId === rowId}
        onToggle={onRowToggle}
        onOpen={onRowOpen}
        onCopy={onRowCopy}
        onFocusRow={onRowFocus}
      />
    );
  };
  const facts = liveFeedLaneMeta(column, now);
  const delta = liveFeedLaneDelta(column);
  const meta = (
    <>
      {facts}
      {delta ? `${facts ? ' · ' : ''}${delta}` : null}
      {carriedOver > 0 ? (
        <>
          {facts ? ' · ' : null}
          <button
            type="button"
            onClick={onToggleCarry}
            data-testid="live-feed-board-carry"
            className={cn(
              'inline-flex items-center rounded-mode-pill bg-mode-well px-1.5 text-text-muted transition-colors hover:text-text-default',
              focusRing('control'),
            )}
          >
            {carry ? `incl. ${carriedOver} from earlier` : `+${carriedOver} from earlier`}
          </button>
        </>
      ) : null}
    </>
  );

  return (
    <ColumnBoardColumn
      id={status.id}
      label={status.label}
      count={column.count}
      width={fullWidth ? 'full' : 'lane'}
      hint={status.hint}
      accent={accent}
      meta={meta}
      testId="live-feed-board-column"
      action={<LaneMenu column={column} filters={filters} expanded={expanded} onToggleExpand={onToggleExpand} />}
    >
      {items.rows.length === 0 ? (
        <ColumnBoardEmpty />
      ) : (
        <>
          {late.length > 0 ? (
            <>
              <p className="px-3 pb-0.5 pt-1.5 text-role-eyebrow text-text-danger">Late</p>
              <ol aria-label={`${status.label}, late`}>{late.map(ticket)}</ol>
            </>
          ) : null}
          {rest.length > 0 ? <ol aria-label={late.length > 0 ? `${status.label}, on time` : status.label}>{rest.map(ticket)}</ol> : null}
          {items.more > 0 ? (
            <div className="px-2 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={items.loading}
                onClick={expanded ? items.loadMore : () => onToggleExpand(status.id)}
                data-testid="live-feed-board-more"
              >
                {expanded ? `Show ${Math.min(items.more, LIVE_FEED_PAGE_SIZE)} more` : `+${items.more} more · Expand lane`}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </ColumnBoardColumn>
  );
});

/**
 * The lane's rows: the board's capped first rows; expanded, the status's own
 * server pages (`LIVE_FEED_PAGE_SIZE` each) — the capped rows stand in until
 * page 1 lands.
 */
function useLaneItems(column: LiveFeedBoardColumn, filters: LiveFeedFilters, expanded: boolean) {
  const [pages, setPages] = useState(1);
  const paged = expanded && column.count > column.items.length;
  const results = useQueries({
    queries: Array.from({ length: paged ? pages : 0 }, (_, index) =>
      liveFeedQuery({ ...filters, status: column.status.id, page: index + 1 }),
    ),
  });
  const loaded = results.flatMap((result) => result.data?.items ?? []);
  const rows = paged && results[0]?.data ? loaded : column.items;
  return {
    rows,
    more: Math.max(0, column.count - rows.length),
    loading: results.some((result) => result.isFetching),
    loadMore: () => setPages((current) => current + 1),
  };
}

/** The lane header's ONE overflow menu; Copy all reads every tracking number of the status (not only the painted rows) once opened. */
function LaneMenu({
  column,
  filters,
  expanded,
  onToggleExpand,
}: {
  column: LiveFeedBoardColumn;
  filters: LiveFeedFilters;
  expanded: boolean;
  onToggleExpand: (statusId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { status } = column;
  const online = status.channels.includes('online');
  const tracking = useQuery({
    ...liveFeedTrackingQuery({ ...filters, status: status.id, page: 1 }),
    enabled: menuOpen && online && column.count > 0,
  });
  const text = trackingClipboardText(tracking.data?.tracking ?? []);
  const copyCount = text ? text.split('\n').length : 0;

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <IconButton
          size="xs"
          radius="control"
          icon={<MoreHorizontal className="size-4" />}
          ariaLabel={`${status.label} actions`}
          data-testid="live-feed-board-lane-menu"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {online ? (
          <DropdownMenuItem
            disabled={copyCount === 0}
            data-testid="live-feed-board-copy-all"
            onSelect={() => {
              if (writeClipboardText(text)) toast.success(`Copied ${copyCount} tracking`);
              else toast.error('Copy failed');
            }}
          >
            <Copy />
            {tracking.isLoading && column.count > 0 ? 'Copy all tracking…' : `Copy all tracking (${copyCount})`}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => onToggleExpand(status.id)} data-testid="live-feed-board-expand">
          {expanded ? <Minimize2 /> : <Maximize2 />}
          {expanded ? 'Restore lane' : 'Expand lane'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}