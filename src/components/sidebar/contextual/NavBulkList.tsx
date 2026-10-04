'use client';

import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import type { NavSearch } from '@/lib/nav/context/schema';
import { useBulkList, type BulkList } from '@/lib/nav/locate/use-bulk-list';
import { FindToken } from '@/design-system/components/FindField';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hotkeyMatches, PASTE_LIST_HOTKEY } from '@/lib/keyboard/key-registry';
import { useApplePlatform } from '@/lib/keyboard/chord-keys';
import { parseRefInParam, serializeRefIn } from '@/lib/receiving/reconcile';
import { CHECK_ZOHO_RECEIVED_MAX_INPUTS } from '@/lib/receiving/tracking-paste';
import { NavBulkPanel } from './NavBulkPanel';
import type { PageFind } from './NavFind';
import { useReplaceSearchParams } from './useReplaceSearchParams';

type NavLocate = NonNullable<NavSearch['locate']>;

/**
 * A page's pasted list, in its URL (`locate.param` = the operator's strings,
 * `locate.statusParam` = one bucket). Every reader — the search bar's token
 * and panel, the page's own list — reads the same URL.
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

/** Reads the clipboard for the paste-a-list chord. A blocked or empty read is '' — the focused field still takes ⌘V. */
async function readClipboardText(): Promise<string> {
  try {
    return (await navigator.clipboard?.readText()) ?? '';
  } catch {
    return '';
  }
}

/**
 * `PASTE_LIST_HOTKEY` (⌘⌥V / Ctrl+Alt+V) from any page, outside a text
 * field: the clipboard's 2+ numbers become the list (`listed`), then
 * `onChord` lands the operator in the search field with its panel open (the
 * list, or the line that teaches ⌘V when the clipboard held none or could
 * not be read). Only the field on screen answers: two NavFinds can mount
 * (the collapsed sidebar keeps its zero-width field while the header shows
 * its own).
 */
export function usePasteListHotkey(
  list: BulkList,
  anchorRef: RefObject<HTMLElement | null>,
  onChord: (listed: boolean) => void,
): void {
  const latest = useRef({ list, onChord });
  latest.current = { list, onChord };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented || !hotkeyMatches(PASTE_LIST_HOTKEY, event)) return;
      if (isEditableKeyTarget(event.target)) return;
      const anchor = anchorRef.current;
      if (!anchor || anchor.offsetWidth === 0 || anchor.getClientRects().length === 0) return;
      event.preventDefault();
      void readClipboardText().then((text) => {
        const current = latest.current;
        current.onChord(current.list.paste(text));
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [anchorRef]);
}

/** The held list inside the well: `40 numbers` (a press opens it) and its own × (lets it go). */
export function BulkListToken({ list, onOpen }: { list: BulkList; onOpen: () => void }) {
  const count = list.selection.refs.length;
  return (
    <FindToken
      label={`Open the ${count} pasted numbers`}
      clearLabel="Clear the pasted list"
      onOpen={onOpen}
      onClear={list.clear}
    >
      <AnimatedStat value={count} />
      numbers
    </FindToken>
  );
}

/**
 * What the search well's panel holds for a paste: the list (NavBulkPanel)
 * while one is held, else — the chord opened an empty panel — the line that
 * says what to paste and how.
 */
export function NavBulkDrop({
  list,
  find,
  onClose,
  onLeave,
  listboxRef,
}: {
  list: BulkList;
  find?: PageFind;
  onClose: () => void;
  onLeave: () => void;
  listboxRef: RefObject<HTMLDivElement>;
}) {
  const apple = useApplePlatform();
  if (list.selection.refs.length > 0) {
    return <NavBulkPanel list={list} find={find} onClose={onClose} onLeave={onLeave} listboxRef={listboxRef} />;
  }
  return (
    <p data-nav-bulk-empty className="px-2 py-1.5 text-role-caption text-text-muted">
      Paste a list here with {apple ? '⌘V' : 'Ctrl+V'} — 2 to {CHECK_ZOHO_RECEIVED_MAX_INPUTS} order or tracking numbers, one per
      line or comma-separated. Each one is checked.
    </p>
  );
}
