/** Warehouse tote-plate workspace layout pin (location / bay labels moved to `LocationLabelBuilder`). */

export const LABEL_BUILDER = {
  /** Inner content column — the same measure as StickyActionBar's default `maxWidth`. */
  contentShell: 'mx-auto w-full max-w-3xl',
  /** Page gutter around the main pane. */
  pagePad: 'px-4 pt-3 sm:px-6',
  /** Vertical rhythm inside the builder column. */
  stackGap: 'stack-row',
} as const;
