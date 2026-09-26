import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { STATION_CONTEXT_BOXED_CUBE_CLASS } from '@/components/station/entity-context/station-context-action-pill';

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

/** ## Media Library band cells — the ONE face for a chrome-row control here */
export const mediaBandCellGroupClass = 'flex shrink-0 items-stretch self-stretch [&>*+*]:-ml-px';

/** One chrome-row cell. `active` is the selected segment of a toggle group. */
export function mediaBandCellClass(active = false, extra?: string) {
  return cn(
    cn(STATION_CONTEXT_BOXED_CUBE_CLASS, 'self-stretch aspect-square'),
    active && 'bg-blue-600 text-white hover:bg-blue-600 hover:text-white',
    extra,
  );
}
