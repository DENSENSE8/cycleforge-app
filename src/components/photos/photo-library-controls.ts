import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { STATION_CONTEXT_BOXED_CUBE_CLASS } from '@/components/station/entity-context/station-context-action-pill';

/**
 * Bordered control cluster — shared by view toggles and sort pills in the 40px
 * header. Flush-square: ops chrome is zero-radius (`source-of-truth.md` →
 * Workbench chrome flush), and the claim/move consumers that already passed
 * `!rounded-none` overrides now inherit it from here.
 */
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

/**
 * Flush claim/attach chrome overrides — the zero-radius, no-shadow, hairline
 * variant of the Media Library control cluster used by every embedded photo
 * ATTACH picker (Arrival claim, item Link, Zendesk claim / Move / Send). One
 * home so the three call sites stop re-declaring identical `!rounded-none`
 * strings that drift the moment one is edited.
 */
export const photoAttachControlGroupClass =
  '!rounded-none border-border-hairline !p-0 shadow-none';
export const photoAttachIconButtonClass = '!h-7 !w-7 !rounded-none border-border-hairline';
export const photoAttachDensityButtonClass = '!rounded-none shadow-none';

/**
 * ## Media Library band cells — the ONE face for a chrome-row control here
 *
 * `/ops/photos` runs two 28px chrome rows (`PRIMARY_CHROME_ROW_FACE`), and
 * before 2026-08-20 it put FOUR different control heights inside them: a 24px
 * Views trigger, a 28px inspector toggle, a 32px sort pill and refresh button,
 * and 34px bordered toggle groups (an `h-7` button wrapped in `border` +
 * `p-0.5`). Every one of the tall ones overflowed the band it sat in, so the
 * row read as a ragged parade rather than a strip of peers — and each group
 * carried its own inner rhythm (`p-0.5` inside, `gap-1` around, `gap-1.5`
 * between) so nothing lined up with anything.
 *
 * The house already answers this: {@link cn(STATION_CONTEXT_BOXED_CUBE_CLASS, 'self-stretch aspect-square')} is the
 * face for a workbench chrome-row icon cell, and it is `self-stretch
 * aspect-square` precisely so a cell tracks the row instead of pinning a size
 * that overflows it. These two exports are that token applied to this surface —
 * they add no visual language, they only stop this one from inventing a fifth
 * height.
 *
 * **A group carries no border and no padding of its own.** The CELLS carry the
 * hairline; the group only collapses the doubled seam between abutting cells
 * (`-ml-px`), which is the same abut grammar the station identity bar uses
 * (`gap-0`, cells share one rule). A bordered box around bordered buttons is
 * what made the old groups 34px tall.
 */
export const mediaBandCellGroupClass = 'flex shrink-0 items-stretch self-stretch [&>*+*]:-ml-px';

/** One chrome-row cell. `active` is the selected segment of a toggle group. */
export function mediaBandCellClass(active = false, extra?: string) {
  return cn(
    cn(STATION_CONTEXT_BOXED_CUBE_CLASS, 'self-stretch aspect-square'),
    active && 'bg-blue-600 text-white hover:bg-blue-600 hover:text-white',
    extra,
  );
}
