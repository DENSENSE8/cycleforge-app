'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { KeyboardKey, Popover } from '@/design-system/primitives';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock,
  Copy,
  Loader2,
  PackageCheck,
  Pencil,
  X,
} from '@/components/Icons';
import { useDeskSearch } from '@/lib/outbound/desk-search-store';
import { RECON_STATUS_LABELS, type ReconEntry, type ReconStatus } from '@/lib/receiving/reconcile';
import { applyInboundLane } from '@/lib/receiving/inbound-lane';
import { copyToClipboard } from '@/utils/_dom';
import { toast } from '@/lib/toast';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CHIP_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { BulkList } from './NavBulkList';

/** Each status's glyph and ink — the verdict reads before its word. */
const STATUS_FACE: Readonly<Record<ReconStatus, { icon: typeof PackageCheck; tone: string }>> = {
  received: { icon: PackageCheck, tone: 'text-emerald-600' },
  not_received: { icon: Clock, tone: 'text-amber-600' },
};

/** Worst first: what needs a person leads a status sort, then what is owed. */
const statusRank = (entry: ReconEntry): number => (entry.exception ? 0 : entry.status === 'not_received' ? 1 : 2);

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


function sortEntries(entries: readonly ReconEntry[], mode: SortMode): ReconEntry[] {
  if (mode === 'pasted') return [...entries];
  if (mode === 'status') {
    return [...entries].sort((a, b) => statusRank(a) - statusRank(b));
  }
  const dir = mode === 'order-asc' ? 1 : -1;
  return [...entries].sort((a, b) => dir * ORDER_COLLATOR.compare(a.poNumber ?? a.ref, b.poNumber ?? b.ref));
}

/**
 * The pasted list — one row per number: verdict glyph, the number as pasted,
 * why (Delivered · not scanned), the PO. It follows the status filter, so
 * "Not received" isolates exactly the numbers to chase. Enter pinpoints a
 * number in the ledger (Find narrows to it); E edit · C copy · ⌫ remove.
 */
