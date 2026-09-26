'use client';

import { Check } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * Shared inset for the tile hover check and the entity-band select-all —
 * keep them on one vertical line (Google Photos alignment).
 */
const PHOTO_SELECTION_MARK_INSET_X = 'left-2' as const;
/** Left pad on {@link PhotoEntityGroupHeader} — matches {@link PHOTO_SELECTION_MARK_INSET_X}. */
export const PHOTO_ENTITY_GROUP_HEADER_PL = 'pl-2' as const;

/** The hover/active selection checkmark. */
export function SelectionMark({
  checked,
  active,
  onToggle,
}: {
  checked: boolean;
  active: boolean;
  /** Forwards the Shift modifier so a shift-click on the mark extends a range. */
  onToggle: (mods: { shift: boolean }) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={checked ? 'Deselect photo' : 'Select photo'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle({ shift: e.shiftKey });
      }}
      className={cn(
        'ds-raw-button absolute top-2 z-20 inline-flex h-6 w-6 items-center justify-center border shadow-sm transition',
        PHOTO_SELECTION_MARK_INSET_X,
        // Google Photos selection token — circular check (operator 2026-09-01).
        // Same face on {@link GroupSelectionMark}.
        cornerClass('pill'),
        checked
          ? 'border-blue-600 bg-blue-600 text-white opacity-100'
          : cn(
              'border-white/80 bg-surface-card/90 text-text-faint backdrop-blur-sm hover:border-blue-200 hover:text-blue-600 focus:opacity-100',
              active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            ),
      )}
    >
      <Check className="h-3.5 w-3.5 stroke-[2.5]" />
    </button>
  );
}
