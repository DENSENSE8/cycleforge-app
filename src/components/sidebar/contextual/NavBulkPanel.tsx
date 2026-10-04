'use client';

import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref, type RefObject } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
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
  Pencil,
  X,
} from '@/components/Icons';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from '@/design-system/motion';
import { motionDuration, motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { setDeskSearch, useDeskSearch } from '@/lib/outbound/desk-search-store';
import type { NavLocateBucket } from '@/lib/nav/context/schema';
import type { BulkEntry, BulkList } from '@/lib/nav/locate/use-bulk-list';
import { COPY_HOTKEY, COPY_SHOWN_HOTKEY, hotkeyFires } from '@/lib/keyboard/key-registry';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { copyToClipboard } from '@/utils/_dom';
import { toast } from '@/lib/toast';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CHIP_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
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

/** Rows past this one arrive together — a 100-number paste never waits on its tail. */
const CASCADE_ROWS = 14;

/** A tactile square icon key — sinks 1px on press. */
const ICON_KEY_CLASS = cn(
  'grid size-6 shrink-0 place-content-center rounded-sm text-text-muted',
  'transition-[background-color,transform,box-shadow] duration-100',
  'hover:bg-surface-card hover:text-text-default hover:shadow-sm hover:ring-1 hover:ring-border-soft',
  'active:translate-y-px active:bg-surface-sunken active:shadow-none',
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
  onClose,
  onLeave,
  listboxRef,
}: {
  list: BulkList;
  /** The page list's Find; absent (the everywhere face) = the desk store at this path. */
  find?: PageFind;
  /** Close the panel — Esc, or a pinpoint that opens another list. */
  onClose: () => void;
  /** Hand the keys back to the field (↑ past the first row). */
  onLeave: () => void;
  listboxRef: RefObject<HTMLDivElement>;
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
  const pillScope = useId();
  const listboxId = useId();

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

  useEffect(() => {
    listboxRef.current
      ?.querySelector<HTMLElement>(`[data-bulk-index="${safeCursor}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [safeCursor, listboxRef]);
  // The list's keys are never painted in the panel: the controls teach theirs on hover, the `?` sheet lists them all.
  useEffect(() => registerShortcutOverviewGroup(PANEL_KEYS), []);

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
  const refocus = useCallback(() => listboxRef.current?.focus({ preventScroll: true }), [listboxRef]);

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
    else if ((key === 'ArrowUp' || key === 'k') && safeCursor === 0) onLeave();
    else if (key === 'ArrowUp' || key === 'k') setCursor(safeCursor - 1);
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
    <LayoutGroup id={pillScope}>
      <div data-nav-bulk-panel className="flex min-h-0 flex-col font-spine">
        {/* Count + sort — the Find well's height, so the two read as one line. */}
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border-hairline px-1.5">
          <span className="flex min-w-0 flex-1 items-baseline gap-1 truncate text-role-caption font-semibold text-text-default">
            <AnimatedStat value={filterLabel ? visible.length : list.entries.length} />
            <span className="truncate">{filterLabel ? filterLabel.toLowerCase() : 'pasted'}</span>
            {list.selection.truncated > 0 ? (
              <span className="font-normal text-text-faint">· first {list.selection.refs.length}</span>
            ) : null}
            {checking > 0 ? (
              <span className="inline-flex items-baseline gap-1 font-normal text-text-faint">
                · <AnimatedStat value={checking} /> checking
              </span>
            ) : null}
          </span>
          <PillChip pill="sort" active={sort === 'pasted'} onClick={() => setSort('pasted')} label="Pasted" tooltip="Sort as pasted" />
          <PillChip
            pill="sort"
            active={orderActive}
            onClick={cycleOrderSort}
            label="Order ID"
            tooltip="Sort by order ID"
            shortcut="O"
            trail={<OrderIcon aria-hidden className="size-3" />}
          />
          <PillChip
            pill="sort"
            active={sort === 'status'}
            onClick={() => setSort(sort === 'status' ? 'pasted' : 'status')}
            label="Status"
            tooltip="Sort by status"
            shortcut="S"
          />
          <HoverTooltip label="Copy the numbers shown" shortcut="Mod + Alt + C" asChild>
            <IconButton
              ariaLabel="Copy the numbers shown"
              onClick={copyShown}
              className={ICON_KEY_CLASS}
              icon={<Copy aria-hidden className="size-3.5" />}
            />
          </HoverTooltip>
        </div>

        {/* Status chips — where the pasted numbers live, with how many each holds. */}
        {list.buckets.length > 0 ? (
          <div data-bulk-buckets className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border-hairline px-1.5 py-1">
            <PillChip pill="bucket" active={list.status === null} onClick={() => list.setStatus(null)} label="All" count={list.entries.length} />
            {list.buckets
              .filter((bucket) => bucket.count > 0 || bucket.id === list.status)
              .map((bucket) => {
                const Glyph = TONE_ICON[bucket.tone];
                return (
                  <PillChip
                    key={bucket.id}
                    pill="bucket"
                    active={list.status === bucket.id}
                    onClick={() => list.setStatus(list.status === bucket.id ? null : bucket.id)}
                    label={bucket.label}
                    count={bucket.count}
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
                Not found
                <AnimatedStat value={nowhere} />
              </span>
            ) : null}
          </div>
        ) : null}

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
            {visible.map((entry, index) => (
              <BulkRow
                key={entry.ref}
                id={`${listboxId}-${index}`}
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
                  refocus();
                }}
                onCancelEdit={() => {
                  setEditing(null);
                  refocus();
                }}
                onCopy={() => void copy(entry.ref, entry.ref)}
                onRemove={() => removeEntry(entry)}
                onOpenBucket={(bucket) => openBucket(bucket, entry)}
                onOpenRecord={entry.recordHref ? () => openRecord(entry) : undefined}
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

/**
 * A sort or status chip. Its pressed face is ONE pill per group (`pill`, a
 * `layoutId`) that glides from the chip it leaves to the chip pressed
 * (`motionTransition.findListGlide`, ease-in-out); a count ticks with
 * AnimatedStat.
 */
function PillChip({
  pill,
  active,
  onClick,
  label,
  count,
  tooltip,
  shortcut,
  lead,
  trail,
}: {
  pill: string;
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  tooltip?: string;
  /** The chip's key — taught in its hover tooltip, never painted on the chip. */
  shortcut?: string;
  lead?: ReactNode;
  trail?: ReactNode;
}) {
  const glide = useMotionTransition(motionTransition.findListGlide);
  return (
    <HoverTooltip label={tooltip ?? label} shortcut={shortcut} disabled={!shortcut} asChild>
      {/* ds-raw-button: the pressed face is a gliding layoutId pill child, which Button's fixed face cannot host. */}
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          'ds-raw-button relative isolate inline-flex h-6 shrink-0 items-center gap-1 px-1.5 text-role-micro font-semibold tabular-nums',
          'transition-[color,transform] duration-100 active:translate-y-px',
          active ? 'text-text-default' : 'text-text-muted hover:text-text-default',
          SIDEBAR_CHIP_CORNER,
          focusRing('control', 'accent'),
        )}
      >
        {active ? (
          <motion.span
            aria-hidden
            layoutId={pill}
            transition={glide}
            className={cn('absolute inset-0 -z-10 bg-surface-card shadow-sm ring-1 ring-border-soft', SIDEBAR_CHIP_CORNER)}
          />
        ) : null}
        {lead}
        {label}
        {count !== undefined ? <AnimatedStat value={count} /> : null}
        {trail}
      </button>
    </HoverTooltip>
  );
}

/** Labelled status face — wide enough that "Receiving · Received" is not cut. */
const STATUS_WIDTH = 'w-[6.5rem]';

function BulkRow({
  ref,
  id,
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
  /** AnimatePresence `popLayout` measures the leaving row through it. */
  ref?: Ref<HTMLDivElement>;
  id: string;
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
  const presence = useMotionPresence(motionPresence.findListRow);
  const settle = useMotionTransition(motionTransition.findListRow);
  const glide = useMotionTransition(motionTransition.findListGlide);
  const reduce = useReducedMotion();
  const delay = reduce ? 0 : Math.min(index, CASCADE_ROWS) * motionDuration.findListRowStagger;
  // The bucket the row reads as: the list on screen when it holds the number, else its first.
  const primary = buckets.find((row) => row.current) ?? buckets[0];
  const others = buckets.filter((row) => row !== primary);
  return (
    <motion.div
      ref={ref}
      id={id}
      role="option"
      aria-selected={lit}
      data-bulk-index={index}
      data-buckets={entry.buckets.join(' ')}
      layout="position"
      initial={presence.initial}
      animate={presence.animate}
      exit={{ ...presence.exit, transition: settle }}
      transition={{ ...settle, delay, layout: glide }}
      onPointerEnter={onPoint}
      onClick={editing ? undefined : onOpen}
      className={cn(
        'group mx-1 flex h-7 cursor-default select-none items-center gap-2 rounded-full pl-1 pr-1',
        'transition-[background-color,box-shadow] duration-100 ease-out',
        'hover:bg-surface-sunken hover:shadow-sm hover:ring-1 hover:ring-border-soft',
        lit && 'bg-surface-sunken shadow-sm ring-1 ring-border-soft',
        pinned && 'ring-2 ring-border-strong',
      )}
    >
      <RowVerdict entry={entry} primary={primary} onOpenBucket={onOpenBucket} />
      {editing ? (
        // ds-raw-button: an inline retype inside a listbox option — commits on Enter / blur and must keep its keys from the listbox.
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
          <span title={entry.ref} className="shrink-0 whitespace-nowrap font-mono text-role-caption font-semibold text-text-default">
            {entry.ref}
          </span>
          <span className="flex min-w-0 flex-1 items-baseline gap-2 text-role-micro">
            {entry.detail ? <span title={entry.detail} className="min-w-0 shrink truncate text-text-muted">{entry.detail}</span> : null}
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
            <RowAction label={`Edit ${entry.ref}`} shortcut="E" onClick={onEdit}>
              <Pencil aria-hidden className="size-3" />
            </RowAction>
            <RowAction label={`Copy ${entry.ref}`} shortcut="Mod + C" onClick={onCopy}>
              <Copy aria-hidden className="size-3" />
            </RowAction>
            <RowAction label={`Remove ${entry.ref}`} shortcut="⌫" onClick={onRemove}>
              <X aria-hidden className="size-3" />
            </RowAction>
          </span>
        </>
      )}
    </motion.div>
  );
}

/**
 * The row's verdict cell: while the locator is asked it breathes "Checking…"
 * (an opacity mirror loop); the answer crossfades in over it — the bucket it
 * lives in, or "Not found". Both faces share one grid cell, so the swap
 * never moves the number beside it.
 */
function RowVerdict({
  entry,
  primary,
  onOpenBucket,
}: {
  entry: BulkEntry;
  primary: RowBucket | undefined;
  onOpenBucket: (bucket: NavLocateBucket) => void;
}) {
  const swap = useMotionPresence(motionPresence.findListVerdict);
  const swapTransition = useMotionTransition(motionTransition.findListVerdict);
  const breath = useMotionPresence(motionPresence.findListPending);
  const breathTransition = useMotionTransition(motionTransition.findListPending);
  const face = entry.pending ? 'pending' : primary ? `bucket:${primary.bucket.id}` : 'none';
  return (
    <span className={cn('grid shrink-0', STATUS_WIDTH)}>
      <AnimatePresence initial={false}>
        <motion.span
          key={face}
          initial={swap.initial}
          animate={swap.animate}
          exit={swap.exit}
          transition={swapTransition}
          className="col-start-1 row-start-1 flex min-w-0"
        >
          {entry.pending ? (
            <motion.span
              initial={breath.initial}
              animate={breath.animate}
              transition={breathTransition}
              className="inline-flex h-5 items-center gap-1 px-1.5 text-role-micro text-text-faint"
            >
              <CircleDot aria-hidden className="size-3 shrink-0" />
              Checking…
            </motion.span>
          ) : primary ? (
            <BucketChip row={primary} labelled onOpen={onOpenBucket} />
          ) : (
            <span
              data-bulk-bucket="none"
              className="inline-flex h-5 min-w-0 items-center gap-1 px-1.5 text-role-micro font-semibold"
              style={{ color: NAV_LOCATE_TONE_VAR.danger }}
            >
              <AlertCircle aria-hidden className="size-3 shrink-0" />
              Not found
            </span>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
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
    labelled ? cn(STATUS_WIDTH, 'px-1.5') : 'size-5 justify-center',
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
    // ds-raw-button: a link chip inside a listbox option — out of the tab order, and its press must not pinpoint the row.
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

function RowAction({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  /** The verb's key — taught in the hover tooltip, never painted on the row. */
  shortcut?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <HoverTooltip label={label} shortcut={shortcut} focusable={false} asChild>
      <IconButton
        tabIndex={-1}
        ariaLabel={label}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        className={cn(ICON_KEY_CLASS, 'size-5 rounded-full')}
        icon={children}
      />
    </HoverTooltip>
  );
}
