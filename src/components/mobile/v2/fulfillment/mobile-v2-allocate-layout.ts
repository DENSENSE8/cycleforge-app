/**
 * Filters stay at the top of the queue scrollport. `z-sticky` is above row
 * `z-content` and below shell `z-header`; `isolate` keeps row transforms from
 * entering the filter band's stacking context. The host deliberately paints
 * no canvas: rounded controls float over the queue like map controls, while
 * the gaps remain transparent to the table below.
 */
export const MOBILE_V2_ALLOCATE_FILTER_BAR_CLASS =
  'pointer-events-none sticky top-0 z-sticky isolate bg-transparent';

/**
 * Allocate detail labels preserve the sentence case written by product copy.
 * Do not add Tailwind's `uppercase` utility here: it applies
 * `text-transform: uppercase` after the label has been rendered.
 */
export const MOBILE_V2_ALLOCATE_FACT_LABEL_CLASS =
  'truncate text-[10px] font-semibold text-text-faint';

export const MOBILE_V2_ALLOCATE_SECTION_LABEL_CLASS =
  'text-xs font-semibold text-text-faint';
