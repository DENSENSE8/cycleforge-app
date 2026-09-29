'use client';

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { LIST_KEY_OWNER_ATTR } from '@/lib/keyboard/list-key-scope';

/** Stamp only primary destinations and expandable L1 rows, not trailing verbs. */
export const SIDEBAR_NAV_ITEM_ATTR = 'data-sidebar-nav-item';

const NAV_ITEM_SELECTOR = `[${SIDEBAR_NAV_ITEM_ATTR}]:not([disabled]):not([aria-disabled="true"])`;
const LIST_KEY_OWNER_SELECTOR = `[${LIST_KEY_OWNER_ATTR}]`;

type SidebarNavElement = HTMLAnchorElement | HTMLButtonElement;

function isAvailable(element: SidebarNavElement, root: HTMLElement): boolean {
  let cursor: HTMLElement | null = element;
  while (cursor && cursor !== root) {
    if (
      cursor.hidden ||
      cursor.getAttribute('aria-hidden') === 'true' ||
      cursor.style.display === 'none' ||
      cursor.style.visibility === 'hidden'
    ) {
      return false;
    }
    cursor = cursor.parentElement;
  }
  return true;
}

function navigationItems(root: HTMLElement): SidebarNavElement[] {
  return Array.from(root.querySelectorAll<SidebarNavElement>(NAV_ITEM_SELECTOR)).filter((item) =>
    isAvailable(item, root),
  );
}

function controlledChild(
  root: HTMLElement,
  trigger: SidebarNavElement,
  items: readonly SidebarNavElement[],
): SidebarNavElement | null {
  const controls = trigger.getAttribute('aria-controls');
  if (!controls) return null;
  const region = document.getElementById(controls);
  if (!region || !root.contains(region)) return null;
  return items.find((item) => region.contains(item)) ?? null;
}

function controllingParent(
  root: HTMLElement,
  item: SidebarNavElement,
  items: readonly SidebarNavElement[],
): SidebarNavElement | null {
  return (
    items.find((candidate) => {
      const controls = candidate.getAttribute('aria-controls');
      const region = controls ? document.getElementById(controls) : null;
      return region !== null && root.contains(region) && region.contains(item);
    }) ?? null
  );
}

/**
 * Shared keyboard contract for both sidebar renderers.
 *
 * - Up / Down: walk visible destinations without wrapping.
 * - Home / End: jump to the first / last visible destination.
 * - Right: open a collapsed parent, then enter its first child.
 * - Left: collapse an open parent, or return from a child to its parent.
 *
 * Tab keeps its native behavior and Enter / Space keep native button/link
 * semantics. Search remains the command palette's responsibility (Cmd/Ctrl K).
 */
export function handleSidebarNavigationKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

  const root = event.currentTarget;
  const target = event.target instanceof Element
    ? event.target.closest<SidebarNavElement>(NAV_ITEM_SELECTOR)
    : null;
  if (!target || !root.contains(target)) return;

  // An open switcher/menu is a nested list-key owner and keeps its own arrows.
  const nearestOwner = target.closest(LIST_KEY_OWNER_SELECTOR);
  if (nearestOwner && nearestOwner !== root) return;

  const items = navigationItems(root);
  const at = items.indexOf(target);
  if (at < 0) return;

  let destination: SidebarNavElement | null = null;
  if (event.key === 'ArrowDown') destination = items[Math.min(at + 1, items.length - 1)] ?? null;
  else if (event.key === 'ArrowUp') destination = items[Math.max(at - 1, 0)] ?? null;
  else if (event.key === 'Home') destination = items[0] ?? null;
  else if (event.key === 'End') destination = items.at(-1) ?? null;
  else if (event.key === 'ArrowRight') {
    const expanded = target.getAttribute('aria-expanded');
    if (expanded === 'false') {
      event.preventDefault();
      target.click();
      return;
    }
    if (expanded === 'true') destination = controlledChild(root, target, items);
    else return;
  } else if (event.key === 'ArrowLeft') {
    if (target.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      target.click();
      return;
    }
    destination = controllingParent(root, target, items);
    if (!destination) return;
  } else return;

  event.preventDefault();
  destination?.focus({ preventScroll: true });
  destination?.scrollIntoView?.({ block: 'nearest' });
}
