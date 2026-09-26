'use client';

/** Media Library **scope** — the lifecycle tabs plus the leading media-type cube. */

import { useMemo, useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, Folder, Loader2, Plus } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Input } from '@/components/ui/input';
import {
  FilterMenuGroupLabel,
  FilterMenuRow,
} from '@/components/ui/FilterMenu';
import { STATION_CONTEXT_BOXED_CUBE_CLASS } from '@/components/station/entity-context/station-context-action-pill';
import { cornerClass } from '@/design-system/tokens/radius';
import { useImageTypes } from '@/hooks/useImageTypes';
import { usePhotoLibraryUrlState } from '@/hooks/usePhotoLibraryUrlState';
import { BUILTIN_IMAGE_TYPE_KEYS } from '@/lib/photos/image-type-defs';
import {
  applySourceScopeTab,
  PHOTO_LIBRARY_SCOPE_TABS,
  PHOTO_LIBRARY_SCOPE_TAB_LABEL,
  sourceScopeFromFilters,
  type PhotoLibrarySourceScope,
} from '@/lib/photos/library-filter-state';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';


export interface PhotoLibraryScope {
  /** Lifecycle scopes, for the frame's tab row. */
  tabs: { id: string; label: string }[];
  /** Empty while a custom media type is active — see `activeSection` below. */
  activeTab: string;
  /** The ONE writer of `sourceScope` / `imageType`. Serves tabs AND the cube. */
  selectSection: (id: string) => void;
  /** The media-type overflow, for the tab row's `tabsLead`. */
  lead: ReactNode;
}

/** The scope control, as data for the frame. */
export function usePhotoLibraryScope(): PhotoLibraryScope {
  const { filters, patch } = usePhotoLibraryUrlState();
  const activeScope = sourceScopeFromFilters(filters);
  const { custom, isLoading: typesLoading, createType } = useImageTypes();

  /** ONE active value across both groups. */
  const activeSection = filters.imageType ?? activeScope;
  const activeTab = filters.imageType ? '' : activeScope;

  const selectSection = (id: string) => {
    if (id === 'all' || BUILTIN_IMAGE_TYPE_KEYS.has(id)) {
      patch(applySourceScopeTab(id as PhotoLibrarySourceScope));
      return;
    }
    patch({
      imageType: id,
      // Carried verbatim from the deleted rail: a custom type is its own scope,
      // so no lifecycle-derived refinement survives the switch. Leaving any of
      // these behind shows an empty result the operator cannot explain.
      sourceScope: undefined,
      stage: undefined,
      label: undefined,
      poRef: undefined,
      ticketId: undefined,
      receivingId: undefined,
      documentType: undefined,
      outboundMedia: undefined,
    });
  };

  // Paired glyph + label (`ui-design-system.md` → Icons:
  const tabs = PHOTO_LIBRARY_SCOPE_TABS.map((id) => ({
    id,
    label: PHOTO_LIBRARY_SCOPE_TAB_LABEL[id],
  }));

  const lead = useMemo(
    () => (
      <PhotoMediaTypePopover
        custom={custom}
        isLoading={typesLoading}
        activeKey={activeSection}
        onSelect={selectSection}
        onCreate={async (label) => {
          const created = await createType.mutateAsync({ label });
          selectSection(created.key);
        }}
      />
    ),
    // `selectSection` is redeclared each render (it closes over `patch`), so it is deliberately not a dep — the popover reads the latest…
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [custom, typesLoading, activeSection, createType],
  );

  return { tabs, activeTab, selectSection, lead };
}

/** The leading cube — same flush whisper face as Unbox's Band-1 pin-list cube: */
function PhotoMediaTypePopover({
  custom,
  isLoading,
  activeKey,
  onSelect,
  onCreate,
}: {
  custom: ReadonlyArray<{ key: string; label: string }>;
  isLoading: boolean;
  activeKey: string;
  onSelect: (key: string) => void;
  onCreate: (label: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const customActive = custom.some((type) => type.key === activeKey);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onCreate(trimmed);
      setName('');
      setAdding(false);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create media type');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setAdding(false);
          setName('');
        }
      }}
    >
      <HoverTooltip label="Media types" asChild>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Media types"
            aria-expanded={open}
            data-testid="photo-media-types"
            className={cn(
              STATION_CONTEXT_BOXED_CUBE_CLASS,
              'h-full aspect-square',
              (open || customActive) && 'bg-surface-sunken text-text-muted',
            )}
          >
            <Folder className="block h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
        </Popover.Trigger>
      </HoverTooltip>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className={cn(
            cn('z-dropdown w-64 border border-border-soft bg-surface-card p-1 shadow-lg ring-1 ring-black/5', focusRing('field', 'accent')),
            cornerClass('flush'),
          )}
        >
          <FilterMenuGroupLabel>Media types</FilterMenuGroupLabel>

          {isLoading && custom.length === 0 ? (
            <p className="flex items-center gap-2 px-2.5 py-1.5 text-role-caption text-text-faint">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading types…
            </p>
          ) : custom.length === 0 ? (
            <p className="px-2.5 py-1.5 text-role-caption text-text-faint">
              No custom media types yet
            </p>
          ) : (
            custom.map((type) => (
              <FilterMenuRow
                key={type.key}
                label={type.label}
                active={activeKey === type.key}
                onClick={() => {
                  setOpen(false);
                  onSelect(type.key);
                }}
              />
            ))
          )}

          {/* Inline create — the same DS input path `MediaSavedViewsSection` already uses on this surface. */}
          {adding ? (
            <div
              className={cn(
                'mt-1 space-y-1.5 border border-border-soft bg-surface-canvas p-2',
                cornerClass('flush'),
              )}
            >
              {/* The shadcn-lane field, not a hand-rolled `<input>`: */}
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                  if (e.key === 'Escape') setAdding(false);
                }}
                placeholder="Media type name…"
                aria-label="New media type name"
                data-testid="photo-media-type-name"
                className="h-7 px-2 text-role-caption"
              />
              <div className="flex items-center gap-1.5">
                {/* ds-raw-button */}
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!name.trim() || saving}
                  className={cn(
                    'flex items-center gap-1 bg-blue-600 px-2 py-1 text-role-micro uppercase tracking-widest text-white disabled:opacity-50',
                    cornerClass('flush'),
                  )}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Create
                </button>
                {/* ds-raw-button */}
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className={cn(
                    'px-2 py-1 text-role-micro uppercase tracking-widest text-text-faint hover:text-text-muted',
                    cornerClass('flush'),
                  )}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* ds-raw-button */
            <button
              type="button"
              onClick={() => setAdding(true)}
              data-testid="photo-media-type-add"
              className={cn(
                'mt-1 flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-role-caption font-medium text-blue-700 hover:bg-surface-hover',
                cornerClass('flush'),
              )}
            >
              <Plus className="h-3.5 w-3.5" /> Add media type
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
