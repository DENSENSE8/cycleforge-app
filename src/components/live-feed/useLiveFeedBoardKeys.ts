'use client';

/**
 * The Live feed board's keyboard (the board owns it — `data-list-key-owner`):
 * J/K a row in the lane, H/L the next lane (rails skipped), Enter unfold the
 * row, O open the record, C copy its tracking, E expand the lane, Esc fold
 * rows then lanes back. Keyboard moves land focus on the cursor's row; an
 * expanded lane scrolls to its own left edge. Listed in the `?` cheat sheet.
 */

import { useEffect, useRef } from 'react';
import { LIST_KEY_OWNER_ATTR } from '@/lib/keyboard/list-key-scope';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import type { LiveFeedBoardColumn, LiveFeedItem } from '@/lib/live-feed/types';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { liveFeedRowId } from './live-feed-board-model';

/** The board's keys, for the `?` cheat sheet (taught on hover elsewhere). */
const BOARD_SHORTCUTS = {
  id: 'live-feed-board',
  title: 'Live feed board',
  rows: [
    { keys: ['J'], label: 'Next row in the lane' },
    { keys: ['K'], label: 'Previous row in the lane' },
    { keys: ['H'], label: 'Previous lane' },
    { keys: ['L'], label: 'Next lane' },
    { keys: ['Enter'], label: 'Unfold or fold the row' },
    { keys: ['O'], label: 'Open the record beside the board' },
    { keys: ['C'], label: 'Copy the row’s tracking' },
    { keys: ['E'], label: 'Expand the lane across the board, or restore it' },
    { keys: ['Esc'], label: 'Fold rows and lanes back' },
  ],
};

export interface BoardCursor {
  lane: string;
  rowId: number;
}

interface BoardKeyState {
  laneRows: ReadonlyMap<string, LiveFeedItem[]>;
  columns: readonly LiveFeedBoardColumn[];
  cursor: BoardCursor | null;
  openId: number | null;
  /** Rows unfolded one by one. */
  unfoldedRows: number;
  expandedLane: string | null;
  /** Empty lanes unfolded from their rails. */
  revealedLanes: number;
  isFolded: (column: LiveFeedBoardColumn) => boolean;
}

interface BoardKeyActions {
  openRow: (item: LiveFeedItem) => void;
  toggleRow: (item: LiveFeedItem) => void;
  copyRow: (item: LiveFeedItem) => void;
  toggleExpand: (lane: string) => void;
  setCursor: (cursor: BoardCursor) => void;
  foldRows: () => void;
  restoreLanes: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  const role = target.getAttribute('role');
  return role === 'textbox' || role === 'searchbox' || role === 'combobox';
}

export function useLiveFeedBoardKeys(boardRef: { readonly current: HTMLDivElement | null }, state: BoardKeyState, actions: BoardKeyActions) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const focusCursorRef = useRef(false);

  // Keyboard moves land focus on the cursor's row (a click already has it).
  const { cursor, expandedLane } = state;
  useEffect(() => {
    if (!cursor || !focusCursorRef.current) return;
    focusCursorRef.current = false;
    const face = boardRef.current?.querySelector(`[data-ticket="${cursor.rowId}"] [data-ticket-face]`);
    if (face instanceof HTMLElement) face.focus({ preventScroll: false });
  }, [boardRef, cursor]);
  // An expanded lane scrolls the strip (only the strip) to its own left edge.
  useEffect(() => {
    if (!expandedLane) return;
    const lane = boardRef.current?.querySelector(`[data-column="${CSS.escape(expandedLane)}"]`);
    const strip = lane?.closest('[data-testid="live-feed-board"]');
    if (lane instanceof HTMLElement && strip) strip.scrollTo({ left: lane.offsetLeft, behavior: 'smooth' });
  }, [boardRef, expandedLane]);

  useEffect(() => {
    const unregister = registerShortcutOverviewGroup(BOARD_SHORTCUTS);
    // Capture: the board folds its own rows and lanes before the stage's Esc
    // (leave fullscreen) runs; an open record's Esc is the record plane's.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || hasOpenOverlay()) return;
      const board = boardRef.current;
      if (!board) return;
      const target = event.target instanceof Element ? event.target : null;
      const owner = target?.closest(`[${LIST_KEY_OWNER_ATTR}]`);
      if (owner && owner !== board) return;
      const inBoard = target != null && board.contains(target);
      const now = stateRef.current;
      const act = actionsRef.current;
      const lanes = now.columns.filter((column) => !now.isFolded(column) && (now.laneRows.get(column.status.id)?.length ?? 0) > 0);
      const at = now.cursor;
      const laneOf = (lane: string) => now.laneRows.get(lane) ?? [];
      const indexOf = (lane: string, rowId: number) => laneOf(lane).findIndex((item) => liveFeedRowId(item) === rowId);
      const cursorItem = at ? (laneOf(at.lane)[indexOf(at.lane, at.rowId)] ?? null) : null;

      const moveTo = (item: LiveFeedItem | undefined) => {
        if (!item) return;
        focusCursorRef.current = true;
        if (now.openId != null) act.openRow(item);
        else act.setCursor({ lane: item.statusId, rowId: liveFeedRowId(item) });
      };
      const firstRow = () => laneOf(lanes[0]?.status.id ?? '')[0];
      const clampIn = (rows: LiveFeedItem[], index: number) => rows[Math.min(rows.length - 1, Math.max(0, index))];
      const stepRow = (delta: number) => {
        if (!at || !cursorItem) return moveTo(firstRow());
        moveTo(clampIn(laneOf(at.lane), indexOf(at.lane, at.rowId) + delta));
      };
      const stepLane = (delta: number) => {
        if (!at || !cursorItem) return moveTo(firstRow());
        const nextLane = lanes[lanes.findIndex((column) => column.status.id === at.lane) + delta];
        if (nextLane) moveTo(clampIn(laneOf(nextLane.status.id), indexOf(at.lane, at.rowId)));
      };

      const key = event.key;
      let handled = true;
      if (key === 'Escape') {
        if (now.openId != null) return;
        if (now.unfoldedRows > 0) act.foldRows();
        else if (now.expandedLane != null || now.revealedLanes > 0) act.restoreLanes();
        else handled = false;
      } else if (key === 'Enter') {
        if (event.shiftKey || !inBoard || !target?.closest('[data-ticket-face]') || !cursorItem) handled = false;
        else act.toggleRow(cursorItem);
      } else if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'ArrowLeft' || key === 'ArrowRight') {
        if (!inBoard) handled = false;
        else if (key === 'ArrowDown') stepRow(1);
        else if (key === 'ArrowUp') stepRow(-1);
        else stepLane(key === 'ArrowRight' ? 1 : -1);
      } else if (!inBoard && target !== document.body && now.openId == null) {
        // Bare letters belong to the board while it (or the open record beside it) has the page's attention.
        handled = false;
      } else {
        switch (key.toLowerCase()) {
          case 'j':
            stepRow(1);
            break;
          case 'k':
            stepRow(-1);
            break;
          case 'h':
            stepLane(-1);
            break;
          case 'l':
            stepLane(1);
            break;
          case 'o':
            if (cursorItem) act.openRow(cursorItem);
            else handled = false;
            break;
          case 'c':
            if (cursorItem) act.copyRow(cursorItem);
            else handled = false;
            break;
          case 'e':
            if (at) act.toggleExpand(at.lane);
            else handled = false;
            break;
          default:
            handled = false;
        }
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      unregister();
    };
  }, [boardRef]);
}