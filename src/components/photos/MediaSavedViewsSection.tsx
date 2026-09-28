'use client';

import { useState } from 'react';
import { Check, Loader2, Plus, Trash2 } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { requestConfirm } from '@/design-system/components/confirm';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  useMediaLibrarySavedViews,
  readMediaViewPayload,
  type MediaViewPayload,
} from '@/hooks/useMediaLibrarySavedViews';
import type {
  PhotoLibraryFilterState,
  PhotoLibraryViewMode,
} from '@/lib/photos/library-filter-state';
import { focusRing } from '@/design-system/tokens/focus-ring';


interface MediaSavedViewsSectionProps {
  currentFilters: PhotoLibraryFilterState;
  currentView: PhotoLibraryViewMode;
  /** Whether the current state is worth saving (has filters or a non-default view). */
  savable: boolean;
  /** Org-wide sharing needs `photos.manage`. */
  canManage: boolean;
  onApply: (payload: MediaViewPayload) => void;
  /** Teaching line for "no views, nothing to save". */
  emptyHint?: string;
}

/**
 * "Saved views" — persistent filter/view presets for the media library. Personal
 * by default; managers can share org-wide. Applying rewrites the URL params (the
 * SoT); this section only lists + saves the named snapshots.
 */
export function MediaSavedViewsSection({
  currentFilters,
  currentView,
  savable,
  canManage,
  onApply,
  emptyHint,
}: MediaSavedViewsSectionProps) {
  const { views, isLoading, create, creating, remove } = useMediaLibrarySavedViews();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [shareWithOrg, setShareWithOrg] = useState(false);

  const barren = !isLoading && views.length === 0 && !savable;
  // Nothing to show and nothing to save. Inside a shared funnel that means
  // stay out of the way; as a panel's whole body it means teach.
  if (barren && !emptyHint) return null;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const payload: MediaViewPayload = {
      schemaVersion: 1,
      filters: currentFilters,
      view: currentView,
    };
    create(
      { name: trimmed, filters: payload, isShared: canManage && shareWithOrg },
      {
        onSuccess: () => {
          setName('');
          setShareWithOrg(false);
          setSaving(false);
        },
      },
    );
  };

  return (
    <div className="mb-3 space-y-1 px-1">
      <div className="flex items-center justify-between">
        <p className="text-role-eyebrow text-text-soft">Saved views</p>
        {savable && !saving ? (
          <HoverTooltip label="Save current filters as a view" focusable={false}>
            {/* ds-raw-button */}
            <button
              type="button"
              onClick={() => setSaving(true)}
              className={cn(
                '-my-0.5 flex items-center gap-1 px-1 py-0.5 text-role-micro text-blue-600 hover:bg-blue-50',
                cornerClass('flush'),
              )}
            >
              <Plus className="h-3.5 w-3.5" /> Save
            </button>
          </HoverTooltip>
        ) : null}
      </div>

      {saving ? (
        <div
          className={cn(
            'space-y-1.5 border border-border-soft bg-surface-canvas p-2',
            cornerClass('flush'),
          )}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') setSaving(false);
            }}
            placeholder="View name…"
            className={cn(
              cn('w-full border border-border-soft bg-surface-card px-2 py-1 text-role-caption text-text-default', focusRing('field', 'accent')),
              cornerClass('flush'),
            )}
          />
          {canManage ? (
            <label className="flex items-center gap-1.5 text-role-micro font-semibold text-text-soft">
              <input
                type="checkbox"
                checked={shareWithOrg}
                onChange={(e) => setShareWithOrg(e.target.checked)}
                className="h-3 w-3 accent-blue-600"
              />
              Share with org
            </label>
          ) : null}
          <div className="flex items-center gap-1.5">
            {/* ds-raw-button */}
            <button
              type="button"
              onClick={submit}
              disabled={!name.trim() || creating}
              className={cn(
                'flex items-center gap-1 bg-blue-600 px-2 py-1 text-role-micro text-white disabled:opacity-50',
                cornerClass('flush'),
              )}
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </button>
            {/* ds-raw-button */}
            <button
              type="button"
              onClick={() => setSaving(false)}
              className={cn(
                'px-2 py-1 text-role-micro text-text-faint hover:text-text-muted',
                cornerClass('flush'),
              )}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <p className="flex items-center gap-1.5 py-1 text-role-caption text-text-faint">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : views.length === 0 && emptyHint ? (
        // Settled and genuinely empty — an absence, so it teaches the next
        // action rather than rendering a bare `<ul>` with nothing in it.
        <p className="py-1 text-role-caption text-text-soft">{emptyHint}</p>
      ) : (
        <ul className="divide-y divide-border-hairline">
          {views.map((view) => (
            <li key={view.id} className="group flex items-center gap-2 py-1.5">
              {/* ds-raw-button */}
              <button
                type="button"
                onClick={() => onApply(readMediaViewPayload(view))}
                className="min-w-0 flex-1 truncate text-left text-role-caption font-semibold text-text-default hover:text-blue-700"
                title={view.name}
              >
                {view.name}
              </button>
              {view.is_shared ? (
                <span
                  className={cn(
                    'shrink-0 bg-emerald-50 px-1.5 py-0.5 text-role-micro text-emerald-700 ring-1 ring-inset ring-emerald-200',
                    cornerClass('chip'),
                  )}
                >
                  Shared
                </span>
              ) : null}
              <HoverTooltip label="Delete view" focusable={false}>
                {/* ds-raw-button */}
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await requestConfirm({
                      description: `Delete saved view "${view.name}"?`,
                      tone: 'danger',
                      confirmLabel: 'Delete',
                    });
                    if (ok) remove(view.id);
                  }}
                  aria-label={`Delete ${view.name}`}
                  className={cn(
                    'shrink-0 p-1 text-text-faint opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600',
                    cornerClass('flush'),
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </HoverTooltip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
