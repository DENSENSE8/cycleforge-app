/**
 * MasterNav pin drop ids — map rows drag *into* the Pinned cluster;
 * pins reorder only inside that cluster.
 */

import { masterNavItemForHref } from '@/lib/sidebar-navigation';

export const MASTER_NAV_PIN_DROP_ID = 'master-nav-pin-drop';

/**
 * The whole nav scrollport, as a drop target for a pin being dragged OUT.
 *
 * Dropping a pin anywhere in the map unpins it, and it reappears in its home
 * section — which is re-derived from the registry (`pagesNotPinned`), never
 * remembered on the pin. That is why "drag out" needs no return-slot bookkeeping
 * and cannot strand a row in the wrong group.
 *
 * `pinCollisionDetection` biases pin targets ahead of this one, so a drop
 * inside the Pinned cluster still reorders rather than unpinning.
 */
export const MASTER_NAV_PIN_RETURN_ID = 'master-nav-pin-return';

/**
 * The two ends of the shelf, as their own drop targets.
 *
 * Without them the extremes were unreachable: the cluster container and the pin
 * rows are both drop targets, so a release in the group's own padding — the
 * band above the first row, or below the last — resolved to the CONTAINER,
 * whose only answer is "append". Dropping a pin at the top of the shelf
 * therefore sent it to the bottom, and the first slot could only be reached by
 * repeatedly swapping upward one row at a time.
 *
 * A thin strip at each end answers precisely, and paints an insertion line
 * while the pointer is over it, so the operator sees where the row will land
 * before releasing.
 */
export const MASTER_NAV_PIN_EDGE_TOP = 'master-nav-pin-edge-top';
export const MASTER_NAV_PIN_EDGE_BOTTOM = 'master-nav-pin-edge-bottom';

export type NavPinDragData = {
  type: 'nav';
  href: string;
  label: string;
  iconKey?: string;
};

export type PinReorderDragData = {
  type: 'pin';
  id: string;
};

export function navPinDragId(pageId: string): string {
  return `nav:${pageId}`;
}

export function pinRowDragId(pinId: string): string {
  return `pin:${pinId}`;
}

/**
 * Home is the only row that cannot be pinned.
 *
 * It is the spine's root, it is already the first row on the map, and a pin
 * that points at `/` is a shortcut to the place you are shortcutting FROM.
 *
 * Media Library used to be structural too, on the grounds that it "already sits
 * above Pinned". That reasoning inverted the model: sitting above Pinned by
 * fiat is exactly what a pin is for, and hard-coding one tool into that slot
 * spent premium spine real estate that no operator could reclaim. It is now an
 * ordinary pinnable row — staff who live in it hoist it themselves, and staff
 * who never open it can let it sit in the map with everything else.
 */
export function isStructuralSpinePinHref(href: string): boolean {
  return masterNavItemForHref(href)?.id === 'home';
}

export function isPinDropOverId(overId: string): boolean {
  return (
    overId === MASTER_NAV_PIN_DROP_ID ||
    overId === MASTER_NAV_PIN_EDGE_TOP ||
    overId === MASTER_NAV_PIN_EDGE_BOTTOM ||
    overId.startsWith('pin:')
  );
}

/** An end-of-shelf strip answers with an exact slot; the container only appends. */
export function isPinEdgeOverId(overId: string): boolean {
  return overId === MASTER_NAV_PIN_EDGE_TOP || overId === MASTER_NAV_PIN_EDGE_BOTTOM;
}

export function pinIndexFromOverId(
  overId: string,
  pinIds: readonly string[],
): number | null {
  if (overId === MASTER_NAV_PIN_EDGE_TOP) return 0;
  if (overId === MASTER_NAV_PIN_EDGE_BOTTOM) return pinIds.length;
  if (overId === MASTER_NAV_PIN_DROP_ID) return pinIds.length;
  if (!overId.startsWith('pin:')) return null;
  const id = overId.slice('pin:'.length);
  const idx = pinIds.indexOf(id);
  return idx < 0 ? pinIds.length : idx;
}
