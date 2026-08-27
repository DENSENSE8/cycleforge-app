'use client';

import { useState } from 'react';
import { Loader2, Plus, Tag, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useLabels } from '@/hooks/useLabels';
import { labelChipClasses } from '@/lib/photos/label-colors';
import { toast } from '@/lib/toast';
import { focusRing } from '@/design-system/tokens/focus-ring';


/**
 * Labels — the library's orthogonal refinement axis, rendered below the image-type
 * navigator in the sidebar. One photo has one type but many labels; clicking a
 * label chip narrows the grid to photos carrying it (`?label=`). The "+" adds a
 * custom label. System labels (seeded listing angles) are non-deletable.
 *
 * Scoped to the active image type when one is selected (its labels + globals),
 * so the listing flow surfaces its angle labels first.
 */
export function PhotoLabelsSection({
  activeLabel,
  scopeImageType,
  onSelect,
}: {
  activeLabel: string | null;
  scopeImageType?: string;
  onSelect: (labelKey: string | undefined) => void;
}) {
  const { labels, isLoading, createLabel } = useLabels(scopeImageType);
  const [adding, setAdding] = useState(false);
  /** Inline composer — replaces a native prompt (2026-08-09). */
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');

  /**
   * Inline create — the DS input path this surface uses everywhere else
   * (`MediaSavedViewsSection`, the Band-1 media-type cube, `PhotoLabelEditor`).
   * It replaced a `window.prompt`: a native dialog is unstyleable, untestable,
   * and steals keyboard-wedge focus. Pinned by
   * `media-library-chrome.guard.test.ts`.
   */
  const addLabel = async () => {
    const name = draft.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const created = await createLabel.mutateAsync({ label: name, scopeImageType });
      setDraft('');
      setComposing(false);
      onSelect(created.key);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create label');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Labels</p>
        <div className="flex items-center gap-1">
          {activeLabel ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelect(undefined)}
              icon={<X className="h-3.5 w-3.5" />}
              className="-my-1 h-7 gap-1 px-2 text-role-micro uppercase tracking-wider text-text-faint hover:text-text-muted"
            >
              Clear
            </Button>
          ) : null}
          <HoverTooltip label="Add label" asChild>
            <IconButton
              onClick={() => setComposing((open) => !open)}
              disabled={adding}
              ariaLabel="Add label"
              aria-expanded={composing}
              icon={adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              className={cn(
                '-my-1 inline-flex h-7 w-7 items-center justify-center text-text-faint hover:bg-surface-sunken hover:text-text-muted disabled:opacity-40',
                cornerClass('flush'),
              )}
            />
          </HoverTooltip>
        </div>
      </div>

      {composing ? (
        <div className="px-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addLabel();
              if (e.key === 'Escape') setComposing(false);
            }}
            onBlur={() => {
              if (!draft.trim()) setComposing(false);
            }}
            placeholder="Label name…"
            aria-label="New label name"
            data-testid="photo-labels-section-name"
            className={cn(
              cn('w-full border border-border-soft bg-surface-card px-2 py-1 text-role-caption text-text-default', focusRing('field', 'accent')),
              cornerClass('flush'),
            )}
          />
        </div>
      ) : null}

      {isLoading && labels.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-1.5 text-role-caption text-text-faint">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : labels.length === 0 ? (
        <p className="px-3 py-1.5 text-role-caption text-text-faint">No labels yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 px-1">
          {labels.map((lbl) => {
            const active = activeLabel === lbl.key;
            return (
              <button
                key={lbl.id}
                type="button"
                onClick={() => onSelect(active ? undefined : lbl.key)}
                aria-pressed={active}
                className={cn(
                  // ds-raw-button — filter toggle chip with dynamic per-label color; not expressible via Button/IconButton.
                  'ds-raw-button inline-flex items-center gap-1 px-1.5 py-0.5 text-role-micro uppercase tracking-widest transition',
                  cornerClass('chip'),
                  labelChipClasses(lbl.color),
                  active ? 'ring-2 ring-offset-1 ring-blue-500' : 'hover:opacity-80',
                )}
              >
                <Tag className="h-3 w-3" />
                {lbl.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
