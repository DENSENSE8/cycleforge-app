'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { KeyboardKey, Popover } from '@/design-system/primitives';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CircleDot,
  Clock,
  Copy,
  ExternalLink,
  Info,
  Loader2,
  Pencil,
  X,
} from '@/components/Icons';
import { setDeskSearch, useDeskSearch } from '@/lib/outbound/desk-search-store';
import type { NavLocateBucket } from '@/lib/nav/context/schema';
import { COPY_HOTKEY, COPY_SHOWN_HOTKEY, hotkeyFires } from '@/lib/keyboard/key-registry';
import { copyToClipboard } from '@/utils/_dom';
import { toast } from '@/lib/toast';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CHIP_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { BulkEntry, BulkList } from './NavBulkList';
import type { PageFind } from './NavFind';
import { NAV_LOCATE_TONE_VAR } from './nav-locate-tone';

type Tone = NavLocateBucket['tone'];

/** Each tone's glyph — the verdict reads before its word; ink is {@link NAV_LOCATE_TONE_VAR}. */
const TONE_ICON: Readonly<Record<Tone, typeof Check>> = {
  neutral: CircleDot,
  info: Info,
  success: Check,
  warning: Clock,
  danger: AlertTriangle,
};

type SortMode = 'pasted' | 'order-asc' | 'order-desc' | 'status';

const ORDER_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** A tactile square icon key — sinks 1px on press. */
const ICON_KEY_CLASS = cn(
  'ds-raw-button grid size-6 shrink-0 place-content-center rounded-sm text-text-muted',
  'transition-[background-color,transform,box-shadow] duration-100',
  'hover:bg-surface-card hover:text-text-default hover:shadow-sm hover:ring-1 hover:ring-border-soft',
  'active:translate-y-px active:bg-surface-sunken active:shadow-none',
  focusRing('control', 'accent'),
);

/**
 * Status sort = bucket order: numbers found nowhere lead (they need a
 * person), then each number by the first bucket that holds it.
 */
function sortEntries(entries: readonly BulkEntry[], mode: SortMode, bucketRank: ReadonlyMap<string, number>): BulkEntry[] {
  if (mode === 'pasted') return [...entries];
  if (mode === 'status') {
    const rank = (entry: BulkEntry) =>
      entry.buckets.length === 0 ? -1 : Math.min(...entry.buckets.map((id) => bucketRank.get(id) ?? Number.MAX_SAFE_INTEGER));
    return [...entries].sort((a, b) => rank(a) - rank(b));
  }
  const dir = mode === 'order-asc' ? 1 : -1;
  return [...entries].sort((a, b) => dir * ORDER_COLLATOR.compare(a.ref, b.ref));
}

/**
 * Is `href` the list on screen? Same pathname, every param the href sets
 * holds the same value here, and no view-defining param (one any bucket href
 * sets) is set here to something the href does not say.
 */
function isCurrentView(
  href: string,
  pathname: string,
  current: URLSearchParams,
  viewKeys: ReadonlySet<string>,
): boolean {
  const url = new URL(href, 'http://local');
  if (url.pathname !== pathname) return false;
  for (const [key, value] of url.searchParams) if (current.get(key) !== value) return false;
  for (const key of viewKeys) if (!url.searchParams.has(key) && current.has(key)) return false;
  return true;
}

/** One bucket holding a row's number, and whether it is the list on screen. */
interface RowBucket {
  bucket: NavLocateBucket;
  /** The list on screen — Enter narrows it instead of navigating. */
  current: boolean;
}

/**
 * The pasted list — one row per number: where it lives (bucket glyph + label),
 * the number as pasted, why, what it is. It follows the bucket filter, so one
 * bucket isolates exactly those numbers. Enter pinpoints a number: Find
 * narrows the list on screen when its bucket is that list, otherwise the
 * bucket's list opens narrowed to it. E edit · ⌘/Ctrl+C copy · ⌫ remove.
 */
