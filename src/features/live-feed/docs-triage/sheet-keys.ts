'use client';

/**
 * The docs sheet's keyboard (operator 2026-10-09: "j k and more keybinds when
 * the documents overlay is open"). Never while typing:
 *
 *   1 2 3      the tab (both views)
 *   J / K      next / previous order within the owed filter (↓ / ↑ too) —
 *              the rail's open order, or the grid's highlighted row
 *   Enter      grid: open the highlighted row in the rail
 *   N          the next order × tab still owed, within the filter
 *   G          Orders / Grid
 *   F          cycle the owed filter (skipping empty options)
 *   B          buy the label an owed order needs (viewer column)
 *   O          open the shown document in a new tab
 *   ⌘↵         link the previewed document
 *   P          print the open tab for every order
 *   ?          the shortcut sheet, which lists this group while the sheet is open
 *   Esc        (the dialog's own Escape) close a label buy, clear the
 *              selection, then close
 *
 * The sheet claims the keyboard (`useRegisterOverlay`, so ambient owners like
 * the G leader stand down) and stops, at its edge, every key the Live feed
 * board handles on `document` (`LiveFeedBoard`: Esc, J / K, ↑ / ↓, 1–4,
 * `/`) — used here or not, none of them reaches the board behind it.
 */

import { useEffect, type KeyboardEvent, type MutableRefObject } from 'react';
import { useRegisterOverlay } from '@/design-system/hooks/useOverlayStack';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hotkeyMatches } from '@/lib/keyboard/key-registry';
import { registerShortcutOverviewGroup, toggleShortcutOverview } from '@/lib/keyboard/shortcut-overview';
import { isPacketGap, type OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import { linkedItems } from './doc-selection';
import { DOC_TABS, docTabState, type DocTab } from './doc-tabs';
import type { SheetKeys } from './OrderSheet';
import { nextOwed, nextRailFilter, type RailFilter, type SheetPlace } from './sheet-model';

export type SheetView = 'rail' | 'grid';

const LINK_HOTKEY = 'mod+enter';

/** The keys `LiveFeedBoard` handles on `document` — stopped at the sheet's edge. */
const BOARD_KEYS: Readonly<Record<string, true>> = {
  Escape: true,
  j: true,
  k: true,
  J: true,
  K: true,
  ArrowDown: true,
  ArrowUp: true,
  '1': true,
  '2': true,
  '3': true,
  '4': true,
  '/': true,
};

/** The walking keys — held down, they keep walking (every other key acts once per press). */
const STEP_KEYS: Readonly<Record<string, true>> = { j: true, k: true, J: true, K: true, ArrowDown: true, ArrowUp: true };

/** Controls that move on ↑ / ↓ themselves — the sheet leaves those arrows to them. */
const OWN_ARROWS = '[role="tablist"], [role="radiogroup"], [role="listbox"], [role="menu"]';

/** Controls that act on Enter themselves — the grid's Enter-to-open stands down on them. */
const OWN_ENTER = 'button, a[href], [role="button"], [role="checkbox"], [role="radio"], [role="tab"], [role="option"]';

/** The sheet's keys as the `?` shortcut sheet lists them. */
const SHEET_KEY_ROWS = [
  { keys: ['1', '2', '3'], label: 'Shipping label · Packing slip · Product paperwork' },
  { keys: ['J', 'K'], label: 'Next / previous order (↓ / ↑ too) — within the filter' },
  { keys: ['Enter'], label: 'Grid: open the highlighted order' },
  { keys: ['N'], label: 'Next order and tab still owed' },
  { keys: ['G'], label: 'Orders / Grid view' },
  { keys: ['F'], label: 'Cycle the owed filter' },
  { keys: ['B'], label: 'Buy the label an owed order needs' },
  { keys: ['O'], label: 'Open the shown document in a new tab' },
  { keys: ['Mod', 'Enter'], label: 'Link the previewed document' },
  { keys: ['P'], label: 'Print the open tab for every order' },
  { keys: ['Esc'], label: 'Close the label buy · clear the selection · close' },
  { keys: ['?'], label: 'This list' },
];

/** While the sheet is open: it owns the keyboard, and `?` lists its keys. */
export function useSheetKeyboard(open: boolean): void {
  useRegisterOverlay(open);
  useEffect(() => {
    if (!open) return;
    return registerShortcutOverviewGroup({ id: 'live-feed-docs-sheet', title: 'Labels & paperwork', rows: SHEET_KEY_ROWS });
  }, [open]);
}

/** What the keys read and drive — the sheet's state and verbs. */
export interface SheetKeyContext {
  view: SheetView;
  tab: DocTab;
  /** Every order of the selection. */
  rows: readonly OrderPacket[];
  filter: RailFilter;
  /** The order the keys act on: the rail's open order, or the grid's highlighted row. */
  here: OrderPacket | null;
  keys: MutableRefObject<SheetKeys>;
  chooseTab: (tab: DocTab) => void;
  step: (delta: 1 | -1) => void;
  goTo: (place: SheetPlace) => void;
  switchView: (view: SheetView) => void;
  chooseFilter: (filter: RailFilter) => void;
  openBuy: (packet: OrderPacket) => void;
  print: () => void;
}

/** The key's action, or null when the key is not the sheet's (or has nothing to act on here). */
function keyAction(event: KeyboardEvent<HTMLElement>, ctx: SheetKeyContext): (() => void) | null {
  const { view, tab, rows, filter, here } = ctx;
  const target = event.target instanceof Element ? event.target : null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const digit = ['1', '2', '3'].indexOf(key);
  if (digit >= 0) return here ? () => ctx.chooseTab(DOC_TABS[digit]!) : null;
  if (key === 'j' || key === 'k') return () => ctx.step(key === 'j' ? 1 : -1);
  if (key === 'ArrowDown' || key === 'ArrowUp') return target?.closest(OWN_ARROWS) ? null : () => ctx.step(key === 'ArrowDown' ? 1 : -1);
  if (key === 'Enter') return view === 'grid' && here && !target?.closest(OWN_ENTER) ? () => ctx.goTo({ orderId: here.orderId, tab }) : null;
  if (key === 'n') {
    const next = here ? nextOwed(rows, { orderId: here.orderId, tab }, filter) : null;
    return next ? () => ctx.goTo(next) : null;
  }
  if (key === 'g') return rows.length > 1 ? () => ctx.switchView(view === 'grid' ? 'rail' : 'grid') : null;
  if (key === 'f') return rows.length > 1 ? () => ctx.chooseFilter(nextRailFilter(rows, filter)) : null;
  if (key === 'b') return here && isPacketGap(docTabState(here, 'label')) ? () => ctx.openBuy(here) : null;
  if (key === 'o') {
    const href = view === 'grid' ? (here ? linkedItems(here, tab)[0]?.src : null) : ctx.keys.current.open;
    return href ? () => void window.open(href, '_blank', 'noopener,noreferrer') : null;
  }
  if (key === 'p') return ctx.print;
  if (key === '?') return toggleShortcutOverview;
  return null;
}

/** The sheet's `onKeyDown` (on `DialogContent`, so it sees every key pressed inside, portals included). */
export function onSheetKeyDown(event: KeyboardEvent<HTMLElement>, ctx: SheetKeyContext): void {
  if (BOARD_KEYS[event.key]) event.stopPropagation();
  if (event.defaultPrevented || isEditableKeyTarget(event.target)) return;
  if (hotkeyMatches(LINK_HOTKEY, event)) {
    const link = ctx.keys.current.link;
    if (!link) return;
    event.preventDefault();
    link();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  // The label-buy form owns its own keys (Enter moves its steps); Esc still closes it.
  if (event.target instanceof Element && event.target.closest('[data-docs-label-buy]')) return;
  if (event.repeat && !STEP_KEYS[event.key]) return;
  const action = keyAction(event, ctx);
  if (!action) return;
  event.preventDefault();
  action();
}
