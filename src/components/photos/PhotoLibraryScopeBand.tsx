'use client';

/**
 * Media Library **Band 1** — the lifecycle tab rail plus the leading media-type
 * cube. This file is the SINGLE WRITER of `sourceScope` / `imageType` on this
 * surface, and that is the whole point of it being one file.
 *
 * ## The reversal this performs (2026-08-09)
 *
 * Until today the scope control lived in a resident left rail
 * (`PhotoLibrarySidebarPanel`), whose docblock said it was "the ONLY writer of
 * `sourceScope` / `imageType` (2026-07-29)" and forbade a scope control in the
 * chrome. That ban was earned: a chrome media-type dropdown had shipped whose
 * built-in rows were byte-for-byte the rail's source scopes, so **two controls
 * wrote one param and could disagree**. The remedy chosen then was "delete one,
 * and the survivor is the rail."
 *
 * The **invariant is kept and the survivor is swapped**: the rail is deleted,
 * `/ops/photos` is rail-less (Pattern E), and Band 1 is now the one writer.
 * "Exactly one writer" was always the law; "the writer must be a rail" never
 * was. Deleting the rail *before* porting the tabs is what makes the two-writer
 * state unreachable rather than temporary.
 *
 * ## Why the tabs and the cube share one component
 *
 * They answer one question — *which media am I looking at* — and they are
 * mutually exclusive: picking a custom type clears the lifecycle scope, and
 * picking a lifecycle tab clears the custom type. Splitting them across two
 * files would be two writers of one param sitting one import apart, which is
 * exactly the 2026-07-29 shape. One `selectSection` serves both groups.
 *
 * Band-1 **trailing is deliberately empty**: this surface has no import / add /
 * return-to-scan CTA, and honest absence beats an invented one.
 *
 * SoT: `.claude/rules/display/media-library.md`.
 */

import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, Folder, Loader2, Plus } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  WorkbenchChromeHeader,
  WORKBENCH_CHROME_PILL_CLASS,
} from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
} from '@/components/dashboard/workbench-filter-popover';
import { STATION_CONTEXT_BOXED_CUBE_CLASS } from '@/components/station/entity-context/station-context-action-pill';
import { cornerClass } from '@/design-system/tokens/radius';
import { useImageTypes } from '@/hooks/useImageTypes';
import { usePhotoLibraryUrlState } from '@/hooks/usePhotoLibraryUrlState';
import { BUILTIN_IMAGE_TYPE_KEYS } from '@/lib/photos/image-type-defs';
import { PHOTO_SCOPE_ICONS } from '@/lib/photos/scope-icons';
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


export function PhotoLibraryScopeBand({ className }: { className?: string }) {
  const { filters, patch } = usePhotoLibraryUrlState();
  const activeScope = sourceScopeFromFilters(filters);
  const { custom, isLoading: typesLoading, createType } = useImageTypes();

  /**
   * ONE active value across both groups. A custom type deselects every
   * lifecycle tab (empty `activeTab`), which is the honest render: the stream
   * is scoped by media type, not by lifecycle, and lighting a tab would claim a
   * filter that is not applied.
   */
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

  // Paired glyph + label (`ui-design-system.md` → Icons: structural and
  // paired). These are not lifecycle STAGES of one collection (Queue · Viewed ·
  // History, where a glyph would be decoration) — each one names a physical
  // station the operator already knows by its glyph, and `scope-icons.ts` was
  // authored for exactly this pairing so the Unboxing facet and the Unbox bench
  // read as the same thing.
  const tabs = PHOTO_LIBRARY_SCOPE_TABS.map((id) => ({
    id,
    label: PHOTO_LIBRARY_SCOPE_TAB_LABEL[id],
    icon: PHOTO_SCOPE_ICONS[id],
  }));

  return (
    <WorkbenchChromeHeader
      density="band"
      className={cn('rounded-none border-l-0 border-t-0 shadow-sm', className)}
      leading={
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
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={selectSection}
      solidTone="accent"
    />
  );
}

/**
 * The leading cube — same shape as Unbox's Band-1 pin-list cube: a boxed
 * control abutting the tab rail (`gap-0`, no host air), never a naked header
 * glyph and never a soft pill.
 *
 * Seven built-in scopes plus N operator-defined types cannot all be tabs — the
 * facets overflowing this row and clipping its own right controls is recorded
 * history on this surface. The custom half therefore lives one click deep, in
 * the SAME band, because promoting it to its own control altitude would rebuild
 * the split the 2026-07-29 ruling closed.
 */
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
              (open || customActive) && 'bg-surface-hover text-text-muted',
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
          <WorkbenchFilterGroupLabel>Media types</WorkbenchFilterGroupLabel>

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
              <WorkbenchFilterMenuRow
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

          {/*
            Inline create — the same DS input path `MediaSavedViewsSection`
            already uses on this surface. It replaces a `window.prompt`, which
            is a native dialog the house bans (it steals keyboard-wedge focus
            and cannot be styled or tested).
          */}
          {adding ? (
            <div
              className={cn(
                'mt-1 space-y-1.5 border border-border-soft bg-surface-canvas p-2',
                cornerClass('flush'),
              )}
            >
              <input
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
                className={cn(
                  cn('w-full border border-border-soft bg-surface-card px-2 py-1 text-role-caption text-text-default', focusRing('field', 'accent')),
                  cornerClass('flush'),
                )}
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
                WORKBENCH_CHROME_PILL_CLASS,
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
