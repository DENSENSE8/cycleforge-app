/** DnD ids for desk-tab (page child) order. */

export const NAV_CHILD_DRAG_PREFIX = 'child:';

export type NavChildDragData = {
  type: 'nav-child';
  pageId: string;
  childId: string;
};

export function navChildDragId(pageId: string, childId: string): string {
  return `${NAV_CHILD_DRAG_PREFIX}${pageId}:${childId}`;
}

export function parseNavChildDragId(
  id: string,
): { pageId: string; childId: string } | null {
  if (!id.startsWith(NAV_CHILD_DRAG_PREFIX)) return null;
  const rest = id.slice(NAV_CHILD_DRAG_PREFIX.length);
  const colon = rest.indexOf(':');
  if (colon <= 0 || colon === rest.length - 1) return null;
  return { pageId: rest.slice(0, colon), childId: rest.slice(colon + 1) };
}
