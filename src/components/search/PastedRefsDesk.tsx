'use client';

/**
 * `/search?refs=` — one row per pasted identifier. Status is the first fact
 * column; the identifier stays pinned on the same row. Facts scroll sideways.
 * The answer is `GET /api/nav/locate?locator=everywhere`.
 */

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { X } from '@/components/Icons';
import { BulkRow, Legend, type RowBucket } from '@/components/sidebar/contextual/NavBulkPopout';
import { useLocatedList, type BulkEntry } from '@/components/sidebar/contextual/NavBulkList';
import type { NavLocateBucket, NavLocateEntry } from '@/lib/nav/context/schema';
import { parseRefInParam } from '@/lib/receiving/reconcile';
import { compactRefParam, SEARCH_REFS_PARAM } from '@/lib/search/pasted-refs';
import { COPY_HOTKEY, COPY_SHOWN_HOTKEY, hotkeyFires } from '@/lib/keyboard/key-registry';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { copyToClipboard } from '@/utils/_dom';
import { toast } from '@/lib/toast';
import {
  PASTED_REF_PILE_ORDER,
  comparePastedRefs,
  pastedRefPile,
  pastedRefPileLabel,
  type PastedRefPile,
} from '@/lib/search/pasted-ref-piles';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';


function rowBuckets(entry: NavLocateEntry, byId: ReadonlyMap<string, NavLocateBucket>): RowBucket[] {
  return entry.buckets.flatMap((id) => {
    const bucket = byId.get(id);
    return bucket ? [{ bucket, current: false }] : [];
  });
}

