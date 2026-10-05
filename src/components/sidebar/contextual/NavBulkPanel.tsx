'use client';

import { useCallback, useEffect, useId, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Button, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Copy, Maximize2, X } from '@/components/Icons';
import { AnimatePresence, LayoutGroup } from '@/design-system/motion';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import type { BulkList } from '@/lib/nav/locate/use-bulk-list';
import { COPY_HOTKEY, COPY_SHOWN_HOTKEY, hotkeyFires } from '@/lib/keyboard/key-registry';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import type { PageFind } from './NavFind';
import { useBulkListView, type BulkListSort } from './bulk-list-view';
import { BulkSortChips, BulkStatusChips, nextIdSort, nextStatusSort } from './NavBulkChips';
import { BulkRow, ICON_KEY_CLASS } from './NavBulkRow';

/**
 * The pasted list, in the search well's own dropdown (FindField `drop`):
 * a count + sort line, the status chips (where the numbers live, with how
 * many each holds — the pressed chip is one pill that glides between them),
 * then one row per number: where it lives (bucket glyph + label), the number
 * as pasted, why, what it is. The rows follow the bucket filter, so one
 * bucket isolates exactly those numbers. Enter pinpoints a number: Find
 * narrows the list on screen when its bucket is that list, otherwise the
 * bucket's list opens narrowed to it. E edit · ⌘/Ctrl+C copy · ⌫ remove ·
 * R recheck · O / S sort.
 *
 * Focus stays in the field while the panel is open; ↓ in the field hands the
 * keys to `listboxRef`, ↑ past the first row hands them back (`onLeave`).
 *
 * Motion (all ease-in-out tweens, `findList*` presets): rows cascade in top →
 * bottom; a pending row breathes until its answer lands, then crossfades to
 * its verdict; counts tick (AnimatedStat); filtering reflows the rows
 * (`popLayout` + `layout`).
 */
