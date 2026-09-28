'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Plus, Tag } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { cn } from '@/utils/_cn';
import { useLabels } from '@/hooks/useLabels';
import { labelChipClasses } from '@/lib/photos/label-colors';
import { toast } from '@/lib/toast';
import type { LibraryPhoto } from './photo-library-types';
import { focusRing } from '@/design-system/tokens/focus-ring';


type TriState = 'all' | 'some' | 'none';

/** How many of the target photos already carry this label. */
function initialState(photos: LibraryPhoto[], labelId: number): TriState {
  if (photos.length === 0) return 'none';
  let count = 0;
  for (const p of photos) {
    if ((p.labels ?? []).some((l) => l.id === labelId)) count += 1;
  }
  if (count === 0) return 'none';
  if (count === photos.length) return 'all';
  return 'some';
}

/** Label editor — applies labels to one photo (PUT replace) or many (bulk add/remove diff). */
export function PhotoLabelEditor({
  photos,
  scopeImageType,
  onClose,
}: {
  photos: LibraryPhoto[];
  scopeImageType?: string;
  onClose: () => void;
}) {
  const { labels, isLoading, createLabel, setPhotoLabels, bulkApply } = useLabels(scopeImageType);
  const single = photos.length === 1;

  // Explicit user toggles, keyed by label id; absent = "leave as-is".
  const [desired, setDesired] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  /** Inline "New label" composer — replaces the retired `window.prompt`. */
  const [addingLabel, setAddingLabel] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const creatingLabel = createLabel.isPending;

  const initial = useMemo(() => {
    const map = new Map<number, TriState>();
    for (const l of labels) map.set(l.id, initialState(photos, l.id));
    return map;
  }, [labels, photos]);

  const isChecked = (labelId: number): boolean => {
    if (labelId in desired) return desired[labelId];
    return initial.get(labelId) === 'all';
  };
  const isIndeterminate = (labelId: number): boolean =>
    !(labelId in desired) && initial.get(labelId) === 'some';

  const toggle = (labelId: number) => {
    setDesired((prev) => {
      const next = { ...prev };
      const current = labelId in prev ? prev[labelId] : initial.get(labelId) === 'all';
      next[labelId] = !current;
      return next;
    });
  };

  /** Inline create — the same DS input path `MediaSavedViewsSection` and the Band-1 media-type cube use. */
  const addLabel = async () => {
    const name = newLabel.trim();
    if (!name || creatingLabel) return;
    try {
      const created = await createLabel.mutateAsync({ label: name, scopeImageType });
      setDesired((prev) => ({ ...prev, [created.id]: true }));
      setNewLabel('');
      setAddingLabel(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create label');
    }
  };

  const apply = async () => {
    setSaving(true);
    try {
      if (single) {
        const labelIds = labels.filter((l) => isChecked(l.id)).map((l) => l.id);
        await setPhotoLabels.mutateAsync({ photoId: photos[0].id, labelIds });
      } else {
        const addLabelIds: number[] = [];
        const removeLabelIds: number[] = [];
        for (const l of labels) {
          if (!(l.id in desired)) continue; // untouched mixed/all/none — leave alone
          (desired[l.id] ? addLabelIds : removeLabelIds).push(l.id);
        }
        if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
          onClose();
          return;
        }
        await bulkApply.mutateAsync({ photoIds: photos.map((p) => p.id), addLabelIds, removeLabelIds });
      }
      toast.success(single ? 'Labels updated' : `Labels applied to ${photos.length} photos`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply labels');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      {/* No `sm:rounded-2xl` override — DialogContent's own shell is already
          flush (`cornerClass('flush')`), and that override was the one thing
          making this editor soft at `sm+`. */}
      <DialogContent hideClose className="max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-border-hairline px-4 py-3">
          <Tag className="h-4 w-4 text-text-soft" />
          <DialogTitle className="text-sm font-semibold text-text-default">
            {single ? 'Edit labels' : `Label ${photos.length} photos`}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto px-4 py-3">
          {isLoading && labels.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-role-caption text-text-faint">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading labels…
            </div>
          ) : labels.length === 0 ? (
            <div
              className={cn(
                'border border-dashed border-border-soft bg-surface-canvas inset-empty text-center text-role-caption text-text-soft',
                cornerClass('flush'),
              )}
            >
              No labels yet. Create one to get started.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {labels.map((lbl) => {
                const checked = isChecked(lbl.id);
                const indeterminate = isIndeterminate(lbl.id);
                return (
                  // ds-raw-button: tri-state label toggle chip (aria-pressed + indeterminate ring + per-label color classes), not a single-variant Button
                  <button
                    key={lbl.id}
                    type="button"
                    onClick={() => toggle(lbl.id)}
                    aria-pressed={checked}
                    className={cn(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 text-role-micro transition',
                      cornerClass('chip'),
                      labelChipClasses(lbl.color),
                      checked
                        ? 'ring-2 ring-offset-1 ring-blue-500'
                        : indeterminate
                          ? 'opacity-60 ring-1 ring-dashed ring-border-emphasis'
                          : 'opacity-50 hover:opacity-90',
                    )}
                  >
                    {checked ? <Check className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
                    {lbl.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border-hairline px-4 py-3 sm:justify-between">
          {addingLabel ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <input
                autoFocus
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addLabel();
                  if (e.key === 'Escape') setAddingLabel(false);
                }}
                placeholder="Label name…"
                aria-label="New label name"
                data-testid="photo-label-name"
                className={cn(
                  cn('min-w-0 flex-1 border border-border-soft bg-surface-card px-2 py-1 text-role-caption text-text-default', focusRing('field', 'accent')),
                  cornerClass('flush'),
                )}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => void addLabel()}
                disabled={!newLabel.trim() || creatingLabel}
                icon={
                  creatingLabel ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )
                }
              >
                Create
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAddingLabel(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddingLabel(true)}
              icon={<Plus className="h-3.5 w-3.5" />}
              data-testid="photo-label-add"
            >
              New label
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={apply}
              disabled={saving}
              icon={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            >
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