export function PastedRefsDesk() {
  const pathname = usePathname() || '/search';
  const router = useRouter();
  const searchParams = useSearchParams();
  const selection = useMemo(() => parseRefInParam(searchParams.get(SEARCH_REFS_PARAM)), [searchParams]);
  const [pile, setPile] = useState<PastedRefPile | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const { query, recheck } = useLocatedList('everywhere', selection.refs);

  const buckets = query.data?.buckets ?? [];
  const byId = useMemo(() => new Map(buckets.map((bucket) => [bucket.id, bucket])), [buckets]);
  const entries = query.data?.entries ?? [];
  const pasteOrder = useMemo(() => new Map(entries.map((entry, index) => [entry.ref, index])), [entries]);
  const ordered = useMemo(
    () => [...entries].sort((a, b) => comparePastedRefs(a, b, pasteOrder)),
    [entries, pasteOrder],
  );
  const visible = pile ? ordered.filter((entry) => pastedRefPile(entry) === pile) : ordered;
  const pileCounts = useMemo(() => {
    const counts = new Map<PastedRefPile, number>();
    for (const entry of entries) {
      const id = pastedRefPile(entry);
      if (id === 'rest') continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [entries]);
  const nowhere = entries.filter((entry) => entry.buckets.length === 0).length;

  const writeRefs = (refs: readonly string[]) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete(SEARCH_REFS_PARAM);
    const base = params.toString();
    const refsPart = refs.length === 0 ? '' : `${SEARCH_REFS_PARAM}=${compactRefParam(refs)}`;
    const next = [base, refsPart].filter(Boolean).join('&');
    window.history.replaceState(null, '', next ? `${pathname}?${next}` : pathname);
    setEditing(null);
  };

  const copyRef = async (ref: string) => {
    if (await copyToClipboard(ref)) toast.success(`Copied ${ref}`);
  };

  const openBucket = (bucket: NavLocateBucket) => {
    if (bucket.href) router.push(bucket.href);
  };

  const safeCursor = Math.min(cursor, Math.max(0, visible.length - 1));

  useEffect(() => {
    document.querySelector(`[data-bulk-index="${safeCursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [safeCursor]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (editing) return;
      if (event.defaultPrevented || isEditableKeyTarget(event.target)) return;
      if (hasOpenOverlay() || document.querySelector('[data-nav-bulk-popout]')) return;
      const entry = visible[Math.min(cursor, Math.max(0, visible.length - 1))];
      const key = event.key;
      if (hotkeyFires(COPY_SHOWN_HOTKEY, event)) {
        void copyToClipboard(visible.map((row) => row.ref).join('\n')).then((ok) => {
          if (ok) toast.success(`Copied ${visible.length} numbers`);
        });
      } else if (hotkeyFires(COPY_HOTKEY, event)) {
        if (!entry) return;
        void copyRef(entry.ref);
      } else if (event.metaKey || event.ctrlKey || event.altKey) return;
      else if (key === 'ArrowDown' || key === 'j') setCursor(Math.min(visible.length - 1, safeCursor + 1));
      else if (key === 'ArrowUp' || key === 'k') setCursor(Math.max(0, safeCursor - 1));
      else if (key === 'Home') setCursor(0);
      else if (key === 'End') setCursor(Math.max(0, visible.length - 1));
      else if (key === 'Enter' && entry) {
        if (entry.recordHref) router.push(entry.recordHref);
        else {
          const bucket = entry.buckets.map((id) => byId.get(id)).find((bucket) => bucket?.href);
          if (bucket?.href) router.push(bucket.href);
        }
      } else if ((key === 'e' || key === 'E') && entry) setEditing(entry.ref);
      else if ((key === 'r' || key === 'R') && entry) {
        recheck(entry.ref);
        toast.message(`Checking ${entry.ref} again`);
      } else if ((key === 'Backspace' || key === 'Delete' || key === 'x') && entry) {
        writeRefs(selection.refs.filter((ref) => ref !== entry.ref));
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-surface-canvas">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border-hairline px-3 py-2">
        <span className="mr-1 text-role-caption font-semibold tabular-nums text-text-default">
          {selection.refs.length} pasted
          {nowhere > 0 ? <span className="font-normal text-text-faint"> · {nowhere} not found</span> : null}
          {selection.truncated > 0 ? (
            <span className="font-normal text-text-faint"> · first {selection.refs.length}</span>
          ) : null}
        </span>
        <FilterChip active={pile === null} onClick={() => setPile(null)} label={`All ${entries.length || selection.refs.length}`} />
        {PASTED_REF_PILE_ORDER.filter((id) => (pileCounts.get(id) ?? 0) > 0 || id === pile).map((id) => (
          <FilterChip
            key={id}
            active={pile === id}
            onClick={() => setPile(pile === id ? null : id)}
            label={`${pastedRefPileLabel(id, buckets, entries)} ${pileCounts.get(id) ?? 0}`}
          />
        ))}
        <button
          type="button"
          onClick={() => writeRefs([])}
          className={cn('ml-auto inline-flex h-6 items-center gap-1 px-1.5 text-role-micro text-text-muted', focusRing('control', 'accent'))}
        >
          <X aria-hidden className="size-3" />
          Clear
        </button>
      </div>

      {query.isError ? (
        <p className="border-b border-border-hairline px-3 py-2 text-role-caption text-text-danger">
          Could not locate this list.{' '}
          <button type="button" onClick={() => void query.refetch()} className="underline">
            Retry
          </button>
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto py-1 outline-none">
        {visible.length === 0 ? (
          <p className="px-3 py-2 text-role-caption text-text-faint">
            {query.isLoading ? 'Checking…' : 'No pasted numbers in this status.'}
          </p>
        ) : (
          visible.map((entry, index) => (
            <BulkRow
              key={entry.ref}
              entry={{ ...entry, pending: Boolean(query.isLoading && !query.data) } satisfies BulkEntry}
              buckets={rowBuckets(entry, byId)}
              wide
              index={index}
              lit={index === safeCursor}
              pinned={false}
              editing={editing === entry.ref}
              onPoint={() => setCursor(index)}
              onOpen={() => {
                if (entry.recordHref) router.push(entry.recordHref);
              }}
              onEdit={() => setEditing(entry.ref)}
              onCommitEdit={(text) => writeRefs(replaceOne(selection.refs, entry.ref, text))}
              onCancelEdit={() => setEditing(null)}
              onCopy={() => void copyRef(entry.ref)}
              onRemove={() => writeRefs(selection.refs.filter((ref) => ref !== entry.ref))}
              onOpenBucket={openBucket}
              onOpenRecord={entry.recordHref ? () => router.push(entry.recordHref as string) : undefined}
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
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-6 items-center rounded-mode-pill px-2 text-role-micro font-semibold tabular-nums',
        active ? 'bg-surface-sunken text-text-default' : 'text-text-muted hover:bg-surface-sunken hover:text-text-default',
        focusRing('control', 'accent'),
      )}
    >
      {label}
    </button>
  );
}

function replaceOne(refs: readonly string[], from: string, text: string): string[] {
  const next = text.trim();
  return refs.flatMap((ref) => (ref === from ? (next && next !== from ? [next] : next ? [next] : []) : [ref]));
}
