/**
 * Item record media face — the product thumb that sits in the title + details
 * band and expands that row's height.
 *
 * Ported verbatim from `receiving/workspace/station-scan-face.ts`, minus the
 * receiving name. Keep these as complete Tailwind literals so JIT sees every
 * class.
 */
export const ITEM_RECORD_FACE = {
  /** Image square */
  size: 'size-20',
  h: 'h-20',
  w: 'w-20',
  hw: 'h-20 w-20',
  minH: 'min-h-20',
  /** Thumb column (`size-20` = 5rem) | title + details */
  thumbGrid: 'grid-cols-[5rem_1fr]',
  /** Package placeholder inside an empty thumb cell */
  packageIcon: 'size-10',
} as const;
