'use client';

/** Saved-views list face — rail, Band-3 popover, or dedicated panel. */

import { useRef, useState } from 'react';
import { Check, Pencil, Plus, Share2, Star, Trash2 } from '@/components/Icons';
import { useSavedViews, type UseSavedViewsResult } from '@/hooks/useSavedViews';
import { InlineEditableValue } from '@/design-system/components/InlineEditableValue';
import { NAV_ROW } from '@/components/ui/queue-row-chrome';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';


const EYEBROW = 'text-role-eyebrow uppercase tracking-widest text-text-soft';

interface SavedViewsListProps {
  /** Resolves to a `saved_views.surface` via `src/lib/saved-views/surfaces.ts`. */
  storageKey: string;
  /** The params that DEFINE a view on this surface (order-independent). */
  paramKeys: readonly string[];
  /**
   * First-use copy. Teach what a view IS on this surface rather than restating
   * "none yet" — `display/workbench.md` → the four settled states.
   */
  emptyHint?: string;
  /**
   * Suppress the internal "Saved views" eyebrow — for hosts that already label
   * the list (Band-3 Views ▾ trigger).
   */
  hideHeader?: boolean;
  /**
   * Shared controller from a parent that already called {@link useSavedViews}
   * (Band-3 menu trigger + list must share one fetch / one activeView).
   */
  controller?: UseSavedViewsResult;
}

export function SavedViewsList(props: SavedViewsListProps) {
  if (props.controller) {
    return <SavedViewsListView {...props} controller={props.controller} />;
  }
  return <SavedViewsListWithHook {...props} />;
}

function SavedViewsListWithHook(props: SavedViewsListProps) {
  const controller = useSavedViews({
    storageKey: props.storageKey,
    paramKeys: props.paramKeys,
  });
  return <SavedViewsListView {...props} controller={controller} />;
}

