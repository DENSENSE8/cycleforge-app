'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NavLocateBucket, NavLocateEntry, NavLocateResponse, NavLocateScope, NavSearch } from '@/lib/nav/context/schema';
import { fetchNavLocate } from '@/lib/nav/context/http-client';
import { Button, KeyboardKey, Popover } from '@/design-system/primitives';
import { ChevronRight, ClipboardList, Loader2 } from '@/components/Icons';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { parseRefInParam, parseRefList, serializeRefIn, type RefSelection } from '@/lib/receiving/reconcile';
import { CHECK_ZOHO_RECEIVED_MAX_INPUTS } from '@/lib/receiving/tracking-paste';
import { toast } from '@/lib/toast';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { NavBulkPopout } from './NavBulkPopout';
import type { PageFind } from './NavFind';
import { useNavStaffKey } from './useNavContext';
import { useReplaceSearchParams } from './useReplaceSearchParams';

type NavLocate = NonNullable<NavSearch['locate']>;

/** Bare `B` toggles the pasted list (or, with none, the paste box), never while typing. */
const BULK_KEY = 'b';

/** The tactile key right of Find — the list toggle and the paste key wear it alike. */
const BULK_KEY_CLASS = cn(
  'ds-raw-button flex h-8 shrink-0 items-center gap-1 px-1.5 text-role-caption font-semibold tabular-nums',
  'bg-surface-card shadow-sm ring-1 ring-inset ring-border-soft',
  'transition-[box-shadow,transform,background-color] duration-100',
  'hover:ring-border-strong active:translate-y-px active:bg-surface-sunken active:shadow-none',
  SIDEBAR_CONTROL_CORNER,
  focusRing('control', 'accent'),
);
const BULK_KEY_OPEN_CLASS = 'bg-surface-sunken shadow-none ring-border-strong';

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
  /** The facet filter inside {@link status} (an entry's `facet.id`), or null. */
  facet: string | null;
  /** A paste of 2+ numbers → the list. False for a single number (it stays a Find). */
  paste: (text: string) => boolean;
  remove: (ref: string) => void;
  /** Replace one number with whatever was typed (a comma list expands in place). */
  replaceRef: (ref: string, text: string) => void;
  /** Ask the locator again for one number alone; the rest keep their answers. */
  recheck: (ref: string) => void;
  clear: () => void;
}

/** Bucket counts are the pasted numbers in each — recounted after answers merge. */
function recount(buckets: readonly NavLocateBucket[], entries: readonly NavLocateEntry[]): NavLocateBucket[] {
  return buckets.map((bucket) => ({ ...bucket, count: entries.filter((entry) => entry.buckets.includes(bucket.id)).length }));
}

/** What one located list last answered — reused when the list is edited, not when it is refreshed. */
interface LocatedMemo {
  scope: NavLocateScope;
  refsKey: string;
  buckets: NavLocateBucket[];
  entries: Map<string, NavLocateEntry>;
  /** Set by a recheck: the next ask reuses every other answer. */
  partial: boolean;
}

/**
 * `GET /api/nav/locate` for a pasted list. An edit (remove, replace) or a
 * recheck asks only the numbers without an answer in hand; a refresh of the
 * same list asks them all.
 */
function useLocatedList(scope: NavLocateScope, refs: readonly string[]) {
  const staffKey = useNavStaffKey();
  const queryClient = useQueryClient();
  const known = useRef<LocatedMemo | null>(null);
  const refsKey = refs.join(',');
  const queryKey = useMemo(() => ['nav-locate-list', staffKey, scope, refsKey] as const, [staffKey, scope, refsKey]);

  const query = useQuery({
    queryKey,
    enabled: refs.length > 0,
    // A list is re-asked when edited, rechecked or retried — not per focus.
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }): Promise<NavLocateResponse> => {
      const last = known.current;
      const memo = last && last.scope === scope && (last.refsKey !== refsKey || last.partial) ? last : null;
      const answers = new Map<string, NavLocateEntry>();
      for (const ref of refs) {
        const hit = memo?.entries.get(ref);
        if (hit) answers.set(ref, hit);
      }
      let buckets = memo?.buckets ?? [];
      let truncated = 0;
      const ask = refs.filter((ref) => !answers.has(ref));
      if (ask.length > 0) {
        const answer = await fetchNavLocate(scope, { refs: ask }, signal);
        buckets = answer.buckets;
        truncated = answer.truncated;
        for (const entry of answer.entries) answers.set(entry.ref, entry);
      }
      known.current = { scope, refsKey, buckets, entries: new Map(answers), partial: false };
      const entries = refs.flatMap((ref) => answers.get(ref) ?? []);
      return { locator: scope, buckets: recount(buckets, entries), entries, truncated };
    },
  });

  const recheck = useCallback(
    (ref: string) => {
      const memo = known.current;
      if (memo) {
        memo.entries.delete(ref);
        memo.partial = true;
      }
      void queryClient.invalidateQueries({ queryKey, exact: true });
    },
    [queryClient, queryKey],
  );
  return { query, recheck, refetch: () => void query.refetch() };
}

/**
 * The list from its refs + filter, however they are stored. `writeRefs`
 * persists the next refs (an empty list also drops the filter).
 */
