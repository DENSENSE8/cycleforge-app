import { cn } from '@/utils/_cn';

/**
 * A list item's state outline (selected, open, hover) must be geometry, not
 * shadow paint. `ring-*` is a box-shadow drawn outside the border box (or, for
 * `ring-inset`, at its edge); any scroll container — `overflow-y-auto` turns
 * the other axis to `auto` too — clips it, so the hairline goes missing at the
 * list's edge. This overlay is a real border INSIDE the item: nothing paints
 * past the item, so no scrollport can cut it, whatever its padding.
 *
 * Mount it as the item's last child; the item must be `relative`. The corner
 * follows the item's own radius.
 */
export const STATE_OUTLINE_CLASS = 'pointer-events-none absolute inset-0 z-30 box-border rounded-[inherit] border border-transparent';

/** RecordCard's outline: hairline on hover, strong when open, two-pixel info when checked. */
export function recordCardOutlineClass({ selected, open }: { selected: boolean; open: boolean }): string {
  return cn(
    STATE_OUTLINE_CLASS,
    'rounded-2xl',
    selected
      ? 'border-2 border-fill-info'
      : open
        ? 'border-border-strong'
        : 'group-hover/card:border-border-soft',
  );
}
