import { cn } from '@/utils/_cn';

/** In-field ACTION CELL — the one face for a control riding inside a search field's trailing row: */

/**
 * Resting + hover tone. Split out because the collapse cell keeps `IconButton`
 * (which owns the box and the focus ring) and needs only this half.
 */
export const FIELD_ACTION_TONE_CLASS = 'text-text-faint hover:text-blue-600';

/**
 * The whole 24px cell, for a raw `<button>` shell. `transition-[opacity,color]`
 * rather than `transition-colors` so a hover-revealed cell (paste) fades with
 * the same curve its peers change color on.
 */
export const FIELD_ACTION_CLASS = cn(
  'inline-flex h-6 w-6 shrink-0 items-center justify-center transition-[opacity,color] duration-100 ease-out active:scale-95',
  FIELD_ACTION_TONE_CLASS,
);

/** 14px glyph inside the cell — never a bare `h-4` twin. */
export const FIELD_ACTION_GLYPH_CLASS = 'h-3.5 w-3.5';