function SavedViewsListView({
  emptyHint = 'No saved views yet. Set a filter, then save it here.',
  hideHeader = false,
  controller,
}: SavedViewsListProps & { controller: UseSavedViewsResult }) {
  const {
    views,
    activeView,
    hasActiveFilters,
    applyView,
    clearView,
    saveView,
    renameView,
    setViewShared,
    removeView,
  } = controller;

  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [shareWithOrg, setShareWithOrg] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const skipRenameCommit = useRef(false);

  const commit = () => {
    if (!draft.trim()) return;
    saveView(draft, { isShared: shareWithOrg });
    setDraft('');
    setShareWithOrg(false);
    setNaming(false);
  };

  const canSave = hasActiveFilters && !activeView;

  return (
    <section className="space-y-1.5" aria-label="Saved views">
      {!hideHeader ? (
        <div className="flex items-center gap-1.5">
          <Star className={cn('h-3.5 w-3.5', activeView ? 'text-amber-500' : 'text-text-faint')} />
          <p className={EYEBROW}>Saved views</p>
        </div>
      ) : null}

      {views.length === 0 ? (
        <p className="px-0.5 py-1 text-role-caption italic text-text-faint">{emptyHint}</p>
      ) : (
        <ul className="space-y-0.5">
          {views.map((view) => {
            const isActive = view.id === activeView?.id;
            const isRenaming = renamingId === view.id;
            return (
              <li key={view.id} className="group flex items-center gap-0.5">
                {isRenaming ? (
                  <div
                    className="min-w-0 flex-1 px-2 py-0.5"
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape') return;
                      event.preventDefault();
                      event.stopPropagation();
                      skipRenameCommit.current = true;
                      setRenamingId(null);
                    }}
                  >
                    <InlineEditableValue
                      value={renameDraft}
                      onChange={setRenameDraft}
                      autoFocus
                      showEditIcon={false}
                      placeholder="Name this view…"
                      className="gap-1"
                      valueClassName="text-role-caption font-medium"
                      inputClassName="text-role-caption font-medium"
                      onSubmit={() => {
                        if (skipRenameCommit.current) {
                          skipRenameCommit.current = false;
                          return;
                        }
                        const next = renameDraft.trim();
                        if (next && next !== view.name) renameView(view.id, next);
                        setRenamingId(null);
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => applyView(view)}
                    data-testid={`data-table-views-apply-${view.id}`}
                    className={cn(
                      'ds-raw-button flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-role-caption transition-colors',
                      focusRing('control'),
                      isActive
                        ? NAV_ROW.selectedClass
                        : 'text-text-muted hover:bg-surface-hover',
                    )}
                  >
                    <Check
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        isActive ? 'text-text-default' : 'text-transparent',
                      )}
                    />
                    <span className="truncate">{view.name}</span>
                    {view.isShared ? (
                      <HoverTooltip label="Shared with org" focusable={false}>
                        <Share2 className="h-3 w-3 shrink-0 text-text-faint" />
                      </HoverTooltip>
                    ) : null}
                  </button>
                )}
                {view.isMine ? (
                  <HoverTooltip label="Rename" focusable={false}>
                    <button
                      type="button"
                      aria-label={`Rename view ${view.name}`}
                      data-testid={`data-table-views-rename-${view.id}`}
                      onClick={() => {
                        skipRenameCommit.current = false;
                        setRenamingId(view.id);
                        setRenameDraft(view.name);
                      }}
                      className="ds-raw-button shrink-0 rounded p-1.5 text-text-faint opacity-0 transition-all hover:text-text-default group-hover:opacity-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </HoverTooltip>
                ) : null}
                {view.isMine ? (
                  <HoverTooltip
                    label={view.isShared ? 'Stop sharing with org' : 'Share with org'}
                    focusable={false}
                  >
                    <button
                      type="button"
                      aria-label={
                        view.isShared
                          ? `Stop sharing view ${view.name}`
                          : `Share view ${view.name} with org`
                      }
                      aria-pressed={view.isShared}
                      onClick={() => setViewShared(view.id, !view.isShared)}
                      className={cn(
                        'ds-raw-button shrink-0 rounded p-1.5 transition-all',
                        view.isShared
                          ? 'text-blue-600 opacity-100'
                          : 'text-text-faint opacity-0 group-hover:opacity-100 hover:text-blue-600',
                      )}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </button>
                  </HoverTooltip>
                ) : null}
                {view.isMine ? (
                  <button
                    type="button"
                    aria-label={`Delete view ${view.name}`}
                    onClick={() => removeView(view.id)}
                    className="ds-raw-button shrink-0 rounded p-1.5 text-text-faint opacity-0 transition-all hover:text-rose-500 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {activeView ? (
        <button
          type="button"
          onClick={clearView}
          data-testid="data-table-views-clear"
          className="ds-raw-button w-full rounded px-2 py-1.5 text-left text-role-caption font-medium text-text-muted transition-colors hover:bg-surface-hover"
        >
          Clear view
        </button>
      ) : null}

      <div className="border-t border-border-hairline pt-1.5">
        {naming ? (
          <div className="space-y-1.5">
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
                className={cn(
                  'min-w-0 flex-1 border border-border-soft bg-surface-card px-2 py-1.5 text-role-caption text-text-default',
                  cornerClass('field'),
                  focusRing('field', 'accent'),
                )}
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                data-testid="data-table-views-save"
                className={cn(
                  'ds-raw-button shrink-0 bg-blue-600 px-2.5 py-1.5 text-role-caption font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40',
                  cornerClass('control'),
                )}
              >
                Save
              </button>
            </form>
            <label className="flex items-center gap-1.5 px-0.5 text-role-micro font-semibold uppercase tracking-widest text-text-soft">
              <input
                type="checkbox"
                checked={shareWithOrg}
                onChange={(e) => setShareWithOrg(e.target.checked)}
                data-testid="data-table-views-share-org"
                className="h-3 w-3 accent-blue-600"
              />
              Share with org
            </label>
          </div>
        ) : (
          <button
            type="button"
            disabled={!canSave}
            onClick={() => setNaming(true)}
            title={
              !hasActiveFilters
                ? 'Set a filter or sort first'
                : activeView
                  ? 'This combination is already saved'
                  : 'Save the current filter and sort as a view'
            }
            data-testid="data-table-views-save-current"
            className="ds-raw-button flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-role-caption font-medium text-text-muted transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            Save current view
          </button>
        )}
      </div>
    </section>
  );
}
