'use client';

/**
 * Always-visible saved-views list for the Outbound sidebar.
 * Avoids the popover trigger pattern (easy to miss clicks inside a motion/
 * overflow sidebar) — same apply/save/delete semantics as TableOptionsMenu.
 */

import { useState } from 'react';
import { Check, Plus, Star, Trash2 } from '@/components/Icons';
import { useSavedViews } from '@/hooks/useSavedViews';
import { cn } from '@/utils/_cn';
import {
  PACKED_SAVED_VIEWS_KEY,
  PACKED_VIEW_PARAMS,
  SHIPPED_SAVED_VIEWS_KEY,
  SHIPPED_VIEW_PARAMS,
  UNSHIPPED_SAVED_VIEWS_KEY,
  UNSHIPPED_VIEW_PARAMS,
} from '@/components/unshipped/outbound-sidebar-shared';

const EYEBROW = 'text-role-eyebrow uppercase tracking-widest text-text-soft';

export function OutboundSavedViewsList({
  mode,
}: {
  mode: 'unshipped' | 'packed' | 'shipped';
}) {
  const storageKey =
    mode === 'unshipped'
      ? UNSHIPPED_SAVED_VIEWS_KEY
      : mode === 'packed'
        ? PACKED_SAVED_VIEWS_KEY
        : SHIPPED_SAVED_VIEWS_KEY;
  const paramKeys =
    mode === 'unshipped'
      ? UNSHIPPED_VIEW_PARAMS
      : mode === 'packed'
        ? PACKED_VIEW_PARAMS
        : SHIPPED_VIEW_PARAMS;
  const { views, activeView, hasActiveFilters, applyView, saveView, removeView } = useSavedViews({
    storageKey,
    paramKeys,
  });

  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    if (!draft.trim()) return;
    saveView(draft);
    setDraft('');
    setNaming(false);
  };

  return (
    <section className="space-y-1.5" aria-label="Saved views">
      <div className="flex items-center gap-1.5">
        <Star className={cn('h-3.5 w-3.5', activeView ? 'text-amber-500' : 'text-text-faint')} />
        <p className={EYEBROW}>Saved views</p>
      </div>

      {views.length === 0 ? (
        <p className="px-0.5 py-1 text-role-caption italic text-text-faint">
          No saved views yet. Set a filter, then save it here.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {views.map((view) => {
            const isActive = view.id === activeView?.id;
            return (
              <li key={view.id} className="group flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => applyView(view)}
                  className={cn(
                    'ds-raw-button flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-role-caption transition-colors',
                    isActive
                      ? 'bg-blue-50 font-semibold text-text-default ring-1 ring-inset ring-blue-400'
                      : 'text-text-muted hover:bg-surface-hover',
                  )}
                >
                  <Check
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      isActive ? 'text-blue-600' : 'text-transparent',
                    )}
                  />
                  <span className="truncate">{view.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete view ${view.name}`}
                  onClick={() => removeView(view.id)}
                  className="ds-raw-button shrink-0 rounded p-1.5 text-text-faint opacity-0 transition-all hover:text-rose-500 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-border-hairline pt-1.5">
        {naming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
            className="flex items-center gap-1.5"
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Name this view…"
              className="min-w-0 flex-1 rounded-md border border-border-soft bg-surface-card px-2 py-1.5 text-role-caption text-text-default outline-none focus:border-blue-400"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="ds-raw-button shrink-0 rounded-md bg-blue-600 px-2.5 py-1.5 text-role-caption font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            >
              Save
            </button>
          </form>
        ) : (
          <button
            type="button"
            disabled={!hasActiveFilters || Boolean(activeView)}
            onClick={() => setNaming(true)}
            title={
              !hasActiveFilters
                ? 'Set a filter first'
                : activeView
                  ? 'These filters are already saved'
                  : 'Save the current filters as a view'
            }
            className="ds-raw-button flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-role-caption font-medium text-text-muted transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            Save current view
          </button>
        )}
      </div>
    </section>
  );
}
