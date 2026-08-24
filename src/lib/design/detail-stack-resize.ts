/**
 * Drag-to-resize contract for NON-MODAL detail inspectors (dashboard order
 * inspector, receiving More details). Modal occupants keep the fixed
 * `DETAIL_STACK_LAYOUT` width.
 *
 * `maxWidthPad` is the viewport the panel must leave behind, and it is derived,
 * not taste: the docked sidebar is 360px and the Pending grid's own minimum
 * content width is ~596px (the sum of its column tracks). 360 + 596 ~ 960, so
 * at 1440 the inspector caps near 480px and the queue stays readable; at 1920
 * it can reach ~960. Sizing past that trades the collection map for the
 * record, which is the trade this whole surface exists to avoid.
 *
 * Rescued out of `@/design-system/shells/detail-stack` (Warehouse-OS): the
 * frame budgets (`lib/right-rail/frame.ts`, `lib/canvas/tile-floors.ts`) are
 * domain math and must not reach into a shell.
 */
export const DETAIL_STACK_RESIZE = {
  storageKey: 'detail-inspector-width',
  /** Mirrors `DETAIL_STACK_LAYOUT.widthPx`. */
  defaultWidthPx: 420,
  minWidthPx: 360,
  maxWidthPadPx: 960,
} as const;
