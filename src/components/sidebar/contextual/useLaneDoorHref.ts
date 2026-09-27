'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { NavContext } from '@/lib/nav/context/schema';
import { useNavStaffKey } from './useNavContext';
import { isNavModeSection } from './NavModeSwitcher';

/**
 * Lane doors that reopen the staffer's last view, keyed by landing page id,
 * with the view a first visit lands on. The page map row (`NavSectionList`)
 * and the legacy spine door (`SidebarNavList.renderLane`) both read it.
 */
const LANE_DOOR_FIRST_VIEW: Readonly<Record<string, string>> = {
  outbound: '/shipping/exceptions',
};

const storageKey = (pageId: string, staffKey: string) => `nav.lastView.${pageId}.${staffKey}`;

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readStored(pageId: string, staffKey: string): string | null {
  try {
    const href = window.localStorage.getItem(storageKey(pageId, staffKey));
    // Only an in-app path; anything else falls back to the first view.
    return href && href.startsWith('/') && !href.startsWith('//') ? href : null;
  } catch {
    return null;
  }
}

/** One string per staffer so `useSyncExternalStore` compares by value. */
function snapshot(staffKey: string): string {
  return JSON.stringify(Object.keys(LANE_DOOR_FIRST_VIEW).map((pageId) => readStored(pageId, staffKey)));
}

/**
 * `doorHref(pageId)` — where a lane door for `pageId` opens: the staffer's
 * last view there, else the first view; `null` for a page that is not a
 * remembering door (the caller keeps its own href). The server render and
 * hydration use the first view, then the stored one paints.
 */
export function useLaneDoorHref(): (pageId: string) => string | null {
  const staffKey = useNavStaffKey();
  const stored = useSyncExternalStore(
    subscribe,
    () => snapshot(staffKey),
    () => '',
  );
  return useCallback(
    (pageId: string) => {
      const first = LANE_DOOR_FIRST_VIEW[pageId];
      if (first === undefined) return null;
      const index = Object.keys(LANE_DOOR_FIRST_VIEW).indexOf(pageId);
      const remembered = stored ? (JSON.parse(stored) as (string | null)[])[index] : null;
      return remembered ?? first;
    },
    [stored],
  );
}

/** Records the lit view of a remembering door's page panel as its last view. */
export function useRememberLaneView(nav: NavContext | undefined): void {
  const staffKey = useNavStaffKey();
  const pageId = nav?.scope === 'section' ? nav.page.id : undefined;
  const href =
    pageId !== undefined && LANE_DOOR_FIRST_VIEW[pageId] !== undefined
      ? nav?.sections.filter((section) => !isNavModeSection(section)).flatMap((section) => section.items).find((item) => item.active)?.href
      : undefined;
  useEffect(() => {
    if (!pageId || !href || staffKey === 'anon') return;
    try {
      const key = storageKey(pageId, staffKey);
      if (window.localStorage.getItem(key) === href) return;
      window.localStorage.setItem(key, href);
    } catch {
      return;
    }
    for (const listener of listeners) listener();
  }, [pageId, href, staffKey]);
}
