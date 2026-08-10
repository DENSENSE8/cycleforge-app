import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * Bordered control cluster — shared by view toggles and sort pills in the 40px
 * header. Flush-square: ops chrome is zero-radius (`source-of-truth.md` →
 * Workbench chrome flush), and the claim/move consumers that already passed
 * `!rounded-none` overrides now inherit it from here.
 */
export const photoLibraryControlGroupClass = cn(
  'flex items-center border border-border-soft bg-surface-card p-0.5',
  cornerClass('flush'),
);

export function photoLibraryControlButtonClass(active: boolean, extra?: string) {
  return cn(
    'flex h-7 items-center justify-center text-role-micro font-semibold leading-none transition-colors',
    cornerClass('flush'),
    active
      ? 'bg-blue-600 text-white shadow-sm'
      : 'text-text-soft hover:bg-surface-sunken hover:text-text-default',
    extra,
  );
}
