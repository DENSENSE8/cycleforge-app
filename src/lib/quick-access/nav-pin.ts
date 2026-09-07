/**
 * MasterNav pin drop ids — map rows drag *into* the Pinned cluster;
 * pins reorder only inside that cluster.
 */

import { displaySessionTitle } from '@/lib/ai/session-title-text';
import { masterNavItemForHref } from '@/lib/sidebar-navigation';
import { SESSION_PIN_ICON_KEY, type PinInput, type PinnedPage } from './types';

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
 * The AI session a pin points at (`/?session=<id>`), or `null`.
 *
 * Feature 3 (binding model B) carries the id in `PinnedPage.sessionId`, but the
 * href is the durable fact — an older pin, or one written by hand, has only the
 * query param. Both the pinnability rule and the row's glyph ask this.
 */
export function sessionIdFromPinHref(href: string): string | null {
  try {
    return new URL(href, 'http://local').searchParams.get('session') || null;
  } catch {
    /* not a parseable href — it names no session */
    return null;
  }
}

/**
 * Does this pin name an AI thread? The ONE predicate both pin surfaces ask.
 *
 * Three facts can say so and any one is enough: the binding field, the icon
 * hint, or the href's `session` param. `MasterNavPinnedCluster` and
 * `HeaderPinsSwitcher` each resolve a pin's glyph independently; asking this
 * instead of re-spelling the three-way check is what keeps the header from
 * drifting back to the Home face the spine already stopped painting.
 */
export function isSessionPin(pin: {
  href: string;
  sessionId?: string;
  iconKey?: string;
}): boolean {
  return Boolean(
    pin.sessionId || pin.iconKey === SESSION_PIN_ICON_KEY || sessionIdFromPinHref(pin.href),
  );
}

/**
 * A stored pin, back as a pin WRITE — total over both kinds.
 *
 * The only sanctioned way to re-pin something that is already a `PinnedPage`
 * (undo, drag-back, a future move-between-surfaces). It cannot lose the
 * session binding the way a hand-written `{ href, label, iconKey }` literal
 * did, and it re-sanitizes the label on the way through, so a legacy row that
 * stored raw model markup heals when it is restored rather than persisting the
 * garbage a second time.
 */
export function pinInputFromPinned(pin: PinnedPage): PinInput {
  const sessionId = pin.sessionId || sessionIdFromPinHref(pin.href);
  if (sessionId) {
    return {
      kind: 'session',
      href: pin.href,
      label: displaySessionTitle(pin.label),
      sessionId,
      iconKey: SESSION_PIN_ICON_KEY,
    };
  }
  return { kind: 'page', href: pin.href, label: pin.label, iconKey: pin.iconKey };
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
  // A session pin (`/?session=<id>`) is a real destination — one specific
  // thread — not the generic Home surface, so it stays pinnable even though its
  // pathname resolves to `home` (Feature 3: session pins carry a sessionId).
  if (sessionIdFromPinHref(href)) return false;
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
