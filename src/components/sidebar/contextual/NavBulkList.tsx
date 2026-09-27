'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import type { NavSearch } from '@/lib/nav/context/schema';
import { KeyboardKey } from '@/design-system/primitives';
import { ChevronRight, Loader2 } from '@/components/Icons';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { useInboundCheck } from '@/lib/receiving/inbound-check-query';
import {
  parseReconParam,
  parseRefInParam,
  parseRefList,
  serializeRefIn,
  type ReconEntry,
  type ReconStatus,
  type RefSelection,
} from '@/lib/receiving/reconcile';
import { toast } from '@/lib/toast';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { NavBulkPopout } from './NavBulkPopout';
import { useReplaceSearchParams } from './useReplaceSearchParams';

type NavBulk = NonNullable<NavSearch['bulk']>;

/** Bare `B` toggles the pasted list, never while typing. */
const BULK_KEY = 'b';

/** The pasted list, its Check answer, and the verbs over it. */
export interface BulkList {
  selection: RefSelection;
  entries: ReconEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  status: ReconStatus | null;
  /** A paste of 2+ numbers → the list. False for a single number (it stays a Find). */
  paste: (text: string) => boolean;
  remove: (ref: string) => void;
  /** Replace one number with whatever was typed (a comma list expands in place). */
  replaceRef: (ref: string, text: string) => void;
  clear: () => void;
}

/**
 * The pasted list's URL state (`bulk.param` = the operator's strings,
 * `bulk.statusParam` = one bucket) plus the Check's answer for it. Every
 * reader — the Find toggle, the popout, the ledger's status chips — reads
 * the same URL and the same query key.
 */
export function useNavBulkList(bulk: NavBulk): BulkList {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const raw = searchParams?.get(bulk.param) ?? null;
  const selection = useMemo(() => parseRefInParam(raw), [raw]);
  const status = parseReconParam(searchParams?.get(bulk.statusParam));
  const check = useInboundCheck(selection);

  const writeRefs = useCallback(
    (refs: readonly string[]) =>
      replace((params) => {
        params.delete('page');
        if (refs.length === 0) {
          params.delete(bulk.param);
          params.delete(bulk.statusParam);
        } else {
          params.set(bulk.param, serializeRefIn(refs));
        }
      }),
    [bulk.param, bulk.statusParam, replace],
  );

  return {
    selection,
    entries: check.entries,
    loading: check.loading,
    error: check.error,
    refetch: check.refetch,
    status,
    /** A paste of 2+ numbers → the list. Returns false for a single number (it stays a Find). */
    paste: (text: string): boolean => {
      const next = parseRefList(text);
      if (next.refs.length < 2) return false;
      writeRefs(next.refs);
      if (next.truncated > 0) toast.message(`Checking the first ${next.refs.length} — ${next.truncated} more were dropped`);
      return true;
    },
    remove: (ref: string) => writeRefs(selection.refs.filter((r) => r !== ref)),
    /** Replace one number with whatever was typed (a comma list expands in place). */
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
