/**
 * PO line header media face — product thumb that sits in the title + details
 * band and expands that row’s height. Distinct from the joined serial bar
 * instrument (`h-11`), which stays compact under the header.
 *
 * Keep these as complete Tailwind literals so JIT sees every class.
 */
export const PO_LINE_HEADER_FACE = {
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
