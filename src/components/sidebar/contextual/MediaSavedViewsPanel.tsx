'use client';

/**
 * Media Library saved views — one-click blocks at the top of the left
 * contextual sidebar (operator 2026-10-08: "moving views from the top … into
 * the left contextual sidebar"). Server-backed (`/api/photos/saved-views`,
 * personal, or org-wide for `photos.manage`). Applying a view rewrites the
 * URL — the list's source of truth — in one write. The lit block is the view
 * the URL matches; pressing it again returns to the unfiltered library.
 * `Save view` shows only while the URL holds something no view matches.
 */

import { useState } from 'react';
import { Bookmark, Plus, X } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { requestConfirm } from '@/design-system/components/confirm';
import { Button } from '@/design-system/primitives/Button';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { IconButton } from '@/design-system/primitives/IconButton';
import { TextField } from '@/design-system/primitives/TextField';
import { readMediaViewPayload, useMediaLibrarySavedViews } from '@/hooks/useMediaLibrarySavedViews';
import { usePhotoLibraryUrlState } from '@/hooks/usePhotoLibraryUrlState';
import {
  DEFAULT_PHOTO_LIBRARY_VIEW,
  photoLibraryUrlParams,
  type PhotoLibraryFilterState,
  type PhotoLibraryViewMode,
} from '@/lib/photos/library-filter-state';
import { cn } from '@/utils/_cn';
import { NAV_BLOCK_CLASS, NAV_CHOICE_SELECTED_CLASS } from './nav-block';

/** The URL a view would write — two states are the same view when these match (defaults are omitted, so the bare library is ''). */
function viewKey(filters: PhotoLibraryFilterState, view: PhotoLibraryViewMode): string {
  return photoLibraryUrlParams(filters, { view, page: 1 }).toString();
}

export function MediaSavedViewsPanel() {
  const { user, has } = useAuth();
  const canShare = has('photos.manage');
  const { filters, display, applyView } = usePhotoLibraryUrlState();
  const { views, isLoading, create, creating, remove } = useMediaLibrarySavedViews();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [shareWithOrg, setShareWithOrg] = useState(false);

  const currentKey = viewKey(filters, display.view);
  const activeId =
    views.find((view) => {
      const payload = readMediaViewPayload(view);
      return viewKey(payload.filters, payload.view) === currentKey;
    })?.id ?? null;
  const savable = currentKey !== '' && activeId === null;

  if (isLoading || (views.length === 0 && !savable)) return null;

  const closeNaming = () => {
    setNaming(false);
    setName('');
    setShareWithOrg(false);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    create(
      {
        name: trimmed,
        filters: { schemaVersion: 1, filters, view: display.view },
        isShared: canShare && shareWithOrg,
      },
      { onSuccess: closeNaming },
    );
  };

  return (
    <section aria-label="Saved views" data-media-saved-views className="flex flex-col gap-px px-2 pt-2">
      {views.map((view) => {
        const active = view.id === activeId;
        const mine = view.staff_id === user?.staffId;
        return (
          <div key={view.id} className="group/view relative">
            {/* ds-raw-button: sidebar nav block (NAV_BLOCK_CLASS lift/sink face), the same pressable row as view and filter rows */}
            <button
              type="button"
              aria-pressed={active}
              title={view.name}
              onClick={() => {
                if (active) {
                  applyView({}, DEFAULT_PHOTO_LIBRARY_VIEW);
                  return;
                }
                const payload = readMediaViewPayload(view);
                applyView(payload.filters, payload.view);
              }}
              className={cn(NAV_BLOCK_CLASS, 'h-8 text-role-caption', mine && 'pr-8', active && NAV_CHOICE_SELECTED_CLASS)}
            >
              <Bookmark aria-hidden className="size-3.5 shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1 truncate">{view.name}</span>
              {view.is_shared ? <span className="shrink-0 text-role-micro text-text-faint">Shared</span> : null}
            </button>
            {mine ? (
              <IconButton
                icon={<X className="size-3" />}
                ariaLabel={`Delete view ${view.name}`}
                size="xs"
                radius="control"
                onClick={async () => {
                  const ok = await requestConfirm({
                    description: `Delete saved view "${view.name}"?`,
                    tone: 'danger',
                    confirmLabel: 'Delete',
                  });
                  if (ok) remove(view.id);
                }}
                className="absolute right-1 top-1 text-text-faint opacity-0 transition-opacity hover:text-text-default focus-visible:opacity-100 group-hover/view:opacity-100"
              />
            ) : null}
          </div>
        );
      })}

      {savable && naming ? (
        <div className="flex flex-col gap-2 py-1">
          <TextField
            label="View name"
            value={name}
            onChange={setName}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
              if (event.key === 'Escape') closeNaming();
            }}
          />
          {canShare ? (
            <label className="flex items-center gap-2 px-1 text-role-caption text-text-muted">
              <Checkbox checked={shareWithOrg} onCheckedChange={(checked) => setShareWithOrg(checked === true)} />
              Share with org
            </label>
          ) : null}
          <div className="flex items-center gap-1.5">
            <Button variant="primary" size="sm" loading={creating} disabled={!name.trim()} onClick={submit}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={closeNaming}>
              Cancel
            </Button>
          </div>
        </div>
      ) : savable ? (
        // ds-raw-button: sidebar nav block (NAV_BLOCK_CLASS), the Save view row shown only while unsaved filters are on
        <button
          type="button"
          onClick={() => setNaming(true)}
          className={cn(NAV_BLOCK_CLASS, 'h-8 text-role-caption text-text-muted')}
        >
          <Plus aria-hidden className="size-3.5 shrink-0" />
          Save view
        </button>
      ) : null}
    </section>
  );
}