function useBulkList(
  scope: NavLocateScope,
  selection: RefSelection,
  rawStatus: string | null,
  rawFacet: string | null,
  writeRefs: (refs: readonly string[]) => void,
  setStatus: (status: string | null) => void,
): BulkList {
  const located = useLocatedList(scope, selection.refs);
  const response = located.query.data;
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
  // A facet only narrows inside a status, and only one some number wears.
  const facet = status && rawFacet && entries.some((entry) => entry.facet?.id === rawFacet) ? rawFacet : null;

  return {
    scope,
    selection,
    response,
    loading: located.query.isFetching,
    error: located.query.error ? located.query.error.message || 'Could not locate the pasted numbers' : null,
    refetch: located.refetch,
    entries,
    buckets,
    status,
    setStatus,
    facet,
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
    recheck: located.recheck,
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
  const rawFacet = (locate.facetParam && searchParams?.get(locate.facetParam)?.trim()) || null;

  const writeRefs = useCallback(
    (refs: readonly string[]) =>
      replace((params) => {
        params.delete('page');
        if (refs.length === 0) {
          params.delete(locate.param);
          params.delete(locate.statusParam);
          if (locate.facetParam) params.delete(locate.facetParam);
        } else {
          params.set(locate.param, serializeRefIn(refs));
        }
      }),
    [locate.param, locate.statusParam, locate.facetParam, replace],
  );
  // A facet belongs to its status: changing the status drops it.
  const setStatus = useCallback(
    (status: string | null) =>
      replace((params) => {
        params.delete('page');
        if (locate.facetParam) params.delete(locate.facetParam);
        if (status) params.set(locate.statusParam, status);
        else params.delete(locate.statusParam);
      }),
    [locate.statusParam, locate.facetParam, replace],
  );

  return useBulkList(locate.locator, selection, rawStatus, rawFacet, writeRefs, setStatus);
}

/** The same list held in component state — the everywhere face has no page list and no URL. */
export function useLocalBulkList(scope: NavLocateScope): BulkList {
  const [selection, setSelection] = useState<RefSelection>(() => parseRefInParam(null));
  const [status, setStatus] = useState<string | null>(null);
  const writeRefs = useCallback((refs: readonly string[]) => {
    setSelection(parseRefInParam(serializeRefIn(refs)));
    if (refs.length === 0) setStatus(null);
  }, []);
  return useBulkList(scope, selection, status, null, writeRefs, setStatus);
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
  find,
}: {
  list: BulkList;
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The page list's Find, when the paste sits over one (else the desk store at this path). */
  find?: PageFind;
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
        className={cn(BULK_KEY_CLASS, open && BULK_KEY_OPEN_CLASS)}
      >
        <ChevronRight aria-hidden className={cn('size-3.5 text-text-muted transition-transform', open && 'rotate-180')} />
        <KeyboardKey size="xs">B</KeyboardKey>
        <span>{count}</span>
        {list.loading ? <Loader2 aria-hidden className="size-3 animate-spin text-text-faint" /> : null}
      </button>
      <NavBulkPopout
        list={list}
        find={find}
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

/**
 * The bulk key right of Find while there is no list: `[⧉] [B]` opens an
 * empty paste box in the list's place. What it takes is exactly a paste into
 * Find (`BulkList.paste`, the same `?ref_in=`): 2+ numbers become the list
 * and it opens; one number stays a Find.
 */
export function NavBulkPasteKey({
  list,
  anchorRef,
  find,
  onListed,
}: {
  list: BulkList;
  anchorRef: React.RefObject<HTMLElement | null>;
  find: PageFind;
  /** The paste became the list — open it. */
  onListed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const parsed = useMemo(() => parseRefList(text), [text]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== BULK_KEY || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.defaultPrevented || isEditableKeyTarget(event.target)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };
  const commit = () => {
    if (parsed.refs.length === 0) return;
    if (list.paste(text)) {
      setText('');
      setOpen(false);
      onListed();
      return;
    }
    find.set(parsed.refs[0]);
    setText('');
    close();
  };
  const count = parsed.refs.length;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-nav-bulk-paste
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-keyshortcuts="B"
        aria-label={`Paste a list — up to ${CHECK_ZOHO_RECEIVED_MAX_INPUTS} numbers`}
        title={`Paste a list — up to ${CHECK_ZOHO_RECEIVED_MAX_INPUTS} numbers`}
        onClick={() => setOpen(!open)}
        className={cn(BULK_KEY_CLASS, open && BULK_KEY_OPEN_CLASS)}
      >
        <ClipboardList aria-hidden className="size-3.5 text-text-muted" />
        <KeyboardKey size="xs">B</KeyboardKey>
      </button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        placement="right-start"
        gap={8}
        data-nav-bulk-paste-box
        className="flex w-[26rem] flex-col rounded-sm bg-surface-canvas font-spine"
      >
        <label className="flex h-8 shrink-0 items-center border-b border-border-hairline px-2 text-role-caption font-semibold text-text-default">
          Paste a list
        </label>
        <textarea
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
          }}
          aria-label="Order or tracking numbers"
          placeholder={`Paste up to ${CHECK_ZOHO_RECEIVED_MAX_INPUTS} order or tracking numbers — one per line, or comma-separated`}
          rows={10}
          spellCheck={false}
          className="min-h-0 w-full resize-none bg-transparent px-2 py-1.5 font-mono text-role-caption text-text-default outline-none placeholder:font-sans placeholder:text-text-faint"
        />
        <div className="flex shrink-0 items-center gap-2 border-t border-border-hairline px-2 py-1">
          <span className="min-w-0 flex-1 truncate text-role-micro tabular-nums text-text-faint">
            {count === 0
              ? 'Nothing pasted yet'
              : `${count} number${count === 1 ? '' : 's'}${parsed.truncated > 0 ? ` · ${parsed.truncated} over the cap are dropped` : ''}`}
          </span>
          <span className="flex items-center gap-1 text-role-micro text-text-faint">
            <KeyboardKey size="xs">↵</KeyboardKey> check
            <KeyboardKey size="xs">⇧↵</KeyboardKey> new line
          </span>
          <Button size="sm" variant="primary" disabled={count === 0} onClick={commit}>
            Check
          </Button>
        </div>
      </Popover>
    </>
  );
}
