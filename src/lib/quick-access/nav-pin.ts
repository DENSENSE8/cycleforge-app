/**
 * MasterNav pin drop ids — map rows drag *into* the Pinned cluster;
 * pins reorder only inside that cluster.
 */

import {
  isSpineMapTopRow,
  masterNavItemForHref,
} from '@/lib/sidebar-navigation';

export const MASTER_NAV_PIN_DROP_ID = 'master-nav-pin-drop';

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

/** Home and Media Library already sit above Pinned — they are not pin targets. */
export function isStructuralSpinePinHref(href: string): boolean {
  const item = masterNavItemForHref(href);
  return Boolean(item && isSpineMapTopRow(item));
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
