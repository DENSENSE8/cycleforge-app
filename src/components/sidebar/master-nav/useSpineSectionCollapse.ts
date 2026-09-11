'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Per-device open/closed state for the spine's section disclosures.
 *
 * Same call as the spine width (`SIDEBAR_SPINE_RESIZE.storageKey`): view
 * state for this device, not a staff prefs field. The store holds only CLOSED
 * ids so a newly registered section arrives open.
 */
const STORAGE_KEY = 'sidebar-spine-sections-closed';

/**
 * Sections that start folded. Admin is a destination opened on purpose.
 * Stations and Workspaces start open. Sessions is omitted — Wave 2 does not
 * mount a sessions list.
 */
export const SPINE_SECTION_CLOSED_BY_DEFAULT: Record<string, true> = {
  admin: true,
};

export function useSpineSectionCollapse() {
  const [closedSections, setClosedSections] = useState<ReadonlySet<string>>(
    () => new Set(Object.keys(SPINE_SECTION_CLOSED_BY_DEFAULT)),
  );

  useEffect(() => {
    let stored: string[] | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        stored = parsed.filter((id): id is string => typeof id === 'string');
      }
    } catch {
      // Unreadable storage keeps the design defaults.
    }
    if (stored) setClosedSections(new Set(stored));
  }, []);

  const setSectionOpen = useCallback((sectionId: string, open: boolean) => {
    setClosedSections((prev) => {
      const next = new Set(prev);
      if (open) next.delete(sectionId);
      else next.add(sectionId);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Quota loss forgets the fold, not the current paint.
      }
      return next;
    });
  }, []);

  return { closedSections, setSectionOpen };
}
