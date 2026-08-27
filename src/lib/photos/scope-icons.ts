/**
 * Media-library lifecycle scope → glyph.
 *
 * Every scope in `PHOTO_LIBRARY_SCOPE_TABS` names the surface that PRODUCED the
 * media, and most of those surfaces already own a glyph in the nav icon SoT
 * (`src/components/icons/stations.tsx`). Reusing them is the whole point: the
 * Unboxing facet and the Unbox bench must read as the same thing, or the rail
 * teaches a second vocabulary for an operation the operator already knows.
 *
 * **One stroke for the whole list.** These rows are an L2 *within* the Media
 * library page — the same layer as a station's mode rail — so they take the
 * heavier mode stroke (`icons/nav-weight.tsx`). The semantic `*Mode*` wrappers
 * already carry it; the two rows with no floor-station twin (`all`, `claims`)
 * wrap their primitive here rather than importing a page-stroke glyph, so no
 * row in the list reads lighter than its neighbours.
 *
 * Not every scope maps to a floor station, and that is fine — `claims` is
 * helpdesk paperwork (`Ticket`) and `all` is the page itself (`Images`, the same
 * glyph SIDEBAR_PAGE_NAV gives the `ops-photos` row).
 */

import {
  Images,
  PackageCheck,
  PackingModeStandard,
  ReceivingModePickup,
  ReceivingModeRepair,
  ReceivingModeUnbox,
  Ticket,
} from '@/components/Icons';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';

type IconComponent = (props: { className?: string }) => JSX.Element;

export const PHOTO_SCOPE_ICONS: Record<PhotoLibrarySourceScope, IconComponent> = {
  all: Images,
  unboxing: ReceivingModeUnbox,
  local_pickup: ReceivingModePickup,
  packing: PackingModeStandard,
  repair: ReceivingModeRepair,
  claims: Ticket,
  // Outbound media is the shipped-parcel evidence trail, so it takes the
  // Shipping station's glyph (PackageCheck) rather than any single shipping
  // MODE — the scope spans all of them. Wrapped from the PRIMITIVE, not from
  // `StationShipping`: that export is already page-stroked, and stacking a
  // second arbitrary `![stroke-width:…]` on top leaves both classes live.
  outbound: PackageCheck,
};
