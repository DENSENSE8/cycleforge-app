'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { NavLocateBucket, NavLocateEntry, NavLocateResponse, NavLocateScope, NavSearch } from '@/lib/nav/context/schema';
import { KeyboardKey } from '@/design-system/primitives';
import { ChevronRight, Loader2 } from '@/components/Icons';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { parseRefInParam, parseRefList, serializeRefIn, type RefSelection } from '@/lib/receiving/reconcile';
import { toast } from '@/lib/toast';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { NavBulkPopout } from './NavBulkPopout';
import { useNavLocate } from './useNavLocate';
import { useReplaceSearchParams } from './useReplaceSearchParams';

type NavLocate = NonNullable<NavSearch['locate']>;

/** Bare `B` toggles the pasted list, never while typing. */
const BULK_KEY = 'b';

/** One pasted number: the locator's answer, or a placeholder while it is asked. */
export interface BulkEntry extends NavLocateEntry {
  /** Not answered yet — the locator is still being asked. */
  pending: boolean;
}

/** The pasted list, where each number lives, and the verbs over it. */
export interface BulkList {
  scope: NavLocateScope;
  selection: RefSelection;
  response: NavLocateResponse | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** One per pasted number, in paste order. */
  entries: BulkEntry[];
  /** The locator's buckets, in its order — counts are pasted numbers found in each. */
  buckets: NavLocateBucket[];
  /** The bucket filter (a bucket id), or null for every number. */
  status: string | null;
  setStatus: (status: string | null) => void;
  /** A paste of 2+ numbers → the list. False for a single number (it stays a Find). */
  paste: (text: string) => boolean;
  remove: (ref: string) => void;
  /** Replace one number with whatever was typed (a comma list expands in place). */
  replaceRef: (ref: string, text: string) => void;
  clear: () => void;
}

/**
 * The list from its refs + filter, however they are stored. `writeRefs`
 * persists the next refs (an empty list also drops the filter).
 */
function useBulkList(
  scope: NavLocateScope,
  selection: RefSelection,
  rawStatus: string | null,
  writeRefs: (refs: readonly string[]) => void,
  setStatus: (status: string | null) => void,
): BulkList {
  const locate = useNavLocate(scope, { refs: selection.refs });
  const response = locate.data;
  const buckets = useMemo(() => response?.buckets ?? [], [response]);
  const entries = useMemo(() => {
    const answered = new Map((response?.entries ?? []).map((entry) => [entry.ref, entry]));
    return selection.refs.map((ref): BulkEntry => {
      const hit = answered.get(ref);
      return hit
        ? { ...hit, pending: false }
        : { ref, buckets: [], title: null, detail: null, recordHref: null, pending: true };
    });
  }, [response, selection.refs]);
  // A filter naming no bucket this locator declares filters nothing.
  const status = rawStatus && buckets.some((bucket) => bucket.id === rawStatus) ? rawStatus : null;

  return {
    scope,
    selection,
    response,
    loading: locate.isFetching,
    error: locate.error ? locate.error.message || 'Could not locate the pasted numbers' : null,
    refetch: () => void locate.refetch(),
    entries,
    buckets,
    status,
    setStatus,
    paste: (text: string): boolean => {
      const next = parseRefList(text);
      if (next.refs.length < 2) return false;
      writeRefs(next.refs);
      if (next.truncated > 0) toast.message(`Checking the first ${next.refs.length} — ${next.truncated} more were dropped`);
      return true;
    },
    remove: (ref: string) => writeRefs(selection.refs.filter((r) => r !== ref)),
    replaceRef: (ref: string, text: string) => {
      const typed = parseRefList(text).refs;
      const at = selection.refs.indexOf(ref);
      if (at < 0) return;
      const next = [...selection.refs.slice(0, at), ...typed, ...selection.refs.slice(at + 1)];
      writeRefs(parseRefList(next.join('\n')).refs);
    },
    clear: () => writeRefs([]),
  };
}

/**
 * A page's pasted list, in its URL (`locate.param` = the operator's strings,
 * `locate.statusParam` = one bucket). Every reader — the Find toggle, the
 * popout, the page's own list — reads the same URL.
 */
export function useNavBulkList(locate: NavLocate): BulkList {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const raw = searchParams?.get(locate.param) ?? null;
  const selection = useMemo(() => parseRefInParam(raw), [raw]);
  const rawStatus = searchParams?.get(locate.statusParam)?.trim() || null;

  const writeRefs = useCallback(
    (refs: readonly string[]) =>
      replace((params) => {
        params.delete('page');
        if (refs.length === 0) {
          params.delete(locate.param);
          params.delete(locate.statusParam);
        } else {
          params.set(locate.param, serializeRefIn(refs));
        }
      }),
    [locate.param, locate.statusParam, replace],
  );
  const setStatus = useCallback(
    (status: string | null) =>
      replace((params) => {
        params.delete('page');
        if (status) params.set(locate.statusParam, status);
        else params.delete(locate.statusParam);
      }),
    [locate.statusParam, replace],
  );

  return useBulkList(locate.locator, selection, rawStatus, writeRefs, setStatus);
}

/** The same list held in component state — the everywhere face has no page list and no URL. */
export function useLocalBulkList(scope: NavLocateScope): BulkList {
  const [selection, setSelection] = useState<RefSelection>(() => parseRefInParam(null));
  const [status, setStatus] = useState<string | null>(null);
  const writeRefs = useCallback((refs: readonly string[]) => {
    setSelection(parseRefInParam(serializeRefIn(refs)));
    if (refs.length === 0) setStatus(null);
  }, []);
  return useBulkList(scope, selection, status, writeRefs, setStatus);
}

/**
 * The arrow key right of Find: `[›] [B] 40`. Appears once a list is pasted;
 * opens the list to the right of the sidebar, over the ledger's edge.
 */
export function NavBulkToggle({
  list,
  anchorRef,
  open,
  onOpenChange,
}: {
  list: BulkList;
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const count = list.selection.refs.length;
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (count === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== BULK_KEY || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.defaultPrevented || isEditableKeyTarget(event.target)) return;
      event.preventDefault();
      onOpenChange(!open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [count, open, onOpenChange]);

  if (count === 0) return null;
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-nav-bulk-toggle
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-keyshortcuts="B"
        aria-label={`${count} pasted numbers — ${open ? 'close' : 'open'} the list`}
        onClick={() => onOpenChange(!open)}
        className={cn(
          'ds-raw-button flex h-8 shrink-0 items-center gap-1 px-1.5 text-role-caption font-semibold tabular-nums',
          'bg-surface-card shadow-sm ring-1 ring-inset ring-border-soft',
          'transition-[box-shadow,transform,background-color] duration-100',
          'hover:ring-border-strong active:translate-y-px active:bg-surface-sunken active:shadow-none',
          open && 'bg-surface-sunken shadow-none ring-border-strong',
          SIDEBAR_CONTROL_CORNER,
          focusRing('control', 'accent'),
        )}
      >
        <ChevronRight aria-hidden className={cn('size-3.5 text-text-muted transition-transform', open && 'rotate-180')} />
        <KeyboardKey size="xs">B</KeyboardKey>
        <span>{count}</span>
        {list.loading ? <Loader2 aria-hidden className="size-3 animate-spin text-text-faint" /> : null}
      </button>
      <NavBulkPopout
        list={list}
        anchorRef={anchorRef}
        open={open}
        onClose={() => {
          onOpenChange(false);
          buttonRef.current?.focus({ preventScroll: true });
        }}
      />
    </>
  );
}
