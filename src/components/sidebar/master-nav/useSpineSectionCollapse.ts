'use client';

import { useCallback, useEffect, useState } from 'react';

/** Per-device open/closed state for the spine's section disclosures. */
export const SPINE_SECTIONS_OPEN_STORAGE_KEY = 'sidebar-spine-sections-open';

/** Retired 2026-09-15 — closed-id polarity. Wiped on hydrate so leftover `[]` cannot reopen every lane. */
export const SPINE_SECTIONS_CLOSED_STORAGE_KEY_LEGACY = 'sidebar-spine-sections-closed';

export function parseSpineOpenSectionIds(raw: string | null): string[] | null {
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return null;
  }
}

export function useSpineSectionCollapse() {
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let stored: string[] | null = null;
    try {
      stored = parseSpineOpenSectionIds(
        window.localStorage.getItem(SPINE_SECTIONS_OPEN_STORAGE_KEY),
      );
      window.localStorage.removeItem(SPINE_SECTIONS_CLOSED_STORAGE_KEY_LEGACY);
    } catch {
      // Unreadable storage keeps the design default: all folded.
    }
    if (stored) setOpenSections(new Set(stored));
  }, []);

  const setSectionOpen = useCallback((sectionId: string, open: boolean) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (open) next.add(sectionId);
      else next.delete(sectionId);
      try {
        window.localStorage.setItem(
          SPINE_SECTIONS_OPEN_STORAGE_KEY,
          JSON.stringify([...next]),
        );
      } catch {
        // Quota loss forgets the fold, not the current paint.
      }
      return next;
    });
  }, []);

  const isSectionOpen = useCallback(
    (sectionId: string) => openSections.has(sectionId),
    [openSections],
  );

  return { isSectionOpen, setSectionOpen };
}
