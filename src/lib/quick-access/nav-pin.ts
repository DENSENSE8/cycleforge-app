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
  return overId === MASTER_NAV_PIN_DROP_ID || overId.startsWith('pin:');
}

export function pinIndexFromOverId(
  overId: string,
  pinIds: readonly string[],
): number | null {
  if (overId === MASTER_NAV_PIN_DROP_ID) return pinIds.length;
  if (!overId.startsWith('pin:')) return null;
  const id = overId.slice('pin:'.length);
  const idx = pinIds.indexOf(id);
  return idx < 0 ? pinIds.length : idx;
}