export function NavBulkPanel({
  list,
  find: pageFind,
  sort,
  onSort,
  onClose,
  onLeave,
  onOpenFull,
  onClear,
  recent,
  listboxRef,
}: {
  list: BulkList;
  /** The page list's Find; absent (the everywhere face) = the desk store at this path. */
  find?: PageFind;
  sort: BulkListSort;
  onSort: (next: BulkListSort) => void;
  /** Close the panel — Esc, or a pinpoint that opens another list. */
  onClose: () => void;
  /** Hand the keys back to the field (↑ past the first row). */
  onLeave: () => void;
  /** The list's own full-screen page — every fact per number. */
  onOpenFull: () => void;
  /** A surface with no token to clear from (the ⌘K palette) puts the list's × in the count line. */
  onClear?: () => void;
  /** A short Recent lists section under the header (the bar's other pasted lists). */
  recent?: ReactNode;
  listboxRef: RefObject<HTMLDivElement>;
}) {
  const view = useBulkListView({ list, find: pageFind, sort, onLeave: onClose });
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const pillScope = useId();
  const listboxId = useId();
  const { visible, counts } = view;
  const safeCursor = Math.min(cursor, Math.max(0, visible.length - 1));

  useEffect(() => {
    listboxRef.current
      ?.querySelector<HTMLElement>(`[data-bulk-index="${safeCursor}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [safeCursor, listboxRef]);
  // The list's keys are never painted in the panel: the controls teach theirs on hover, the `?` sheet lists them all.
  useEffect(() => registerShortcutOverviewGroup(PANEL_KEYS), []);
  const refocus = useCallback(() => listboxRef.current?.focus({ preventScroll: true }), [listboxRef]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const row = visible[safeCursor];
    const key = event.key;
    // Copy is ⌘/Ctrl+C (⌘⌥C / Ctrl+Alt+C every shown number) — C is create app-wide (`key-registry`).
    if (hotkeyFires(COPY_SHOWN_HOTKEY, event)) view.copyShown();
    else if (hotkeyFires(COPY_HOTKEY, event)) {
      if (!row) return;
      view.copyOne(row.entry);
    } else if (event.metaKey || event.ctrlKey || event.altKey) return;
    else if (key === 'ArrowDown' || key === 'j') setCursor(Math.min(visible.length - 1, safeCursor + 1));
    else if ((key === 'ArrowUp' || key === 'k') && safeCursor === 0) onLeave();
    else if (key === 'ArrowUp' || key === 'k') setCursor(safeCursor - 1);
    else if (key === 'Home') setCursor(0);
    else if (key === 'End') setCursor(Math.max(0, visible.length - 1));
    else if (key === 'Enter' && row) view.pinpoint(row);
    else if ((key === 'e' || key === 'E') && row) setEditing(row.entry.ref);
    else if ((key === 'r' || key === 'R') && row) view.recheck(row.entry);
    else if ((key === 'Backspace' || key === 'Delete' || key === 'x') && row) view.remove(row.entry);
    else if (key === 'o' || key === 'O') onSort(nextIdSort(sort));
    else if (key === 's' || key === 'S') onSort(nextStatusSort(sort));
    else if (key === 'Escape') onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <LayoutGroup id={pillScope}>
      <div data-nav-bulk-panel className="flex min-h-0 flex-col">
        {/* Full screen · count · sort — the Find well's height, so the two read as one line. */}
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border-hairline px-1.5">
          <HoverTooltip label="Open full screen" asChild>
            <IconButton
              ariaLabel="Open full screen"
              onClick={onOpenFull}
              className={ICON_KEY_CLASS}
              data-nav-bulk-full
              icon={<Maximize2 aria-hidden className="size-3.5" />}
            />
          </HoverTooltip>
          <span className="flex min-w-0 flex-1 items-baseline gap-1 truncate text-role-caption font-semibold text-text-default">
            <AnimatedStat value={view.filterLabel ? visible.length : counts.total} />
            <span className="truncate">{view.filterLabel ? view.filterLabel.toLowerCase() : 'pasted'}</span>
            {list.selection.truncated > 0 ? (
              <span className="font-normal text-text-faint">· first {list.selection.refs.length}</span>
            ) : null}
            {counts.checking > 0 ? (
              <span className="inline-flex items-baseline gap-1 font-normal text-text-faint">
                · <AnimatedStat value={counts.checking} /> checking
              </span>
            ) : null}
          </span>
          <BulkSortChips sort={sort} onSort={onSort} />
          <HoverTooltip label="Copy the numbers shown" shortcut="Mod + Alt + C" asChild>
            <IconButton
              ariaLabel="Copy the numbers shown"
              onClick={view.copyShown}
              className={ICON_KEY_CLASS}
              icon={<Copy aria-hidden className="size-3.5" />}
            />
          </HoverTooltip>
          {onClear ? (
            <HoverTooltip label="Clear the pasted list" asChild>
              <IconButton
                ariaLabel="Clear the pasted list"
                onClick={onClear}
                className={ICON_KEY_CLASS}
                icon={<X aria-hidden className="size-3.5" />}
              />
            </HoverTooltip>
          ) : null}
        </div>
        {recent}

        {/* Status chips — where the pasted numbers live, with how many each holds. */}
        <BulkStatusChips list={list} nowhere={counts.nowhere} className="border-b border-border-hairline px-1.5 py-1" />

        {list.error ? (
          <div className="flex items-center gap-2 border-b border-border-hairline px-2 py-1.5 text-role-caption text-text-danger">
            <span className="min-w-0 flex-1 truncate">{list.error}</span>
            <Button size="sm" variant="ghost" onClick={list.refetch}>
              Retry
            </Button>
          </div>
        ) : null}

        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          tabIndex={0}
          aria-label="Pasted numbers"
          aria-activedescendant={visible[safeCursor] ? `${listboxId}-${safeCursor}` : undefined}
          onKeyDown={onKeyDown}
          className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain py-1 outline-none"
        >
          <AnimatePresence mode="popLayout">
            {visible.map((row, index) => (
              <BulkRow
                key={row.entry.ref}
                id={`${listboxId}-${index}`}
                entry={row.entry}
                primary={row.primary}
                index={index}
                lit={index === safeCursor}
                pinned={view.find === row.entry.ref}
                editing={editing === row.entry.ref}
                onPoint={() => setCursor(index)}
                onOpen={() => view.pinpoint(row)}
                onEdit={() => setEditing(row.entry.ref)}
                onCommitEdit={(text) => {
                  setEditing(null);
                  if (text.trim() && text.trim() !== row.entry.ref) list.replaceRef(row.entry.ref, text);
                  refocus();
                }}
                onCancelEdit={() => {
                  setEditing(null);
                  refocus();
                }}
                onCopy={() => view.copyOne(row.entry)}
                onRemove={() => view.remove(row.entry)}
                onOpenBucket={(bucket) => view.openBucket(bucket, row.entry)}
                onOpenRecord={row.entry.recordHref ? () => view.openRecord(row.entry) : undefined}
              />
            ))}
          </AnimatePresence>
          {visible.length === 0 ? (
            <p className="px-3 py-2 text-role-caption text-text-faint">
              {list.loading ? 'Checking…' : 'No pasted numbers in this bucket.'}
            </p>
          ) : null}
        </div>
      </div>
    </LayoutGroup>
  );
}

const PANEL_KEYS = {
  id: 'nav-bulk-list',
  title: 'Pasted list',
  rows: [
    { keys: ['↓'], label: 'From Find into the list' },
    { keys: ['↑', '↓'], label: 'Move' },
    { keys: ['↵'], label: 'Pinpoint' },
    { keys: ['E'], label: 'Edit' },
    { keys: ['mod', 'C'], label: 'Copy' },
    { keys: ['mod', 'alt', 'C'], label: 'Copy shown' },
    { keys: ['R'], label: 'Recheck' },
    { keys: ['⌫'], label: 'Remove' },
    { keys: ['O'], label: 'Sort by order ID' },
    { keys: ['S'], label: 'Sort by status' },
    { keys: ['Esc'], label: 'Close' },
  ],
};
