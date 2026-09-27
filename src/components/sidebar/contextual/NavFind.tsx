'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { NavSearch } from '@/lib/nav/context/schema';
import { KeyboardKey } from '@/design-system/primitives';
import { Search, X } from '@/components/Icons';
import { COMMAND_BAR_OPEN_EVENT } from '@/lib/app-events';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { subscribeDeskSearchFocus, useDeskSearch } from '@/lib/outbound/desk-search-store';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { useReplaceSearchParams } from './useReplaceSearchParams';

/** The one hotkey that lands in Find. Bare `F`, never while typing. */
const FIND_KEY = 'f';

/**
 * Sunken well — the ONE face both searches wear: below the sidebar plane,
 * 6px corner, hairline inset ring, a fixed 32px (`shrink-0` so neither the
 * header row nor the pinned column can stretch or squash it). Global search
 * is a button in it; Find is an input in it. Hotkeys sit between the glyph
 * and the words (pinned law `KeyboardKey`).
 */
const WELL_CLASS = cn(
  'flex h-8 min-w-0 shrink-0 items-center gap-1.5 bg-surface-sunken px-2',
  'shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-inset ring-border-hairline',
  'transition-shadow focus-within:ring-border-strong',
  SIDEBAR_CONTROL_CORNER,
);

function Keycaps({ keys }: { keys: readonly string[] }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center gap-0.5">
      {keys.map((key) => (
        <KeyboardKey key={key} size="xs">
          {key}
        </KeyboardKey>
      ))}
    </span>
  );
}

/**
 * Global search — the sidebar's top row on every contextual page. Opens the ⌘K
 * palette (`CommandBar` owns the chord); this is its clickable face.
 */
export function NavGlobalSearch() {
  const [apple, setApple] = useState(true);
  useEffect(() => {
    setApple(/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent));
  }, []);
  return (
    <button
      type="button"
      data-nav-global-search
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() => window.dispatchEvent(new Event(COMMAND_BAR_OPEN_EVENT))}
      className={cn(
        WELL_CLASS,
        'ds-raw-button flex-1 text-left transition-[box-shadow,transform] hover:ring-border-soft active:translate-y-px',
        focusRing('control', 'accent'),
      )}
    >
      <Search aria-hidden className="size-3.5 shrink-0 text-text-faint" />
      <Keycaps keys={apple ? ['⌘', 'K'] : ['Ctrl', 'K']} />
      <span className="min-w-0 truncate text-role-caption font-medium text-text-muted">Search</span>
    </button>
  );
}

/**
 * Find — pinned under `‹ <Page>`, narrows ONLY the list on screen.
 * `search.source` says where that list reads its query (`desk-store` = the
 * in-memory desk query keyed by pathname; `url-param` = `search.param`). The
 * placeholder follows the view ("Find shipments"). A page without a list of
 * its own (`identify`) has no Find — global search above covers it.
 *
 * `F` focuses it from anywhere on the page that is not a text field.
 */
export function NavFind({ search }: { search: NavSearch }) {
  if (search.source === 'identify') return null;
  const placeholder = search.placeholder.replace(/^Search\b/, 'Find');
  return search.source === 'desk-store' ? (
    <DeskStoreFind placeholder={placeholder} />
  ) : (
    <UrlParamFind placeholder={placeholder} param={search.param ?? 'q'} />
  );
}

function useFindInput() {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const focus = () => {
      ref.current?.focus();
      ref.current?.select();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== FIND_KEY || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.defaultPrevented || isEditableKeyTarget(event.target)) return;
      event.preventDefault();
      focus();
    };
    window.addEventListener('keydown', onKeyDown);
    const unsubscribe = subscribeDeskSearchFocus(focus);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unsubscribe();
    };
  }, []);
  return ref;
}

/**
 * The input keeps a local draft and commits after `debounceMs`. A committed
 * value coming back from the store never overwrites keys typed since.
 */
function FindWell({
  value,
  onChange,
  placeholder,
  debounceMs = 0,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  debounceMs?: number;
}) {
  const inputRef = useFindInput();
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setDraft(value);
  }, [value]);
  useEffect(() => {
    if (draft === committed.current) return;
    const timer = window.setTimeout(() => {
      committed.current = draft;
      onChange(draft);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [draft, debounceMs, onChange]);

  return (
    <div data-nav-find className={WELL_CLASS}>
      <Search aria-hidden className="size-3.5 shrink-0 text-text-faint" />
      <Keycaps keys={['F']} />
      <input
        ref={inputRef}
        type="search"
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-keyshortcuts="F"
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          if (draft) setDraft('');
          else event.currentTarget.blur();
        }}
        className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-role-caption font-medium text-text-default outline-none placeholder:text-text-faint [&::-webkit-search-cancel-button]:hidden"
      />
      {draft ? (
        <button
          type="button"
          aria-label="Clear find"
          onClick={() => {
            setDraft('');
            inputRef.current?.focus();
          }}
          className={cn('ds-raw-button grid size-5 shrink-0 place-content-center text-text-faint hover:text-text-default', SIDEBAR_CONTROL_CORNER)}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function DeskStoreFind({ placeholder }: { placeholder: string }) {
  const pathname = usePathname() || '/';
  const [value, setValue] = useDeskSearch(pathname);
  return <FindWell value={value} onChange={setValue} placeholder={placeholder} debounceMs={150} />;
}

function UrlParamFind({ placeholder, param }: { placeholder: string; param: string }) {
  const value = useSearchParams()?.get(param) ?? '';
  const replace = useReplaceSearchParams();
  return (
    <FindWell
      value={value}
      placeholder={placeholder}
      debounceMs={250}
      onChange={(next) =>
        replace((params) => {
          if (next.trim()) params.set(param, next);
          else params.delete(param);
        })
      }
    />
  );
}
