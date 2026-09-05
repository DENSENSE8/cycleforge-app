'use client';

/**
 * Notes region seated in the repair rail's `InspectorActionFloor` `above`
 * slot — read face, then TextField + Save/Cancel once the operator clicks it
 * (or picks the band's Notes verb).
 *
 * House primitives only: `TextField multiline` owns the textarea, `Button`
 * owns the commit pair. This is deliberately NOT a `*NotesComposer` shell —
 * that family is refused by the router (`composer.notes-composer`), and the
 * shipped panel it was borrowed from already moved off it (see
 * `ShippedPanelEditorDock`). The repair record still writes a scalar
 * `notes`, so a trail component is the wrong shape here.
 */

import { Check, Loader2 } from '@/components/Icons';
import { Button, TextField } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

interface RepairNotesRegionProps {
  /** Saved note when reading; the live draft while editing. */
  value: string;
  editing: boolean;
  isSaving?: boolean;
  onChange: (value: string) => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function RepairNotesRegion({
  value,
  editing,
  isSaving = false,
  onChange,
  onStartEdit,
  onCancel,
  onSubmit,
}: RepairNotesRegionProps) {
  if (!editing) {
    return (
      <div className="px-3 py-2">
        <HoverTooltip label="Click to edit" asChild>
          {/* ds-raw-button: full-width read face for the saved note; click swaps in the TextField */}
          <button
            type="button"
            onClick={onStartEdit}
            aria-label="Edit note"
            className={cn(
              'ds-raw-button block w-full px-3.5 py-2.5 text-left transition-colors hover:bg-surface-hover',
              cornerClass('flush'),
              focusRing('control', 'accent'),
            )}
          >
            <span className="block text-role-micro font-semibold text-text-faint">Notes</span>
            <div className="whitespace-pre-wrap text-sm font-medium leading-6 text-text-muted">
              {value}
            </div>
          </button>
        </HoverTooltip>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-3 py-2">
      <TextField
        label="Notes"
        multiline
        rows={4}
        value={value}
        onChange={onChange}
        autoFocus
        disabled={isSaving}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (!isSaving) onSubmit();
          }
        }}
      />
      <div className="flex items-center justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={isSaving}
          icon={
            isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )
          }
        >
          {isSaving ? 'Saving' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