export function NavBulkPopout({
  list,
  find: pageFind,
  anchorRef,
  open,
  onClose,
}: {
  list: BulkList;
  /** The page list's Find; absent (the everywhere face) = the desk store at this path. */
  find?: PageFind;
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname() || '/';
  const [deskFind, setDeskFind] = useDeskSearch(pathname);
  const find = pageFind ? pageFind.value : deskFind;
  const setFind = pageFind ? pageFind.set : setDeskFind;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sort, setSort] = useState<SortMode>('pasted');
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const bucketById = useMemo(() => new Map(list.buckets.map((bucket) => [bucket.id, bucket])), [list.buckets]);
  const bucketRank = useMemo(() => new Map(list.buckets.map((bucket, index) => [bucket.id, index])), [list.buckets]);
  // A bucket is "here" when its href is the list on screen. A verdict bucket
  // (no href) is the page's own list under the paste — except on the
  // everywhere face, which has no page list.
  const currentIds = useMemo(() => {
    const current = new URLSearchParams(searchParams?.toString() ?? '');
    const viewKeys = new Set<string>();
    for (const bucket of list.buckets) {
      if (bucket.href) for (const key of new URL(bucket.href, 'http://local').searchParams.keys()) viewKeys.add(key);
    }
    return new Set(
      list.buckets
        .filter((bucket) =>
          bucket.href ? isCurrentView(bucket.href, pathname, current, viewKeys) : list.scope !== 'everywhere',
        )
        .map((bucket) => bucket.id),
    );
  }, [list.buckets, list.scope, pathname, searchParams]);
  const rowBuckets = (entry: BulkEntry): RowBucket[] =>
    entry.buckets.flatMap((id) => {
      const bucket = bucketById.get(id);
      return bucket ? [{ bucket, current: currentIds.has(id) }] : [];
    });

  const visible = useMemo(() => {
    // A facet names the reason inside the status; it keeps its own numbers
    // (a found-nowhere number wears its reason with no bucket).
    const kept = list.facet
      ? list.entries.filter((entry) => entry.facet?.id === list.facet)
      : list.status
        ? list.entries.filter((entry) => entry.buckets.includes(list.status as string))
        : list.entries;
    return sortEntries(kept, sort, bucketRank);
  }, [list.entries, list.status, list.facet, sort, bucketRank]);
  const safeCursor = Math.min(cursor, Math.max(0, visible.length - 1));

  // The panel portals in after `open` flips (the anchored layer measures
  // first), so focus on attach — an effect on `open` runs before it exists.
  const attachList = useCallback((node: HTMLDivElement | null) => {
    listRef.current = node;
    node?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-bulk-index="${safeCursor}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [safeCursor]);

  const copy = async (text: string, what: string) => {
    if (await copyToClipboard(text)) toast.success(`Copied ${what}`);
  };
  // The bucket's list, narrowed to this number by its Find. A push, so
  // Back returns to the pasted list.
  const openBucket = (bucket: NavLocateBucket, entry: BulkEntry) => {
    if (!bucket.href) return;
    onClose();
    if (pageFind) {
      pageFind.open(bucket.href, entry.ref);
      return;
    }
    setDeskSearch(new URL(bucket.href, 'http://local').pathname, entry.ref);
    router.push(bucket.href, { scroll: false });
  };
  const openRecord = (entry: BulkEntry) => {
    if (!entry.recordHref) return;
    onClose();
    router.push(entry.recordHref, { scroll: false });
  };
  // On screen (or found nowhere): Find narrows the list here. Elsewhere: go there.
  const pinpoint = (entry: BulkEntry) => {
    const buckets = rowBuckets(entry);
    const away = buckets.find((row) => row.bucket.href);
    if (buckets.some((row) => row.current) || !away) setFind(find === entry.ref ? '' : entry.ref);
    else openBucket(away.bucket, entry);
  };
  // A pinpointed number that leaves the list must not keep narrowing the ledger to nothing.
  const removeEntry = (entry: BulkEntry) => {
    if (find === entry.ref) setFind('');
    list.remove(entry.ref);
  };
  const cycleOrderSort = () =>
    setSort((current) => (current === 'order-asc' ? 'order-desc' : current === 'order-desc' ? 'pasted' : 'order-asc'));
  const facetLabel = list.facet ? list.entries.find((entry) => entry.facet?.id === list.facet)?.facet?.label : undefined;
  const filterLabel = facetLabel ?? (list.status ? bucketById.get(list.status)?.label : undefined);
  const copyShown = () => void copy(visible.map((e) => e.ref).join('\n'), `${visible.length} numbers`);
  const recheck = (entry: BulkEntry) => {
    list.recheck(entry.ref);
    toast.message(`Checking ${entry.ref} again`);
  };
  const nowhere = list.entries.filter((entry) => !entry.pending && entry.buckets.length === 0).length;
  const checking = list.entries.filter((entry) => entry.pending).length;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const entry = visible[safeCursor];
    const key = event.key;
    // Copy is ⌘/Ctrl+C (⌘⌥C / Ctrl+Alt+C every shown number) — C is create app-wide (`key-registry`).
    if (hotkeyFires(COPY_SHOWN_HOTKEY, event)) copyShown();
    else if (hotkeyFires(COPY_HOTKEY, event)) {
      if (!entry) return;
      void copy(entry.ref, entry.ref);
    } else if (event.metaKey || event.ctrlKey || event.altKey) return;
    else if (key === 'ArrowDown' || key === 'j') setCursor(Math.min(visible.length - 1, safeCursor + 1));
    else if (key === 'ArrowUp' || key === 'k') setCursor(Math.max(0, safeCursor - 1));
    else if (key === 'Home') setCursor(0);
    else if (key === 'End') setCursor(Math.max(0, visible.length - 1));
    else if (key === 'Enter' && entry) pinpoint(entry);
    else if ((key === 'e' || key === 'E') && entry) setEditing(entry.ref);
    else if ((key === 'r' || key === 'R') && entry) recheck(entry);
    else if ((key === 'Backspace' || key === 'Delete' || key === 'x') && entry) removeEntry(entry);
    else if (key === 'o' || key === 'O') cycleOrderSort();
    else if (key === 's' || key === 'S') setSort((current) => (current === 'status' ? 'pasted' : 'status'));
    else if (key === 'Escape') onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const orderActive = sort === 'order-asc' || sort === 'order-desc';
  const OrderIcon = sort === 'order-asc' ? ArrowUp : sort === 'order-desc' ? ArrowDown : ArrowUpDown;

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="right-start"
      gap={8}
      closeOnEscape={false}
      data-nav-bulk-popout
      className="flex max-h-[min(34rem,calc(100vh-4rem))] w-[26rem] flex-col rounded-sm bg-surface-canvas font-spine"
    >
      {/* Sort bar — the Find well's height, so the two read as one line. */}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border-hairline px-1.5">
        <span className="min-w-0 flex-1 truncate text-role-caption font-semibold tabular-nums text-text-default">
          {filterLabel ? `${visible.length} ${filterLabel.toLowerCase()}` : `${list.entries.length} pasted`}
          {list.selection.truncated > 0 ? (
            <span className="font-normal text-text-faint"> · first {list.selection.refs.length}</span>
          ) : null}
          {checking > 0 ? <span className="font-normal text-text-faint"> · {checking} checking</span> : null}
        </span>
        <SortChip active={sort === 'pasted'} onClick={() => setSort('pasted')} label="Pasted" />
        <SortChip
          active={orderActive}
          onClick={cycleOrderSort}
          label="Order ID"
          keycap="O"
          icon={<OrderIcon aria-hidden className="size-3" />}
        />
        <SortChip active={sort === 'status'} onClick={() => setSort(sort === 'status' ? 'pasted' : 'status')} label="Status" keycap="S" />
        <button
          type="button"
          aria-label="Copy the numbers shown"
          title="Copy the numbers shown (⌘⌥C / Ctrl+Alt+C)"
          onClick={copyShown}
          className={ICON_KEY_CLASS}
        >
          <Copy aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Clear the pasted list"
          title="Clear the pasted list"
          onClick={() => {
            list.clear();
            onClose();
          }}
          className={ICON_KEY_CLASS}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>

      {/* Bucket filter — where the pasted numbers live, with how many each holds. */}
      {list.buckets.length > 0 ? (
        <div data-bulk-buckets className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border-hairline px-1.5 py-1">
          <SortChip active={list.status === null} onClick={() => list.setStatus(null)} label={`All ${list.entries.length}`} />
          {list.buckets
            .filter((bucket) => bucket.count > 0 || bucket.id === list.status)
            .map((bucket) => {
              const Glyph = TONE_ICON[bucket.tone];
              return (
                <SortChip
                  key={bucket.id}
                  active={list.status === bucket.id}
                  onClick={() => list.setStatus(list.status === bucket.id ? null : bucket.id)}
                  label={`${bucket.label} ${bucket.count}`}
                  lead={
                    <span aria-hidden className="inline-flex" style={{ color: NAV_LOCATE_TONE_VAR[bucket.tone] }}>
                      <Glyph className="size-3" />
                    </span>
                  }
                />
              );
            })}
          {nowhere > 0 ? (
            <span className="inline-flex h-6 items-center gap-1 px-1.5 text-role-micro font-semibold" style={{ color: NAV_LOCATE_TONE_VAR.danger }}>
              <AlertCircle aria-hidden className="size-3" />
              Not found {nowhere}
            </span>
          ) : null}
        </div>
      ) : null}

      {list.error ? (
        <div className="flex items-center gap-2 border-b border-border-hairline px-2 py-1.5 text-role-caption text-text-danger">
          <span className="min-w-0 flex-1 truncate">{list.error}</span>
          <button type="button" onClick={list.refetch} className={cn(ICON_KEY_CLASS, 'w-auto px-1.5 text-text-danger')}>
            Retry
          </button>
        </div>
      ) : null}

      <div
        ref={attachList}
        role="listbox"
        tabIndex={0}
        aria-label="Pasted numbers"
        aria-activedescendant={visible[safeCursor] ? `bulk-${safeCursor}` : undefined}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 outline-none"
      >
        {visible.length === 0 ? (
          <p className="px-3 py-2 text-role-caption text-text-faint">
            {list.loading ? 'Checking…' : 'No pasted numbers in this bucket.'}
          </p>
        ) : (
          visible.map((entry, index) => (
            <BulkRow
              key={entry.ref}
              entry={entry}
              buckets={rowBuckets(entry)}
              index={index}
              lit={index === safeCursor}
              pinned={find === entry.ref}
              editing={editing === entry.ref}
              onPoint={() => setCursor(index)}
              onOpen={() => pinpoint(entry)}
              onEdit={() => setEditing(entry.ref)}
              onCommitEdit={(text) => {
                setEditing(null);
                if (text.trim() && text.trim() !== entry.ref) list.replaceRef(entry.ref, text);
                listRef.current?.focus({ preventScroll: true });
              }}
              onCancelEdit={() => {
                setEditing(null);
                listRef.current?.focus({ preventScroll: true });
              }}
              onCopy={() => void copy(entry.ref, entry.ref)}
              onRemove={() => removeEntry(entry)}
              onOpenBucket={(bucket) => openBucket(bucket, entry)}
              onOpenRecord={entry.recordHref ? () => openRecord(entry) : undefined}
            />
          ))
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border-hairline px-2 py-1 text-role-micro text-text-faint">
        <Legend keys={['↑', '↓']} label="move" />
        <Legend keys={['↵']} label="pinpoint" />
        <Legend keys={['E']} label="edit" />
        <Legend keys={['mod', 'C']} label="copy" />
        <Legend keys={['mod', 'alt', 'C']} label="copy shown" />
        <Legend keys={['R']} label="recheck" />
        <Legend keys={['⌫']} label="remove" />
        <Legend keys={['Esc']} label="close" />
      </div>
    </Popover>
  );
}

function SortChip({
  active,
  onClick,
  label,
  keycap,
  icon,
  lead,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  keycap?: string;
  icon?: React.ReactNode;
  lead?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'ds-raw-button inline-flex h-6 shrink-0 items-center gap-1 px-1.5 text-role-micro font-semibold tabular-nums',
        'transition-[background-color,transform,box-shadow] duration-100 active:translate-y-px',
        active
          ? 'bg-surface-card text-text-default shadow-sm ring-1 ring-border-soft'
          : 'text-text-muted hover:bg-surface-card hover:text-text-default',
        SIDEBAR_CHIP_CORNER,
        focusRing('control', 'accent'),
      )}
    >
      {keycap ? <KeyboardKey size="xs">{keycap}</KeyboardKey> : null}
      {lead}
      {label}
      {icon}
    </button>
  );
}

function Legend({ keys, label }: { keys: readonly string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key) => (
        <KeyboardKey key={key} size="xs">
          {key}
        </KeyboardKey>
      ))}
      {label}
    </span>
  );
}

