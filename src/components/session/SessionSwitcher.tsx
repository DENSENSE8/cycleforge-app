'use client';

/**
 * SessionSwitcher — the session surface's face in the GLOBAL HEADER (pushed up
 * via `useHeader().setPanelContent`, the same zone the desks use). Shows the
 * current thread's name; opens a dropdown with the search box and recent
 * sessions inline. Nothing session-related renders on the panel itself —
 * the left side is chat only.
 *
 * Opening a session navigates `/?session=<id>` (URL-as-state — the panel loads
 * it read-only); New conversation dispatches {@link AI_CHAT_NEW_EVENT} and
 * navigates `/` (the panel also binds ⌘N / Ctrl+N and the sidebar nav entry
 * routes `/?new=1` — one verb, three doors).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2, Search, Sparkles } from '@/components/Icons';
import { AI_CHAT_NEW_EVENT } from '@/lib/app-events';
import { useChatSessions } from '@/lib/assistant/use-chat-sessions';
import { cn } from '@/utils/_cn';
import { getSessionTitle, subscribeSessionTitle } from './session-title-store';

export function SessionSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  useSyncExternalTitle();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { title } = getSessionTitle();
  // One fetcher, shared with the spine's Sessions section — `enabled` is what
  // keeps this dropdown from loading a list nobody has opened yet.
  const { sessions, loading } = useChatSessions({ enabled: open });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const pick = useCallback(
    (id: string) => {
      setOpen(false);
      setQuery('');
      router.push(`/?session=${encodeURIComponent(id)}`);
    },
    [router],
  );

  const newConversation = useCallback(() => {
    setOpen(false);
    setQuery('');
    window.dispatchEvent(new CustomEvent(AI_CHAT_NEW_EVENT));
    router.push('/');
  }, [router]);

  const q = query.trim().toLowerCase();
  const filtered = q ? (sessions ?? []).filter((s) => (s.title ?? '').toLowerCase().includes(q)) : (sessions ?? []);

  return (
    <div className={cn('relative min-w-0', className)} data-session-switcher>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Switch session"
        className="flex max-w-72 items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-surface-sunken"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-blue-600" />
        <span className="min-w-0 truncate text-left text-role-caption font-semibold text-text-default">
          {title}
        </span>
        <ChevronDown className={cn('h-3 w-3 shrink-0 text-text-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-20" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 w-[min(26rem,100vw)] min-w-64 rounded-xl border border-border-hairline bg-surface-canvas p-2 shadow-lg">
            <label className="mb-1.5 flex items-center gap-2 rounded-lg bg-surface-sunken px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-text-faint" />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sessions and the business…"
                aria-label="Search sessions and the business"
                className="min-w-0 flex-1 bg-transparent text-role-caption text-text-default outline-none placeholder:text-text-faint"
              />
            </label>
            <button
              type="button"
              onClick={newConversation}
              className="block w-full truncate rounded-lg px-2 py-1 text-left text-role-caption font-medium text-text-default hover:bg-surface-sunken"
            >
              New conversation
            </button>
            {loading ? (
              <p className="flex items-center gap-1.5 px-2 py-1.5 text-role-eyebrow uppercase tracking-widest text-text-faint">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading
              </p>
            ) : null}
            {filtered.length > 0 ? (
              <div className="max-h-64 overflow-y-auto">
                <p className="px-2 pb-1 pt-1.5 text-role-eyebrow uppercase tracking-widest text-text-faint">Sessions</p>
                <ul>
                  {filtered.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => pick(s.id)}
                        className="block w-full truncate rounded-lg px-2 py-1 text-left text-role-caption text-text-muted hover:bg-surface-sunken"
                      >
                        {s.title ?? s.id}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {query.trim().length >= 2 ? (
              <div className="border-t border-border-hairline pt-1.5">
                <p className="px-2 pb-1 pt-0.5 text-role-eyebrow uppercase tracking-widest text-text-faint">In the business</p>
                <SearchResults query={query.trim()} onPick={() => setOpen(false)} />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function useSyncExternalTitle(): void {
  // Subscribe so the trigger re-renders when the panel publishes a new title.
  const [, force] = useState(0);
  useEffect(() => subscribeSessionTitle(() => force((n) => n + 1)), []);
}

function SearchResults({ query, onPick }: { query: string; onPick: () => void }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>> | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/global-search?q=${encodeURIComponent(query)}&limit=6`);
        if (!res.ok) return;
        const data = (await res.json()) as { rows?: Array<Record<string, unknown>> };
        if (alive) setRows(data.rows ?? []);
      } catch {
        if (alive) setRows(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [query]);

  if (rows === null || rows.length === 0) return null;
  return (
    <ul className="space-y-0.5 pb-1" aria-label="Search results">
      {rows.map((row, i) => {
        const href = typeof row.href === 'string' ? row.href : null;
        const label =
          typeof row.title === 'string'
            ? row.subtitle
              ? `${row.title} — ${row.subtitle}`
              : row.title
            : JSON.stringify(row).slice(0, 60);
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => {
                if (href) window.location.assign(href);
                onPick();
              }}
              className="block w-full truncate rounded-lg px-2 py-1 text-left text-role-caption text-text-muted hover:bg-surface-sunken"
            >
              {label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
