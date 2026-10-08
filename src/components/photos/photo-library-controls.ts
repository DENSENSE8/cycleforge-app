import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/** Bordered control cluster — shared by view toggles and sort pills in the 40px header. */
export const photoLibraryControlGroupClass = cn(
  'flex items-center border border-border-soft bg-surface-card p-0.5',
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

/** Flush claim/attach chrome overrides — the zero-radius, no-shadow, hairline variant of the Media Library control cluster used by every… */
export const photoAttachControlGroupClass =
  '!rounded-none border-border-hairline !p-0 shadow-none';
export const photoAttachIconButtonClass = '!h-7 !w-7 !rounded-none border-border-hairline';
export const photoAttachDensityButtonClass = '!rounded-none shadow-none';