function BulkRow({
  entry,
  buckets,
  index,
  lit,
  pinned,
  editing,
  onPoint,
  onOpen,
  onEdit,
  onCommitEdit,
  onCancelEdit,
  onCopy,
  onRemove,
  onOpenBucket,
  onOpenRecord,
}: {
  entry: BulkEntry;
  buckets: readonly RowBucket[];
  index: number;
  lit: boolean;
  pinned: boolean;
  editing: boolean;
  onPoint: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onCommitEdit: (text: string) => void;
  onCancelEdit: () => void;
  onCopy: () => void;
  onRemove: () => void;
  onOpenBucket: (bucket: NavLocateBucket) => void;
  onOpenRecord: (() => void) | undefined;
}) {
  // The bucket the row reads as: the list on screen when it holds the number, else its first.
  const primary = buckets.find((row) => row.current) ?? buckets[0];
  const others = buckets.filter((row) => row !== primary);
  return (
    <div
      id={`bulk-${index}`}
      role="option"
      aria-selected={lit}
      data-bulk-index={index}
      data-buckets={entry.buckets.join(' ')}
      onPointerEnter={onPoint}
      onClick={editing ? undefined : onOpen}
      className={cn(
        // Pill hover: a capsule inset from the square panel edge.
        'group mx-1 flex h-7 cursor-default select-none items-center gap-2 rounded-full pl-1 pr-1',
        'transition-[background-color,transform,box-shadow] duration-100 ease-out',
        'hover:bg-surface-card hover:shadow-sm hover:ring-1 hover:ring-border-soft',
        'active:translate-y-px active:bg-surface-sunken active:shadow-none',
        lit && 'bg-surface-card shadow-sm ring-1 ring-border-soft',
        pinned && 'ring-2 ring-border-strong',
      )}
    >
      {entry.pending ? (
        <span className="inline-flex h-5 w-[6.5rem] shrink-0 items-center gap-1 px-1.5 text-role-micro text-text-faint">
          <Loader2 aria-hidden className="size-3 shrink-0 animate-spin" />
          Checking…
        </span>
      ) : primary ? (
        <BucketChip row={primary} labelled onOpen={onOpenBucket} />
      ) : (
        <span
          data-bulk-bucket="none"
          className="inline-flex h-5 w-[6.5rem] shrink-0 items-center gap-1 px-1.5 text-role-micro font-semibold"
          style={{ color: NAV_LOCATE_TONE_VAR.danger }}
        >
          <AlertCircle aria-hidden className="size-3 shrink-0" />
          Not found
        </span>
      )}
      {editing ? (
        <input
          autoFocus
          defaultValue={entry.ref}
          aria-label={`Edit ${entry.ref}`}
          spellCheck={false}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') onCommitEdit(event.currentTarget.value);
            else if (event.key === 'Escape') onCancelEdit();
          }}
          onBlur={(event) => onCommitEdit(event.currentTarget.value)}
          className="h-6 min-w-0 flex-1 rounded-sm bg-surface-sunken px-1.5 font-mono text-role-caption text-text-default outline-none ring-1 ring-inset ring-border-strong"
        />
      ) : (
        <>
          {/* The number never yields its width; detail and title share what is left. */}
          <span className="max-w-[10rem] shrink-0 truncate font-mono text-role-caption font-semibold text-text-default">
            {entry.ref}
          </span>
          <span className="flex min-w-0 flex-1 items-baseline gap-2 text-role-micro">
            {entry.detail ? <span className="min-w-0 shrink truncate text-text-muted">{entry.detail}</span> : null}
            {entry.title ? (
              <span className={cn('min-w-0 flex-1 truncate text-text-faint group-hover:hidden', lit && 'hidden')}>
                {entry.title}
              </span>
            ) : null}
          </span>
          {others.map((row) => (
            <BucketChip key={row.bucket.id} row={row} onOpen={onOpenBucket} />
          ))}
          <span className={cn('hidden shrink-0 items-center gap-0.5 group-hover:flex', lit && 'flex')}>
            {onOpenRecord ? (
              <RowAction label={`Open ${entry.title ?? entry.ref}`} onClick={onOpenRecord}>
                <ExternalLink aria-hidden className="size-3" />
              </RowAction>
            ) : null}
            <RowAction label={`Edit ${entry.ref}`} onClick={onEdit}>
              <Pencil aria-hidden className="size-3" />
            </RowAction>
            <RowAction label={`Copy ${entry.ref}`} onClick={onCopy}>
              <Copy aria-hidden className="size-3" />
            </RowAction>
            <RowAction label={`Remove ${entry.ref}`} onClick={onRemove}>
              <X aria-hidden className="size-3" />
            </RowAction>
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Where the number lives: glyph (+ label for the row's own bucket) in the
 * bucket's ink. A bucket that is not the list on screen links to its list,
 * narrowed to the number — how a row points at Exceptions, Shipped, ….
 */
function BucketChip({
  row,
  labelled = false,
  onOpen,
}: {
  row: RowBucket;
  labelled?: boolean;
  onOpen: (bucket: NavLocateBucket) => void;
}) {
  const { bucket, current } = row;
  const Glyph = TONE_ICON[bucket.tone];
  const face = (
    <>
      <Glyph aria-hidden className="size-3 shrink-0" />
      {labelled ? <span className="truncate">{bucket.label}</span> : <span className="sr-only">{bucket.label}</span>}
    </>
  );
  const className = cn(
    'inline-flex h-5 shrink-0 items-center gap-1 text-role-micro font-semibold',
    labelled ? 'w-[6.5rem] px-1.5' : 'size-5 justify-center',
    SIDEBAR_CHIP_CORNER,
  );
  const style = { color: NAV_LOCATE_TONE_VAR[bucket.tone] };
  if (current || !bucket.href) {
    return (
      <span data-bulk-bucket={bucket.id} title={bucket.label} className={className} style={style}>
        {face}
      </span>
    );
  }
  return (
    <button
      type="button"
      tabIndex={-1}
      data-bulk-bucket={bucket.id}
      title={`Open in ${bucket.label}`}
      aria-label={`Open in ${bucket.label}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(bucket);
      }}
      className={cn(
        className,
        'ds-raw-button bg-surface-sunken hover:bg-surface-card hover:shadow-sm hover:ring-1 hover:ring-border-soft active:translate-y-px',
        focusRing('control', 'accent'),
      )}
      style={style}
    >
      {face}
    </button>
  );
}

function RowAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(ICON_KEY_CLASS, 'size-5 rounded-full')}
    >
      {children}
    </button>
  );
}
