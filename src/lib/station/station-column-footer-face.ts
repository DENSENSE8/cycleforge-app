/**
 * Top-edge seam for every station-column **footer** band — Context filter /
 * recent receiving, utility `<-|`, Displays `->|`, Unbox dock Band 2, spine
 * sign-in. One `border-t` + `border-border-hairline` so the floor hairline
 * reads as a continuous Y across columns.
 *
 * Rescued out of `@/components/layout/header-shell` (Warehouse-OS) so the
 * station column-geometry SoT (`lib/station/workbench-layout.ts`) does not
 * reach into a page shell for a class string.
 */
const STATION_COLUMN_FOOTER_SEAM_CLASS = 'border-t border-border-hairline';

/**
 * Shared `h-8` footer band + the seam above.
 * Pad / justify are consumer-local (`mt-auto`, `justify-center`, `px-2`, ...).
 */
export const STATION_COLUMN_FOOTER_BAND_FACE = `flex h-8 w-full shrink-0 items-center ${STATION_COLUMN_FOOTER_SEAM_CLASS}`;