export function NavBulkPopout({
  list,
  anchorRef,
  open,
  onClose,
}: {
  list: BulkList;
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname() || '/';
  const [find, setFind] = useDeskSearch(pathname);
  const router = useRouter();
  const searchParams = useSearchParams();
  // The badge's link: the Exceptions view, narrowed to this number by Find.
  // A push, so Back returns to the pasted list.
  const openInExceptions = (entry: ReconEntry) => {
    const next = applyInboundLane(new URLSearchParams(searchParams?.toString() ?? ''), 'exceptions');
    setFind(entry.ref);
    onClose();
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const [sort, setSort] = useState<SortMode>('pasted');
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(() => {
    const kept = list.status ? list.entries.filter((entry) => entry.status === list.status) : list.entries;
    return sortEntries(kept, sort);
  }, [list.entries, list.status, sort]);
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
  const pinpoint = (entry: ReconEntry) => setFind(find === entry.ref ? '' : entry.ref);
  // A pinpointed number that leaves the list must not keep narrowing the ledger to nothing.
  const removeEntry = (entry: ReconEntry) => {
    if (find === entry.ref) setFind('');
    list.remove(entry.ref);
  };
  const cycleOrderSort = () =>
    setSort((current) => (current === 'order-asc' ? 'order-desc' : current === 'order-desc' ? 'pasted' : 'order-asc'));

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editing || event.metaKey || event.ctrlKey || event.altKey) return;
    const entry = visible[safeCursor];
    const key = event.key;
    if (key === 'ArrowDown' || key === 'j') setCursor(Math.min(visible.length - 1, safeCursor + 1));
    else if (key === 'ArrowUp' || key === 'k') setCursor(Math.max(0, safeCursor - 1));
    else if (key === 'Home') setCursor(0);
    else if (key === 'End') setCursor(Math.max(0, visible.length - 1));
    else if (key === 'Enter' && entry) pinpoint(entry);
    else if ((key === 'e' || key === 'E') && entry) setEditing(entry.ref);
    else if ((key === 'c' || key === 'C') && entry) void copy(entry.ref, entry.ref);
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
          {list.status ? `${visible.length} ${RECON_STATUS_LABELS[list.status].toLowerCase()}` : `${list.entries.length} pasted`}
          {list.selection.truncated > 0 ? (
            <span className="font-normal text-text-faint"> · first {list.selection.refs.length}</span>
          ) : null}
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
          title="Copy the numbers shown"
          onClick={() => void copy(visible.map((e) => e.ref).join('\n'), `${visible.length} numbers`)}
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

      {list.error ? (
        <div className="flex items-center gap-2 border-b border-border-hairline px-2 py-1.5 text-role-caption text-rose-700">
          <span className="min-w-0 flex-1 truncate">{list.error}</span>
          <button type="button" onClick={list.refetch} className={cn(ICON_KEY_CLASS, 'w-auto px-1.5 text-rose-700')}>
            Retry
          </button>
        </div>
      ) : null}

      <div
        ref={attachList}
        role="listbox"
        tabIndex={0}
        aria-label="Pasted numbers"
        aria-activedescendant={visible[safeCursor] ? `bulk-${visible[safeCursor].key}` : undefined}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 outline-none"
      >
        {visible.length === 0 ? (
          <p className="px-3 py-2 text-role-caption text-text-faint">
            {list.loading ? 'Checking…' : 'No pasted numbers in this status.'}
          </p>
        ) : (
          visible.map((entry, index) => (
            <BulkRow
              key={entry.key}
              entry={entry}
              index={index}
              lit={index === safeCursor}
              pinned={find === entry.ref}
              checking={list.loading}
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
              onOpenException={() => openInExceptions(entry)}
            />
          ))
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border-hairline px-2 py-1 text-role-micro text-text-faint">
        <Legend keys={['↑', '↓']} label="move" />
        <Legend keys={['↵']} label="pinpoint" />
        <Legend keys={['E']} label="edit" />
        <Legend keys={['C']} label="copy" />
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
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  keycap?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'ds-raw-button inline-flex h-6 shrink-0 items-center gap-1 px-1.5 text-role-micro font-semibold',
        'transition-[background-color,transform,box-shadow] duration-100 active:translate-y-px',
        active
          ? 'bg-surface-card text-text-default shadow-sm ring-1 ring-border-soft'
          : 'text-text-muted hover:bg-surface-card hover:text-text-default',
        SIDEBAR_CHIP_CORNER,
        focusRing('control', 'accent'),
      )}
    >
      {keycap ? <KeyboardKey size="xs">{keycap}</KeyboardKey> : null}
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
  index,
  lit,
  pinned,
  checking,
  editing,
  onPoint,
  onOpen,
  onEdit,
  onCommitEdit,
  onCancelEdit,
  onCopy,
  onRemove,
  onOpenException,
}: {
  entry: ReconEntry;
  index: number;
  lit: boolean;
  pinned: boolean;
  checking: boolean;
  editing: boolean;
  onPoint: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onCommitEdit: (text: string) => void;
  onCancelEdit: () => void;
  onCopy: () => void;
  onRemove: () => void;
  onOpenException: () => void;
}) {
  const face = STATUS_FACE[entry.status];
  const Icon = face.icon;
  const answered = !(checking && entry.detail === 'Checking…');
  return (
    <div
      id={`bulk-${entry.key}`}
      role="option"
      aria-selected={lit}
      data-bulk-index={index}
      data-status={entry.status}
      onPointerEnter={onPoint}
      onClick={editing ? undefined : onOpen}
      className={cn(
        // Pill hover: a capsule inset from the square panel edge.
        'group mx-1 flex h-7 cursor-default select-none items-center gap-2 rounded-full pl-2 pr-1',
        'transition-[background-color,transform,box-shadow] duration-100 ease-out',
        'hover:bg-surface-card hover:shadow-sm hover:ring-1 hover:ring-border-soft',
        'active:translate-y-px active:bg-surface-sunken active:shadow-none',
        lit && 'bg-surface-card shadow-sm ring-1 ring-border-soft',
        pinned && 'ring-2 ring-border-strong',
      )}
    >
      {answered ? (
        <Icon aria-hidden className={cn('size-3.5 shrink-0', face.tone)} />
      ) : (
        <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin text-text-faint" />
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
          <span className="min-w-0 flex-1 truncate font-mono text-role-caption font-semibold text-text-default">
            {entry.ref}
          </span>
          <span className={cn('max-w-[9rem] shrink-0 truncate text-role-micro', answered ? face.tone : 'text-text-faint')}>
            {entry.detail}
          </span>
          {entry.exception ? <ExceptionBadge exception={entry.exception} onOpen={onOpenException} /> : null}
          {entry.poNumber && entry.poNumber !== entry.ref ? (
            <span className="max-w-[5.5rem] shrink-0 truncate font-mono text-role-micro text-text-faint group-hover:hidden">
              {entry.poNumber}
            </span>
          ) : null}
          <span className={cn('hidden shrink-0 items-center gap-0.5 group-hover:flex', lit && 'flex')}>
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
 * The number needs a person. Linked when its lines sit in the Exceptions view;
 * otherwise (nothing anywhere names it) a marker with the reason.
 */
function ExceptionBadge({
  exception,
  onOpen,
}: {
  exception: NonNullable<ReconEntry['exception']>;
  onOpen: () => void;
}) {
  const face = (
    <>
      <AlertTriangle aria-hidden className="size-3" />
      <span className="sr-only">{exception.reason}</span>
    </>
  );
  const className = 'grid size-5 shrink-0 place-content-center rounded-full bg-rose-50 text-rose-600';
  if (!exception.inView) {
    return (
      <span data-bulk-exception title={exception.reason} className={className}>
        {face}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-bulk-exception
      title={`${exception.reason} — open in Exceptions`}
      aria-label={`${exception.reason} — open in Exceptions`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className={cn(className, 'ds-raw-button hover:bg-rose-100 active:translate-y-px', focusRing('control', 'accent'))}
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
