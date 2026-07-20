/**
 * Station bookmark chrome — flush under GlobalHeader.
 *
 * All corners convex-rounded (`rounded-xl`). Full soft border. Inner pad + icon
 * gap match GlobalHeader via {@link HEADER_INSET_X} / {@link HEADER_ICON_GAP}
 * (header-shell SoT) — one spacing integer across both chrome planes.
 */
import { HEADER_ICON_GAP } from '@/components/layout/header-shell';

export const receivingStationBookmarkPanelClass =
  'rounded-xl border border-border-soft shadow-none';

/** Inner pad for identity + more-details bookmark faces (matches icon-gap unit). */
export const receivingStationBookmarkPadClass = 'p-0.5';

/** Gap between icons / chips inside a bookmark — same integer as GlobalHeader. */
export const receivingStationBookmarkGapClass = HEADER_ICON_GAP;
