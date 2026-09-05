'use client';

/**
 * Media Library **scope** — the lifecycle tabs plus the leading media-type
 * cube. This file is the SINGLE WRITER of `sourceScope` / `imageType` on this
 * surface, and that is the whole point of it being one file.
 *
 * ## It is no longer a band (2026-08-31)
 *
 * It was Band 1 of a three-band chrome stack. The page now wears the design
 * system's one page frame ({@link DeskPageChrome}), so the tabs ride the
 * frame's tab row and the cube rides that row's `tabsLead` — the SAME row, in
 * the same order, one altitude up.
 *
 * The single-writer law is why this is a HOOK plus a component rather than two
 * components handed to the frame separately. `usePhotoLibraryScope` owns
 * `selectSection`; the page threads its tabs into the frame and renders its
 * cube into the lead. Both halves still resolve from one function in one file,
 * which is the invariant — not the fact that they used to share a `<div>`.
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
 * Header CTAs (Export · Add photos) register via {@link DeskActionSlotRegistrar}
 * from `PhotoLibraryDeskActions` — this band only owns the tab row + type cube.
 */

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
import { Button } from '@/design-system/primitives/Button';


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

/**
 * The scope control, as data for the frame.
 *
 * Returns the tab list, the lit tab and the one `selectSection` that writes
 * both halves — plus the cube already wired to it, so a caller cannot mount the
 * overflow against a different writer.
 */
export function usePhotoLibraryScope(): PhotoLibraryScope {
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
    // `selectSection` is redeclared each render (it closes over `patch`), so it
    // is deliberately not a dep — the popover reads the latest through the
    // element it is rebuilt into whenever the values below change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [custom, typesLoading, activeSection, createType],
  );

  return { tabs, activeTab, selectSection, lead };
}

/**
 * The leading cube — same flush whisper face as Unbox's Band-1 pin-list cube:
 * abutting the tab rail (`gap-0`, no host air, no rest-state box), never a
 * naked header glyph and never a soft pill.
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            radius="flush"
            icon={<Folder className="block h-3.5 w-3.5 shrink-0" aria-hidden />}
            aria-label="Media types"
            aria-expanded={open}
            data-testid="photo-media-types"
            className={cn(
              STATION_CONTEXT_BOXED_CUBE_CLASS,
              'h-full aspect-square',
              (open || customActive) && 'bg-surface-sunken text-text-muted',
            )}
          />
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
              {/*
                The shadcn-lane field, not a hand-rolled `<input>`: this is a
                labelled field inside an overlay, which is exactly the lane
                `ui/input` is pinned for. It carried its own border / bg /
                focus-ring stack that restated what the primitive already owns.
                Height is trimmed to the popover's density — the only thing this
                surface actually needed to say.
              */}
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
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  radius="flush"
                  icon={
                    saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )
                  }
                  onClick={() => void submit()}
                  disabled={!name.trim() || saving}
                  className="px-2 py-1 text-role-micro uppercase tracking-widest"
                >
                  Create
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  radius="flush"
                  onClick={() => setAdding(false)}
                  className="px-2 py-1 text-role-micro uppercase tracking-widest text-text-faint hover:text-text-muted"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              radius="flush"
              icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => setAdding(true)}
              data-testid="photo-media-type-add"
              className="mt-1 flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-role-caption font-medium text-blue-700 hover:bg-surface-hover"
            >
              Add media type
            </Button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
